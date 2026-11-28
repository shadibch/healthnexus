import { createHash, randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, eq, gte, ilike, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  appointmentsTable,
  appointmentHistoryTable,
  clinicSettingsTable,
  conversations,
  db,
  doctorsTable,
  doctorCategoriesTable,
  doctorSchedulesTable,
  doctorUnavailablePeriodsTable,
  patientsTable,
  whatsappAuditLogsTable,
  whatsappIntegrationsTable,
  whatsappBookingRequestsTable,
  whatsappWebhookEventsTable,
} from "@workspace/db";
import { getDb } from "../lib/tenant";
import {
  getWhatsappIntegration,
  integrationRequired,
  requireClinicAdmin,
} from "../lib/whatsapp-auth";
import { logger } from "../lib/logger";
import { addLocalDays, configuredTimeZone, localTimeToUtc, minutesOfDay, partsInTimeZone, localDateText, SchedulingError, validTimeZone, validateAndLockSlot } from "../lib/scheduling";
import { findNearestWithAvailability, weekdayOfDate } from "../lib/whatsapp-time";
import { normalizeWhatsappPhone } from "../lib/whatsapp-phone";

const router: IRouter = Router();

const LANGUAGES = ["ar", "en", "ur"] as const;
const STAGES = [
  "new_conversation", "identifying_intent", "awaiting_specialty", "awaiting_date",
  "checking_availability", "awaiting_slot_selection", "awaiting_patient_name",
  "awaiting_patient_confirmation", "booking_in_progress", "booking_completed",
  "awaiting_cancellation_confirmation", "awaiting_reschedule_date",
  "awaiting_reschedule_slot", "human_handover", "completed",
] as const;
const INTENTS = ["book_appointment", "cancel_appointment", "reschedule_appointment", "check_appointments", "other"] as const;
const CONVERSATION_TTL_HOURS = Math.min(168, Math.max(1, Number(process.env.WHATSAPP_CONVERSATION_TTL_HOURS) || 24));
const BOOKABLE_STATUSES = ["scheduled", "confirmed", "in_progress"] as const;

function ok(res: Response, data: unknown, status = 200, message = "Operation completed successfully"): void {
  res.status(status).json({ success: true, data, message });
}

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function integration(res: Response) {
  if (!integrationRequired(res)) return null;
  return getWhatsappIntegration(res);
}

function clinicAdmin(req: Request, res: Response): { userId: number; medicalCenterId: number } | null {
  return requireClinicAdmin(req, res);
}

async function doctorBelongsToClinic(doctorId: number, centerId: number): Promise<boolean> {
  const [doctor] = await getDb().select({ id: doctorsTable.id }).from(doctorsTable).where(and(
    eq(doctorsTable.id, doctorId),
    or(isNull(doctorsTable.medicalCenterId), eq(doctorsTable.medicalCenterId, centerId))!,
  )).limit(1);
  return !!doctor;
}

async function lockDoctorSchedule(tx: any, doctorIds: number[]): Promise<void> {
  for (const doctorId of [...new Set(doctorIds)].sort((a, b) => a - b)) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':' || ${doctorId}::text))`);
  }
}

function validDate(value: string): boolean {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseCenterId(raw: unknown, expectedCenterId: number): number | null {
  const requested = z.coerce.number().int().positive().safeParse(raw);
  if (!requested.success || requested.data !== expectedCenterId) return null;
  return requested.data;
}

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function audit(
  res: Response,
  action: string,
  entityType: string,
  entityId: number | null,
  requestId?: string | null,
): Promise<void> {
  const auth = getWhatsappIntegration(res);
  if (!auth) return;
  try {
    await db.insert(whatsappAuditLogsTable).values({
      integrationId: auth.id,
      medicalCenterId: auth.medicalCenterId,
      action,
      entityType,
      entityId,
      requestId: requestId ?? null,
    });
  } catch (error) {
    logger.error({ errorName: error instanceof Error ? error.name : "unknown", integrationId: auth.id, action, entityType }, "WhatsApp audit insert failed");
  }
}

const credentialCreateBody = z.object({
  name: z.string().trim().min(2).max(100),
  expires_at: z.string().datetime({ offset: true }).optional(),
});

router.get("/credentials", async (req, res): Promise<void> => {
  const admin = requireClinicAdmin(req, res);
  if (!admin) return;
  const credentials = await db.select({
    id: whatsappIntegrationsTable.id,
    name: whatsappIntegrationsTable.name,
    tokenPrefix: whatsappIntegrationsTable.tokenPrefix,
    createdAt: whatsappIntegrationsTable.createdAt,
    expiresAt: whatsappIntegrationsTable.expiresAt,
    revokedAt: whatsappIntegrationsTable.revokedAt,
  }).from(whatsappIntegrationsTable)
    .where(eq(whatsappIntegrationsTable.medicalCenterId, admin.medicalCenterId))
    .orderBy(whatsappIntegrationsTable.createdAt);
  ok(res, { credentials });
});

router.post("/credentials", async (req, res): Promise<void> => {
  const admin = requireClinicAdmin(req, res);
  if (!admin) return;
  const parsed = credentialCreateBody.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, "INVALID_REQUEST", "A credential name and optional ISO expiration date are required");
    return;
  }
  const expiresAt = parsed.data.expires_at ? new Date(parsed.data.expires_at) : null;
  if (expiresAt && expiresAt <= new Date()) {
    fail(res, 400, "INVALID_EXPIRATION", "Credential expiration must be in the future");
    return;
  }
  const token = `hnwa_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [created] = await db.insert(whatsappIntegrationsTable).values({
    medicalCenterId: admin.medicalCenterId,
    name: parsed.data.name,
    tokenHash,
    tokenPrefix: token.slice(0, 12),
    expiresAt,
    createdByUserId: admin.userId,
  }).returning({
    id: whatsappIntegrationsTable.id,
    name: whatsappIntegrationsTable.name,
    tokenPrefix: whatsappIntegrationsTable.tokenPrefix,
    expiresAt: whatsappIntegrationsTable.expiresAt,
    createdAt: whatsappIntegrationsTable.createdAt,
  });
  ok(res, { ...created, token }, 201, "Credential created. Copy the token now; it will not be shown again.");
});

router.delete("/credentials/:id", async (req, res): Promise<void> => {
  const admin = requireClinicAdmin(req, res);
  if (!admin) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) {
    fail(res, 400, "INVALID_CREDENTIAL_ID", "Credential ID must be a positive integer");
    return;
  }
  const [revoked] = await db.update(whatsappIntegrationsTable)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(whatsappIntegrationsTable.id, id.data),
      eq(whatsappIntegrationsTable.medicalCenterId, admin.medicalCenterId),
      isNull(whatsappIntegrationsTable.revokedAt),
    ))
    .returning({ id: whatsappIntegrationsTable.id });
  if (!revoked) {
    fail(res, 404, "CREDENTIAL_NOT_FOUND", "Active credential not found");
    return;
  }
  ok(res, { id: revoked.id, revoked: true });
});

const scheduleRuleBody = z.object({
  doctor_id: z.coerce.number().int().positive(),
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  slot_duration_minutes: z.coerce.number().int().min(5).max(240),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  effective_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.get("/schedule-rules", async (req, res): Promise<void> => {
  const admin = clinicAdmin(req, res);
  if (!admin) return;
  const doctorId = req.query.doctor_id == null ? undefined : z.coerce.number().int().positive().safeParse(req.query.doctor_id);
  if (doctorId && !doctorId.success) {
    fail(res, 400, "INVALID_DOCTOR_ID", "doctor_id must be a positive integer");
    return;
  }
  const rules = await getDb().select().from(doctorSchedulesTable)
    .where(doctorId ? eq(doctorSchedulesTable.doctorId, doctorId.data) : undefined)
    .orderBy(doctorSchedulesTable.doctorId, doctorSchedulesTable.dayOfWeek, doctorSchedulesTable.startTime);
  ok(res, { schedule_rules: rules });
});

router.post("/schedule-rules", async (req, res): Promise<void> => {
  const admin = clinicAdmin(req, res);
  if (!admin) return;
  const parsed = scheduleRuleBody.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, "INVALID_SCHEDULE_RULE", "Provide a doctor, weekday (0 Sunday–6 Saturday), local times, duration, and optional effective dates");
    return;
  }
  const rule = parsed.data;
  if (!await doctorBelongsToClinic(rule.doctor_id, admin.medicalCenterId)) {
    fail(res, 404, "DOCTOR_NOT_FOUND", "Doctor not found in this clinic");
    return;
  }
  if (rule.start_time >= rule.end_time
    || (rule.effective_from && !validDate(rule.effective_from))
    || (rule.effective_until && !validDate(rule.effective_until))
    || (rule.effective_from && rule.effective_until && rule.effective_from > rule.effective_until)) {
    fail(res, 400, "INVALID_SCHEDULE_RULE", "The end time and effective date range must follow the start");
    return;
  }
  const created = await getDb().transaction(async (tx) => {
    await lockDoctorSchedule(tx, [rule.doctor_id]);
    const existing = await tx.select().from(doctorSchedulesTable).where(and(
      eq(doctorSchedulesTable.doctorId, rule.doctor_id),
      eq(doctorSchedulesTable.dayOfWeek, rule.day_of_week),
    ));
    const overlaps = existing.some((current) => {
      const datesOverlap = (!rule.effective_until || !current.effectiveFrom || current.effectiveFrom <= rule.effective_until)
        && (!current.effectiveUntil || !rule.effective_from || rule.effective_from <= current.effectiveUntil);
      return datesOverlap && minutesOfDay(rule.start_time) < minutesOfDay(current.endTime)
        && minutesOfDay(rule.end_time) > minutesOfDay(current.startTime);
    });
    if (overlaps) return null;
    const [row] = await tx.insert(doctorSchedulesTable).values({
      doctorId: rule.doctor_id,
      dayOfWeek: rule.day_of_week,
      startTime: `${rule.start_time}:00`,
      endTime: `${rule.end_time}:00`,
      slotDurationMinutes: rule.slot_duration_minutes,
      effectiveFrom: rule.effective_from ?? null,
      effectiveUntil: rule.effective_until ?? null,
    }).returning();
    return row;
  });
  if (!created) {
    fail(res, 409, "SCHEDULE_RULE_OVERLAP", "This rule overlaps another active schedule for the doctor");
    return;
  }
  ok(res, { schedule_rule: created }, 201);
});

router.patch("/schedule-rules/:id", async (req, res): Promise<void> => {
  const admin = clinicAdmin(req, res);
  if (!admin) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = scheduleRuleBody.safeParse(req.body);
  if (!id.success || !parsed.success) {
    fail(res, 400, "INVALID_SCHEDULE_RULE", "Provide a valid rule ID and complete schedule rule");
    return;
  }
  const rule = parsed.data;
  if (!await doctorBelongsToClinic(rule.doctor_id, admin.medicalCenterId)) {
    fail(res, 404, "DOCTOR_NOT_FOUND", "Doctor not found in this clinic");
    return;
  }
  if (rule.start_time >= rule.end_time
    || (rule.effective_from && !validDate(rule.effective_from))
    || (rule.effective_until && !validDate(rule.effective_until))
    || (rule.effective_from && rule.effective_until && rule.effective_from > rule.effective_until)) {
    fail(res, 400, "INVALID_SCHEDULE_RULE", "The end time and effective date range must follow the start");
    return;
  }
  const [currentRule] = await getDb().select().from(doctorSchedulesTable).where(eq(doctorSchedulesTable.id, id.data)).limit(1);
  if (!currentRule) {
    fail(res, 404, "SCHEDULE_RULE_NOT_FOUND", "Schedule rule not found");
    return;
  }
  const updated = await getDb().transaction(async (tx) => {
    await lockDoctorSchedule(tx, [currentRule.doctorId, rule.doctor_id]);
    const existing = await tx.select().from(doctorSchedulesTable).where(and(
      eq(doctorSchedulesTable.doctorId, rule.doctor_id),
      eq(doctorSchedulesTable.dayOfWeek, rule.day_of_week),
    ));
    const overlaps = existing.some((current) => {
      if (current.id === id.data) return false;
      const datesOverlap = (!rule.effective_until || !current.effectiveFrom || current.effectiveFrom <= rule.effective_until)
        && (!current.effectiveUntil || !rule.effective_from || rule.effective_from <= current.effectiveUntil);
      return datesOverlap && minutesOfDay(rule.start_time) < minutesOfDay(current.endTime)
        && minutesOfDay(rule.end_time) > minutesOfDay(current.startTime);
    });
    if (overlaps) return null;
    const [row] = await tx.update(doctorSchedulesTable).set({
      doctorId: rule.doctor_id,
      dayOfWeek: rule.day_of_week,
      startTime: `${rule.start_time}:00`,
      endTime: `${rule.end_time}:00`,
      slotDurationMinutes: rule.slot_duration_minutes,
      effectiveFrom: rule.effective_from ?? null,
      effectiveUntil: rule.effective_until ?? null,
    }).where(eq(doctorSchedulesTable.id, id.data)).returning();
    return row;
  });
  if (!updated) {
    fail(res, 409, "SCHEDULE_RULE_OVERLAP", "This rule overlaps another active schedule for the doctor");
    return;
  }
  ok(res, { schedule_rule: updated });
});

router.delete("/schedule-rules/:id", async (req, res): Promise<void> => {
  const admin = clinicAdmin(req, res);
  if (!admin) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) {
    fail(res, 400, "INVALID_SCHEDULE_ID", "Schedule rule ID must be a positive integer");
    return;
  }
  const [rule] = await getDb().select().from(doctorSchedulesTable).where(eq(doctorSchedulesTable.id, id.data)).limit(1);
  if (!rule) {
    fail(res, 404, "SCHEDULE_RULE_NOT_FOUND", "Schedule rule not found");
    return;
  }
  const deleted = await getDb().transaction(async (tx) => {
    await lockDoctorSchedule(tx, [rule.doctorId]);
    const [futureAppointment] = await tx.select({ id: appointmentsTable.id }).from(appointmentsTable).where(and(
      eq(appointmentsTable.doctorId, rule.doctorId),
      gte(appointmentsTable.scheduledAt, new Date()),
      notInArray(appointmentsTable.status, ["cancelled", "no_show"]),
    )).limit(1);
    if (futureAppointment) return false;
    await tx.delete(doctorSchedulesTable).where(eq(doctorSchedulesTable.id, id.data));
    return true;
  });
  if (!deleted) {
    fail(res, 409, "FUTURE_APPOINTMENTS_EXIST", "This schedule cannot be deleted while the doctor has active future appointments");
    return;
  }
  await getDb().delete(doctorSchedulesTable).where(eq(doctorSchedulesTable.id, id.data));
  ok(res, { id: id.data, deleted: true });
});

const unavailableBody = z.object({
  doctor_id: z.coerce.number().int().positive().nullable().optional(),
  kind: z.enum(["break", "leave", "holiday", "clinic_closure"]),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(250).optional(),
});

router.get("/unavailable-periods", async (req, res): Promise<void> => {
  if (!clinicAdmin(req, res)) return;
  const periods = await getDb().select().from(doctorUnavailablePeriodsTable)
    .orderBy(doctorUnavailablePeriodsTable.startsAt).limit(500);
  ok(res, { unavailable_periods: periods });
});

router.post("/unavailable-periods", async (req, res): Promise<void> => {
  const admin = clinicAdmin(req, res);
  if (!admin) return;
  const parsed = unavailableBody.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, "INVALID_UNAVAILABLE_PERIOD", "Provide kind, start, end, and optionally a doctor and reason");
    return;
  }
  const data = parsed.data;
  const startsAt = new Date(data.starts_at);
  const endsAt = new Date(data.ends_at);
  if (startsAt >= endsAt || startsAt <= new Date()) {
    fail(res, 400, "INVALID_UNAVAILABLE_PERIOD", "The period must end after its future start time");
    return;
  }
  if (data.doctor_id != null && !await doctorBelongsToClinic(data.doctor_id, admin.medicalCenterId)) {
    fail(res, 404, "DOCTOR_NOT_FOUND", "Doctor not found in this clinic");
    return;
  }
  const created = await getDb().transaction(async (tx) => {
    const doctors = data.doctor_id == null
      ? await tx.select({ id: doctorsTable.id }).from(doctorsTable)
      : [{ id: data.doctor_id }];
    await lockDoctorSchedule(tx, doctors.map((doctor) => doctor.id));
    const appointmentFilter = [
      notInArray(appointmentsTable.status, ["cancelled", "no_show"]),
      sql`${appointmentsTable.scheduledAt} < ${endsAt} AND (${appointmentsTable.scheduledAt} + (${appointmentsTable.durationMinutes} * interval '1 minute')) > ${startsAt}`,
    ];
    if (data.doctor_id != null) appointmentFilter.push(eq(appointmentsTable.doctorId, data.doctor_id));
    const [conflict] = await tx.select({ id: appointmentsTable.id }).from(appointmentsTable)
      .where(and(...appointmentFilter)).limit(1);
    if (conflict) return null;
    const [row] = await tx.insert(doctorUnavailablePeriodsTable).values({
      doctorId: data.doctor_id ?? null,
      kind: data.kind,
      startsAt,
      endsAt,
      reason: data.reason ?? null,
    }).returning();
    return row;
  });
  if (!created) {
    fail(res, 409, "ACTIVE_APPOINTMENTS_OVERLAP", "This unavailable period overlaps an existing appointment");
    return;
  }
  ok(res, { unavailable_period: created }, 201);
});

router.delete("/unavailable-periods/:id", async (req, res): Promise<void> => {
  if (!clinicAdmin(req, res)) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) {
    fail(res, 400, "INVALID_PERIOD_ID", "Period ID must be a positive integer");
    return;
  }
  const [deleted] = await getDb().delete(doctorUnavailablePeriodsTable)
    .where(eq(doctorUnavailablePeriodsTable.id, id.data)).returning({ id: doctorUnavailablePeriodsTable.id });
  if (!deleted) {
    fail(res, 404, "UNAVAILABLE_PERIOD_NOT_FOUND", "Unavailable period not found");
    return;
  }
  ok(res, { id: deleted.id, deleted: true });
});

router.patch("/time-zone", async (req, res): Promise<void> => {
  const admin = clinicAdmin(req, res);
  if (!admin) return;
  const parsed = z.object({ time_zone: z.string().trim().min(1).max(100) }).safeParse(req.body);
  if (!parsed.success || !validTimeZone(parsed.data.time_zone)) {
    fail(res, 400, "INVALID_TIME_ZONE", "Provide a valid IANA timezone such as Asia/Qatar or Asia/Dubai");
    return;
  }
  const saved = await getDb().transaction(async (tx) => {
    const doctors = await tx.select({ id: doctorsTable.id }).from(doctorsTable);
    await lockDoctorSchedule(tx, doctors.map((doctor) => doctor.id));
    const [setting] = await tx.select({ id: clinicSettingsTable.id, timeZone: clinicSettingsTable.timeZone })
      .from(clinicSettingsTable).limit(1);
    if (setting?.timeZone === parsed.data.time_zone) return true;
    const [futureAppointment] = await tx.select({ id: appointmentsTable.id }).from(appointmentsTable).where(and(
      gte(appointmentsTable.scheduledAt, new Date()),
      notInArray(appointmentsTable.status, ["cancelled", "no_show"]),
    )).limit(1);
    if (futureAppointment) return false;
    if (setting) {
      await tx.update(clinicSettingsTable).set({ timeZone: parsed.data.time_zone }).where(eq(clinicSettingsTable.id, setting.id));
    } else {
      await tx.insert(clinicSettingsTable).values({
        clinicName: "HealthNexus Medical Center",
        currency: "AED",
        timeZone: parsed.data.time_zone,
      });
    }
    return true;
  });
  if (!saved) {
    fail(res, 409, "FUTURE_APPOINTMENTS_EXIST", "The clinic timezone cannot change while active future appointments exist");
    return;
  }
  ok(res, { time_zone: parsed.data.time_zone });
});

router.get("/patients/lookup", async (req, res): Promise<void> => {
  const auth = integration(res);
  if (!auth) return;
  if (!parseCenterId(req.query.medical_center_id, auth.medicalCenterId)) {
    fail(res, 403, "TENANT_MISMATCH", "The requested medical center does not match this credential");
    return;
  }
  const rawPhone = z.string().min(1).max(40).safeParse(req.query.phone);
  if (!rawPhone.success) {
    fail(res, 400, "INVALID_PHONE", "phone is required");
    return;
  }
  const phone = normalizeWhatsappPhone(rawPhone.data);
  if (!phone) {
    fail(res, 400, "INVALID_PHONE", "Provide an international phone number with country code");
    return;
  }
  const [patient] = await getDb().select({
    id: patientsTable.id,
    firstName: patientsTable.firstName,
    lastName: patientsTable.lastName,
    phone: patientsTable.phone,
  }).from(patientsTable).where(and(
    sql`regexp_replace(coalesce(${patientsTable.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits(phone)}`,
    or(isNull(patientsTable.medicalCenterId), eq(patientsTable.medicalCenterId, auth.medicalCenterId)),
  )).limit(1);
  ok(res, patient
    ? { patient: { id: patient.id, first_name: patient.firstName, last_name: patient.lastName }, registered: true }
    : { patient: null, registered: false });
});

const patientCreateBody = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  phone: z.string().min(1).max(40),
  medical_center_id: z.unknown(),
  consent: z.literal(true),
  email: z.string().trim().email().max(254).optional(),
});

router.post("/patients", async (req, res): Promise<void> => {
  const auth = integration(res);
  if (!auth) return;
  const parsed = patientCreateBody.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, "INVALID_REQUEST", "first_name, last_name, phone, medical_center_id, and consent: true are required");
    return;
  }
  if (!parseCenterId(parsed.data.medical_center_id, auth.medicalCenterId)) {
    fail(res, 403, "TENANT_MISMATCH", "The requested medical center does not match this credential");
    return;
  }
  const phone = normalizeWhatsappPhone(parsed.data.phone);
  if (!phone) {
    fail(res, 400, "INVALID_PHONE", "Provide an international phone number with country code");
    return;
  }
  try {
    const created = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-patient:${phoneDigits(phone)}`}))`);
      const [duplicate] = await tx.select({ id: patientsTable.id })
        .from(patientsTable)
        .where(and(
          sql`regexp_replace(coalesce(${patientsTable.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits(phone)}`,
          or(isNull(patientsTable.medicalCenterId), eq(patientsTable.medicalCenterId, auth.medicalCenterId)),
        )).limit(1);
      if (duplicate) return { duplicateId: duplicate.id, patient: null };
      const [patient] = await tx.insert(patientsTable).values({
        firstName: parsed.data.first_name,
        lastName: parsed.data.last_name,
        phone,
        medicalCenterId: auth.medicalCenterId,
        email: parsed.data.email ?? null,
      }).returning({ id: patientsTable.id, firstName: patientsTable.firstName, lastName: patientsTable.lastName });
      return { duplicateId: null, patient };
    });
    if (created.duplicateId) {
      fail(res, 409, "PATIENT_ALREADY_REGISTERED", "A patient with this phone number is already registered");
      return;
    }
    await audit(res, "patient.register", "patient", created.patient!.id);
    ok(res, { patient: { id: created.patient!.id }, registered: true }, 201);
  } catch (error) {
    logger.error({ errorName: error instanceof Error ? error.name : "unknown", integrationId: auth.id }, "WhatsApp patient registration failed");
    fail(res, 500, "PATIENT_REGISTRATION_FAILED", "Patient registration could not be completed");
  }
});

router.get("/doctors", async (req, res): Promise<void> => {
  const auth = integration(res);
  if (!auth) return;
  if (!parseCenterId(req.query.medical_center_id, auth.medicalCenterId)) {
    fail(res, 403, "TENANT_MISMATCH", "The requested medical center does not match this credential");
    return;
  }
  const query = z.object({
    specialization: z.string().trim().min(1).max(100).optional(),
    category_id: z.coerce.number().int().positive().optional(),
    doctor_id: z.coerce.number().int().positive().optional(),
  }).safeParse(req.query);
  if (!query.success) {
    fail(res, 400, "INVALID_REQUEST", "Invalid doctor search filters");
    return;
  }
  const filters = [eq(doctorsTable.isAvailable, true), or(isNull(doctorsTable.medicalCenterId), eq(doctorsTable.medicalCenterId, auth.medicalCenterId))!];
  if (query.data.category_id) filters.push(eq(doctorsTable.categoryId, query.data.category_id));
  if (query.data.doctor_id) filters.push(eq(doctorsTable.id, query.data.doctor_id));

  let doctors = await getDb().select({
    id: doctorsTable.id,
    firstName: doctorsTable.firstName,
    lastName: doctorsTable.lastName,
    specialization: doctorsTable.specialization,
    categoryId: doctorsTable.categoryId,
  }).from(doctorsTable).where(and(...filters)).limit(200);

  const specialization = query.data.specialization?.toLowerCase();
  if (specialization) {
    if (["gp", "general practice", "general_practice", "general practitioner"].includes(specialization)) {
      const categories = await getDb().select({ id: doctorCategoriesTable.id, name: doctorCategoriesTable.name })
        .from(doctorCategoriesTable)
        .where(or(ilike(doctorCategoriesTable.name, "%general%practice%"), ilike(doctorCategoriesTable.name, "%general%practitioner%")));
      const categoryIds = new Set(categories.map((category) => category.id));
      doctors = doctors.filter((doctor) =>
        /general\s*(practice|practitioner)|\bgp\b/i.test(doctor.specialization)
        || (doctor.categoryId != null && categoryIds.has(doctor.categoryId)),
      );
    } else {
      doctors = doctors.filter((doctor) => doctor.specialization.toLowerCase().includes(specialization));
    }
  }
  ok(res, { doctors: doctors.map((doctor) => ({
    id: doctor.id,
    first_name: doctor.firstName,
    last_name: doctor.lastName,
    specialization: doctor.specialization,
    category_id: doctor.categoryId,
  })) });
});

const availabilityQuery = z.object({
  medical_center_id: z.unknown(),
  doctor_id: z.coerce.number().int().positive().optional(),
  category_id: z.coerce.number().int().positive().optional(),
  specialization: z.string().max(100).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferred_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  duration: z.coerce.number().int().positive().max(240).optional(),
  search_days: z.coerce.number().int().min(0).max(2).optional(),
});

// Limit the database window to three calendar dates for fast availability lookups.
const DEFAULT_AVAILABILITY_SEARCH_DAYS = 2;

router.get("/availability", async (req, res): Promise<void> => {
  const auth = integration(res);
  if (!auth) return;
  const parsed = availabilityQuery.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, "INVALID_REQUEST", "Provide medical_center_id and date as YYYY-MM-DD, with valid optional doctor filters");
    return;
  }
  if (!parseCenterId(parsed.data.medical_center_id, auth.medicalCenterId)) {
    fail(res, 403, "TENANT_MISMATCH", "The requested medical center does not match this credential");
    return;
  }
  if (!validDate(parsed.data.date)) {
    fail(res, 400, "INVALID_DATE", "date must be a real calendar date in YYYY-MM-DD format");
    return;
  }
  try {
    const timeZone = await configuredTimeZone(getDb());
    const requestedDate = parsed.data.date;
    const searchDays = parsed.data.search_days ?? DEFAULT_AVAILABILITY_SEARCH_DAYS;
    const searchDates = Array.from({ length: searchDays + 1 }, (_, offset) => addLocalDays(requestedDate, offset));
    const requestedDayStart = localTimeToUtc(requestedDate, "00:00", timeZone);
    const searchEnd = localTimeToUtc(addLocalDays(searchDates[searchDates.length - 1], 1), "00:00", timeZone);
    if (!requestedDayStart || !searchEnd) {
      fail(res, 400, "INVALID_LOCAL_DATE", "The selected date cannot be represented in the clinic timezone");
      return;
    }

    const doctorFilters = [
      eq(doctorsTable.isAvailable, true),
      or(isNull(doctorsTable.medicalCenterId), eq(doctorsTable.medicalCenterId, auth.medicalCenterId))!,
    ];
    if (parsed.data.doctor_id) doctorFilters.push(eq(doctorsTable.id, parsed.data.doctor_id));
    if (parsed.data.category_id) doctorFilters.push(eq(doctorsTable.categoryId, parsed.data.category_id));
    let doctors = await getDb().select({
      id: doctorsTable.id,
      firstName: doctorsTable.firstName,
      lastName: doctorsTable.lastName,
      specialization: doctorsTable.specialization,
      categoryId: doctorsTable.categoryId,
    }).from(doctorsTable).where(and(...doctorFilters)).limit(200);
    const requestedSpecialty = parsed.data.specialization?.toLowerCase();
    if (requestedSpecialty) {
      if (["gp", "general practice", "general_practice", "general practitioner"].includes(requestedSpecialty)) {
        const categories = await getDb().select({ id: doctorCategoriesTable.id }).from(doctorCategoriesTable)
          .where(or(ilike(doctorCategoriesTable.name, "%general%practice%"), ilike(doctorCategoriesTable.name, "%general%practitioner%")));
        const categoryIds = new Set(categories.map((category) => category.id));
        doctors = doctors.filter((doctor) => /general\s*(practice|practitioner)|\bgp\b/i.test(doctor.specialization)
          || (doctor.categoryId != null && categoryIds.has(doctor.categoryId)));
      } else {
        doctors = doctors.filter((doctor) => doctor.specialization.toLowerCase().includes(requestedSpecialty));
      }
    } else if (!parsed.data.doctor_id && !parsed.data.category_id) {
      // No requested doctor or specialty means GP/general practice by default.
      const categories = await getDb().select({ id: doctorCategoriesTable.id }).from(doctorCategoriesTable)
        .where(or(ilike(doctorCategoriesTable.name, "%general%practice%"), ilike(doctorCategoriesTable.name, "%general%practitioner%")));
      const categoryIds = new Set(categories.map((category) => category.id));
      doctors = doctors.filter((doctor) => /general\s*(practice|practitioner)|\bgp\b/i.test(doctor.specialization)
        || (doctor.categoryId != null && categoryIds.has(doctor.categoryId)));
    }

    if (doctors.length === 0) {
      ok(res, {
        requested_date: requestedDate,
        date: requestedDate,
        nearest_date: null,
        searched_through: requestedDate,
        search_days: searchDays,
        timezone: timeZone,
        available_slots: [],
      });
      return;
    }

    const doctorIds = doctors.map((doctor) => doctor.id);
    const schedules = await getDb().select().from(doctorSchedulesTable).where(inArray(doctorSchedulesTable.doctorId, doctorIds));
    const blocks = await getDb().select().from(doctorUnavailablePeriodsTable).where(and(
      sql`${doctorUnavailablePeriodsTable.startsAt} < ${searchEnd} AND ${doctorUnavailablePeriodsTable.endsAt} > ${requestedDayStart}`,
      or(isNull(doctorUnavailablePeriodsTable.doctorId), inArray(doctorUnavailablePeriodsTable.doctorId, doctorIds)),
    ));
    const booked = await getDb().select({
      id: appointmentsTable.id,
      doctorId: appointmentsTable.doctorId,
      start: appointmentsTable.scheduledAt,
      duration: appointmentsTable.durationMinutes,
    }).from(appointmentsTable).where(and(
      inArray(appointmentsTable.doctorId, doctorIds),
      notInArray(appointmentsTable.status, ["cancelled", "no_show"]),
      sql`${appointmentsTable.scheduledAt} < ${searchEnd} AND (${appointmentsTable.scheduledAt} + (${appointmentsTable.durationMinutes} * interval '1 minute')) > ${requestedDayStart}`,
    ));

    const doctorById = new Map(doctors.map((doctor) => [doctor.id, doctor]));
    const now = new Date();
    const preferredMinutes = parsed.data.preferred_time ? minutesOfDay(parsed.data.preferred_time) : null;
    const searchResult = findNearestWithAvailability(searchDates, (candidateDate) => {
      const dayStart = localTimeToUtc(candidateDate, "00:00", timeZone);
      const dayEnd = localTimeToUtc(addLocalDays(candidateDate, 1), "00:00", timeZone);
      if (!dayStart || !dayEnd) return [];
      const dayOfWeek = weekdayOfDate(candidateDate);
      const dateSlots: Array<{ doctor_id: number; doctor_name: string; start: string; end: string }> = [];
      for (const rule of schedules) {
        if (rule.dayOfWeek !== dayOfWeek
          || (rule.effectiveFrom && candidateDate < rule.effectiveFrom)
          || (rule.effectiveUntil && candidateDate > rule.effectiveUntil)
          || (parsed.data.duration && parsed.data.duration !== rule.slotDurationMinutes)) continue;
        const startMinute = minutesOfDay(rule.startTime);
        const endMinute = minutesOfDay(rule.endTime);
        for (let minute = startMinute; minute + rule.slotDurationMinutes <= endMinute; minute += rule.slotDurationMinutes) {
          if (preferredMinutes != null && minute < preferredMinutes) continue;
          const localTime = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
          const start = localTimeToUtc(candidateDate, localTime, timeZone);
          if (!start || start <= now) continue;
          const end = new Date(start.getTime() + rule.slotDurationMinutes * 60_000);
          const doctor = doctorById.get(rule.doctorId);
          if (!doctor) continue;
          const hasBlock = blocks.some((block) => (!block.doctorId || block.doctorId === rule.doctorId)
            && block.startsAt < end && block.endsAt > start);
          const hasBooking = booked.some((appointment) => appointment.doctorId === rule.doctorId
            && appointment.start < end
            && appointment.start.getTime() + appointment.duration * 60_000 > start.getTime());
          if (hasBlock || hasBooking) continue;
          dateSlots.push({
            doctor_id: doctor.id,
            doctor_name: `Dr. ${doctor.firstName} ${doctor.lastName}`.trim(),
            start: start.toISOString(),
            end: end.toISOString(),
          });
        }
      }
      dateSlots.sort((a, b) => a.start.localeCompare(b.start) || a.doctor_id - b.doctor_id);
      return dateSlots;
    });
    const resolvedDate = searchResult.date;
    const searchedThrough = searchResult.searchedThrough ?? requestedDate;
    const availableSlots = searchResult.available;
    ok(res, {
      requested_date: requestedDate,
      date: resolvedDate ?? requestedDate,
      nearest_date: resolvedDate,
      searched_through: searchedThrough,
      search_days: searchDays,
      timezone: timeZone,
      available_slots: availableSlots,
    });
  } catch (error) {
    if (error instanceof SchedulingError) {
      fail(res, error.code === "SCHEDULING_NOT_CONFIGURED" ? 501 : 400, error.code, error.message);
      return;
    }
    throw error;
  }
});

const bookBody = z.object({
  medical_center_id: z.unknown(),
  patient_id: z.coerce.number().int().positive(),
  doctor_id: z.coerce.number().int().positive(),
  scheduled_at: z.string().datetime({ offset: true }),
  type: z.enum(["routine", "follow_up", "emergency"]).default("routine"),
  source: z.literal("whatsapp").default("whatsapp"),
  whatsapp_number: z.string().min(1).max(40),
  idempotency_key: z.string().trim().min(8).max(255),
  confirmed: z.literal(true),
});

router.post("/appointments", async (req, res): Promise<void> => {
  const auth = integration(res);
  if (!auth) return;
  const parsed = bookBody.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, "CONFIRMATION_REQUIRED", "Provide all appointment fields, idempotency_key, and confirmed: true");
    return;
  }
  if (!parseCenterId(parsed.data.medical_center_id, auth.medicalCenterId)) {
    fail(res, 403, "TENANT_MISMATCH", "The requested medical center does not match this credential");
    return;
  }
  const phone = normalizeWhatsappPhone(parsed.data.whatsapp_number);
  if (!phone) {
    fail(res, 400, "INVALID_PHONE", "Provide an international WhatsApp number with country code");
    return;
  }
  const scheduledAt = new Date(parsed.data.scheduled_at);
  if (scheduledAt <= new Date()) {
    fail(res, 400, "PAST_APPOINTMENT", "Appointments must be scheduled in the future");
    return;
  }
  const requestFingerprint = createHash("sha256").update(JSON.stringify({
    patientId: parsed.data.patient_id,
    doctorId: parsed.data.doctor_id,
    scheduledAt: scheduledAt.toISOString(),
    type: parsed.data.type,
  })).digest("hex");
  try {
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-idempotency:${parsed.data.idempotency_key}`}))`);
      const [priorRequest] = await tx.select().from(whatsappBookingRequestsTable)
        .where(eq(whatsappBookingRequestsTable.idempotencyKey, parsed.data.idempotency_key)).limit(1);
      if (priorRequest) {
        if (priorRequest.requestFingerprint !== requestFingerprint) {
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        }
        const [priorAppointment] = await tx.select().from(appointmentsTable)
          .where(eq(appointmentsTable.id, priorRequest.appointmentId)).limit(1);
        return { appointment: priorAppointment, end: new Date(scheduledAt.getTime() + (priorAppointment?.durationMinutes ?? 30) * 60_000), duplicate: true };
      }

      const [patient] = await tx.select({ id: patientsTable.id }).from(patientsTable).where(and(
        eq(patientsTable.id, parsed.data.patient_id),
        or(isNull(patientsTable.medicalCenterId), eq(patientsTable.medicalCenterId, auth.medicalCenterId))!,
        sql`regexp_replace(coalesce(${patientsTable.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits(phone)}`,
      )).limit(1);
      if (!patient) throw new Error("PATIENT_IDENTITY_MISMATCH");
      const [doctor] = await tx.select({
        id: doctorsTable.id,
        isAvailable: doctorsTable.isAvailable,
        firstName: doctorsTable.firstName,
        lastName: doctorsTable.lastName,
        medicalCenterId: doctorsTable.medicalCenterId,
      }).from(doctorsTable).where(and(
        eq(doctorsTable.id, parsed.data.doctor_id),
        or(isNull(doctorsTable.medicalCenterId), eq(doctorsTable.medicalCenterId, auth.medicalCenterId))!,
      )).limit(1);
      if (!doctor || !doctor.isAvailable) throw new Error("DOCTOR_NOT_BOOKABLE");

      const slot = await validateAndLockSlot(tx, { doctorId: doctor.id, start: scheduledAt });
      const localParts = partsInTimeZone(scheduledAt, slot.timeZone);
      const today = localDateText(partsInTimeZone(new Date(), slot.timeZone));
      let queueNumber: number | null = null;
      if (localDateText(localParts) === today) {
        const dayStart = localTimeToUtc(today, "00:00", slot.timeZone)!;
        const dayEnd = localTimeToUtc(addLocalDays(today, 1), "00:00", slot.timeZone)!;
        const [queue] = await tx.select({ count: sql<number>`count(*)::int` }).from(appointmentsTable).where(and(
          gte(appointmentsTable.scheduledAt, dayStart),
          lte(appointmentsTable.scheduledAt, dayEnd),
          notInArray(appointmentsTable.status, ["cancelled", "no_show"]),
        ));
        queueNumber = (queue?.count ?? 0) + 1;
      }
      const [appointment] = await tx.insert(appointmentsTable).values({
        patientId: patient.id,
        doctorId: doctor.id,
        scheduledAt,
        durationMinutes: slot.durationMinutes,
        source: "whatsapp",
        type: parsed.data.type,
        status: "scheduled",
        queueNumber,
      }).returning();
      await tx.insert(whatsappBookingRequestsTable).values({
        idempotencyKey: parsed.data.idempotency_key,
        requestFingerprint,
        appointmentId: appointment.id,
      });
      await tx.insert(appointmentHistoryTable).values({
        appointmentId: appointment.id,
        action: "booked",
        source: "whatsapp",
        nextDoctorId: doctor.id,
        nextScheduledAt: scheduledAt,
        actorId: auth.id,
      });
      return { appointment, end: slot.end, duplicate: false };
    });
    if (!result.appointment) {
      fail(res, 500, "BOOKING_RESULT_MISSING", "The booking result could not be retrieved");
      return;
    }
    if (!result.duplicate) await audit(res, "appointment.book", "appointment", result.appointment.id, parsed.data.idempotency_key);
    ok(res, {
      appointment: {
        id: result.appointment.id,
        patient_id: result.appointment.patientId,
        doctor_id: result.appointment.doctorId,
        scheduled_at: result.appointment.scheduledAt,
        ends_at: result.end,
        duration_minutes: result.appointment.durationMinutes,
        status: result.appointment.status,
        type: result.appointment.type,
        source: result.appointment.source,
      },
      duplicate: result.duplicate,
    }, result.duplicate ? 200 : 201);
  } catch (error) {
    if (error instanceof SchedulingError) {
      fail(res, error.code === "SCHEDULING_NOT_CONFIGURED" ? 501 : 409, error.code, error.message);
      return;
    }
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_REUSED") {
      fail(res, 409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different booking request");
      return;
    }
    if (error instanceof Error && error.message === "PATIENT_IDENTITY_MISMATCH") {
      fail(res, 403, error.message, "The patient record does not match this WhatsApp number");
      return;
    }
    if (error instanceof Error && error.message === "DOCTOR_NOT_BOOKABLE") {
      fail(res, 404, "DOCTOR_NOT_BOOKABLE", "Doctor not found or is unavailable for booking");
      return;
    }
    if (error instanceof Error && error.message.includes("timezone")) {
      fail(res, 501, "SCHEDULING_NOT_CONFIGURED", error.message);
      return;
    }
    logger.error({ errorName: error instanceof Error ? error.name : "unknown", integrationId: auth.id }, "WhatsApp appointment booking failed");
    fail(res, 500, "BOOKING_FAILED", "Appointment booking could not be completed");
  }
});

const appointmentListQuery = z.object({
  patient_id: z.coerce.number().int().positive(),
  medical_center_id: z.unknown(),
  whatsapp_number: z.string().min(1).max(40),
  status: z.enum(["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"]).optional(),
  from_date: z.string().datetime({ offset: true }).optional(),
  to_date: z.string().datetime({ offset: true }).optional(),
});

async function verifyPatientNumber(patientId: number, centerId: number, phone: string): Promise<boolean> {
  const [patient] = await getDb().select({ id: patientsTable.id }).from(patientsTable).where(and(
    eq(patientsTable.id, patientId),
    or(isNull(patientsTable.medicalCenterId), eq(patientsTable.medicalCenterId, centerId))!,
    sql`regexp_replace(coalesce(${patientsTable.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits(phone)}`,
  )).limit(1);
  return !!patient;
}

router.get("/appointments", async (req, res): Promise<void> => {
  const auth = integration(res);
  if (!auth) return;
  const parsed = appointmentListQuery.safeParse(req.query);
  if (!parsed.success) {
    fail(res, 400, "INVALID_REQUEST", "patient_id, medical_center_id, and whatsapp_number are required");
    return;
  }
  if (!parseCenterId(parsed.data.medical_center_id, auth.medicalCenterId)) {
    fail(res, 403, "TENANT_MISMATCH", "The requested medical center does not match this credential");
    return;
  }
  const phone = normalizeWhatsappPhone(parsed.data.whatsapp_number);
  if (!phone || !await verifyPatientNumber(parsed.data.patient_id, auth.medicalCenterId, phone)) {
    fail(res, 403, "PATIENT_IDENTITY_MISMATCH", "The patient record does not match this WhatsApp number");
    return;
  }
  const filters = [eq(appointmentsTable.patientId, parsed.data.patient_id)];
  if (parsed.data.status) filters.push(eq(appointmentsTable.status, parsed.data.status));
  if (parsed.data.from_date) filters.push(gte(appointmentsTable.scheduledAt, new Date(parsed.data.from_date)));
  if (parsed.data.to_date) filters.push(lte(appointmentsTable.scheduledAt, new Date(parsed.data.to_date)));
  const rows = await getDb().select({
    id: appointmentsTable.id,
    scheduledAt: appointmentsTable.scheduledAt,
    status: appointmentsTable.status,
    type: appointmentsTable.type,
    doctorId: appointmentsTable.doctorId,
    doctorFirstName: doctorsTable.firstName,
    doctorLastName: doctorsTable.lastName,
  }).from(appointmentsTable)
    .leftJoin(doctorsTable, eq(appointmentsTable.doctorId, doctorsTable.id))
    .where(and(...filters))
    .orderBy(appointmentsTable.scheduledAt)
    .limit(100);
  ok(res, { appointments: rows.map((appointment) => ({
    id: appointment.id,
    scheduled_at: appointment.scheduledAt,
    status: appointment.status,
    type: appointment.type,
    doctor: appointment.doctorFirstName ? {
      id: appointment.doctorId,
      name: `Dr. ${appointment.doctorFirstName} ${appointment.doctorLastName ?? ""}`.trim(),
    } : { id: appointment.doctorId, name: null },
  })) });
});

const cancelBody = z.object({
  medical_center_id: z.unknown(),
  patient_id: z.coerce.number().int().positive(),
  whatsapp_number: z.string().min(1).max(40),
  confirm: z.literal(true),
});

router.post("/appointments/:id/cancel", async (req, res): Promise<void> => {
  const auth = integration(res);
  if (!auth) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = cancelBody.safeParse(req.body);
  if (!id.success || !parsed.success) {
    fail(res, 400, "CONFIRMATION_REQUIRED", "Provide valid patient information and confirm: true to cancel");
    return;
  }
  if (!parseCenterId(parsed.data.medical_center_id, auth.medicalCenterId)) {
    fail(res, 403, "TENANT_MISMATCH", "The requested medical center does not match this credential");
    return;
  }
  const phone = normalizeWhatsappPhone(parsed.data.whatsapp_number);
  if (!phone || !await verifyPatientNumber(parsed.data.patient_id, auth.medicalCenterId, phone)) {
    fail(res, 403, "PATIENT_IDENTITY_MISMATCH", "The patient record does not match this WhatsApp number");
    return;
  }
  const [appointment] = await getDb().select({
    id: appointmentsTable.id,
    patientId: appointmentsTable.patientId,
    scheduledAt: appointmentsTable.scheduledAt,
    status: appointmentsTable.status,
  }).from(appointmentsTable).where(and(
    eq(appointmentsTable.id, id.data),
    eq(appointmentsTable.patientId, parsed.data.patient_id),
  )).limit(1);
  if (!appointment) {
    fail(res, 404, "APPOINTMENT_NOT_FOUND", "Appointment not found for this patient");
    return;
  }
  if (appointment.scheduledAt <= new Date() || !["scheduled", "confirmed"].includes(appointment.status)) {
    fail(res, 409, appointment.status === "cancelled" ? "ALREADY_CANCELLED" : "CANCELLATION_NOT_ALLOWED", "This appointment cannot be cancelled");
    return;
  }
  const updated = await getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(appointmentsTable).where(and(
      eq(appointmentsTable.id, id.data), eq(appointmentsTable.patientId, parsed.data.patient_id),
    )).for("update").limit(1);
    if (!row || row.scheduledAt <= new Date() || !["scheduled", "confirmed"].includes(row.status)) return null;
    const [cancelled] = await tx.update(appointmentsTable).set({ status: "cancelled" })
      .where(eq(appointmentsTable.id, id.data))
      .returning({ id: appointmentsTable.id, doctorId: appointmentsTable.doctorId, scheduledAt: appointmentsTable.scheduledAt, status: appointmentsTable.status });
    if (cancelled) await tx.insert(appointmentHistoryTable).values({
      appointmentId: cancelled.id,
      action: "cancelled",
      source: "whatsapp",
      previousDoctorId: cancelled.doctorId,
      previousScheduledAt: cancelled.scheduledAt,
      actorId: auth.id,
    });
    return cancelled;
  });
  if (!updated) {
    fail(res, 409, "CANCELLATION_NOT_ALLOWED", "Appointment status changed; refresh and confirm the cancellation again");
    return;
  }
  await audit(res, "appointment.cancel", "appointment", updated.id);
  ok(res, { appointment: { id: updated.id, scheduled_at: updated.scheduledAt, status: updated.status } });
});

router.patch("/appointments/:id/reschedule", async (_req, res): Promise<void> => {
  const auth = integration(res);
  if (!auth) return;
  const id = z.coerce.number().int().positive().safeParse(_req.params.id);
  const parsed = z.object({
    medical_center_id: z.unknown(),
    patient_id: z.coerce.number().int().positive(),
    whatsapp_number: z.string().min(1).max(40),
    new_doctor_id: z.coerce.number().int().positive(),
    new_scheduled_at: z.string().datetime({ offset: true }),
    idempotency_key: z.string().trim().min(8).max(255),
    confirmed: z.literal(true),
  }).safeParse(_req.body);
  if (!id.success || !parsed.success) {
    fail(res, 400, "INVALID_REQUEST", "Provide valid patient, new doctor, new time, and idempotency key");
    return;
  }
  if (!parseCenterId(parsed.data.medical_center_id, auth.medicalCenterId)) {
    fail(res, 403, "TENANT_MISMATCH", "The requested medical center does not match this credential");
    return;
  }
  const phone = normalizeWhatsappPhone(parsed.data.whatsapp_number);
  if (!phone || !await verifyPatientNumber(parsed.data.patient_id, auth.medicalCenterId, phone)) {
    fail(res, 403, "PATIENT_IDENTITY_MISMATCH", "The patient record does not match this WhatsApp number");
    return;
  }
  const newScheduledAt = new Date(parsed.data.new_scheduled_at);
  if (newScheduledAt <= new Date()) {
    fail(res, 400, "PAST_APPOINTMENT", "Appointments must be rescheduled to a future time");
    return;
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({
    appointmentId: id.data,
    patientId: parsed.data.patient_id,
    doctorId: parsed.data.new_doctor_id,
    scheduledAt: newScheduledAt.toISOString(),
  })).digest("hex");
  try {
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-idempotency:${parsed.data.idempotency_key}`}))`);
      const [prior] = await tx.select().from(whatsappBookingRequestsTable)
        .where(eq(whatsappBookingRequestsTable.idempotencyKey, parsed.data.idempotency_key)).limit(1);
      if (prior) {
        if (prior.requestFingerprint !== fingerprint) throw new Error("IDEMPOTENCY_KEY_REUSED");
        const [existingResult] = await tx.select().from(appointmentsTable).where(eq(appointmentsTable.id, prior.appointmentId)).limit(1);
        return { appointment: existingResult, duplicate: true };
      }
      const [current] = await tx.select().from(appointmentsTable).where(and(
        eq(appointmentsTable.id, id.data), eq(appointmentsTable.patientId, parsed.data.patient_id),
      )).for("update").limit(1);
      if (!current) throw new Error("APPOINTMENT_NOT_FOUND");
      if (current.scheduledAt <= new Date() || !["scheduled", "confirmed"].includes(current.status)) {
        throw new Error("RESCHEDULE_NOT_ALLOWED");
      }
      const [doctor] = await tx.select({ id: doctorsTable.id, isAvailable: doctorsTable.isAvailable })
        .from(doctorsTable).where(and(
          eq(doctorsTable.id, parsed.data.new_doctor_id),
          or(isNull(doctorsTable.medicalCenterId), eq(doctorsTable.medicalCenterId, auth.medicalCenterId))!,
        )).limit(1);
      if (!doctor || !doctor.isAvailable) throw new Error("DOCTOR_NOT_BOOKABLE");
      const slot = await validateAndLockSlot(tx, {
        doctorId: doctor.id,
        start: newScheduledAt,
        excludeAppointmentId: current.id,
      });
      const [updated] = await tx.update(appointmentsTable).set({
        doctorId: doctor.id,
        scheduledAt: newScheduledAt,
        durationMinutes: slot.durationMinutes,
        status: "scheduled",
        source: "whatsapp",
      }).where(eq(appointmentsTable.id, current.id)).returning();
      await tx.insert(appointmentHistoryTable).values({
        appointmentId: updated.id,
        action: "rescheduled",
        source: "whatsapp",
        previousDoctorId: current.doctorId,
        nextDoctorId: doctor.id,
        previousScheduledAt: current.scheduledAt,
        nextScheduledAt: newScheduledAt,
        actorId: auth.id,
      });
      await tx.insert(whatsappBookingRequestsTable).values({
        idempotencyKey: parsed.data.idempotency_key,
        requestFingerprint: fingerprint,
        appointmentId: updated.id,
      });
      return { appointment: updated, duplicate: false };
    });
    if (!result.appointment) {
      fail(res, 500, "RESCHEDULE_RESULT_MISSING", "The updated appointment could not be retrieved");
      return;
    }
    if (!result.duplicate) await audit(res, "appointment.reschedule", "appointment", result.appointment.id, parsed.data.idempotency_key);
    ok(res, {
      appointment: {
        id: result.appointment.id,
        doctor_id: result.appointment.doctorId,
        scheduled_at: result.appointment.scheduledAt,
        duration_minutes: result.appointment.durationMinutes,
        status: result.appointment.status,
      },
      duplicate: result.duplicate,
    });
  } catch (error) {
    if (error instanceof SchedulingError) {
      fail(res, error.code === "SCHEDULING_NOT_CONFIGURED" ? 501 : 409, error.code, error.message);
      return;
    }
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_REUSED") {
      fail(res, 409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different operation");
      return;
    }
    if (error instanceof Error && ["APPOINTMENT_NOT_FOUND", "RESCHEDULE_NOT_ALLOWED", "DOCTOR_NOT_BOOKABLE"].includes(error.message)) {
      fail(res, error.message === "APPOINTMENT_NOT_FOUND" ? 404 : 409, error.message, "Appointment or doctor cannot be rescheduled");
      return;
    }
    logger.error({ errorName: error instanceof Error ? error.name : "unknown", integrationId: auth.id }, "WhatsApp appointment rescheduling failed");
    fail(res, 500, "RESCHEDULE_FAILED", "Appointment could not be rescheduled");
  }
});

const incomingMessageBody = z.object({
  medical_center_id: z.unknown(),
  whatsapp_number: z.string().min(1).max(40),
  message_id: z.string().trim().min(1).max(255),
  message: z.string().trim().min(1).max(4000),
  language: z.enum(LANGUAGES).optional(),
});

function conversationData(conversation: typeof conversations.$inferSelect) {
  return {
    id: conversation.id,
    whatsapp_number: conversation.whatsappNumber,
    language: conversation.language,
    intent: conversation.intent,
    stage: conversation.stage,
    state: conversation.state,
    patient_id: conversation.patientId,
    related_appointment_id: conversation.relatedAppointmentId,
    expires_at: conversation.expiresAt,
  };
}

router.post("/conversations/message", async (req, res): Promise<void> => {
  const auth = integration(res);
  if (!auth) return;
  const parsed = incomingMessageBody.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, "INVALID_REQUEST", "medical_center_id, whatsapp_number, message_id, and message are required");
    return;
  }
  if (!parseCenterId(parsed.data.medical_center_id, auth.medicalCenterId)) {
    fail(res, 403, "TENANT_MISMATCH", "The requested medical center does not match this credential");
    return;
  }
  const phone = normalizeWhatsappPhone(parsed.data.whatsapp_number);
  if (!phone) {
    fail(res, 400, "INVALID_PHONE", "Provide an international WhatsApp number with country code");
    return;
  }
  try {
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-conversation:${phone}`}))`);
      let [conversation] = await tx.select().from(conversations).where(and(
        eq(conversations.channel, "whatsapp"),
        eq(conversations.whatsappNumber, phone),
      )).limit(1);
      const now = new Date();
      if (!conversation) {
        [conversation] = await tx.insert(conversations).values({
          title: `WhatsApp ${phone}`,
          channel: "whatsapp",
          whatsappNumber: phone,
          language: parsed.data.language ?? "en",
          stage: "new_conversation",
          state: {},
          expiresAt: new Date(now.getTime() + CONVERSATION_TTL_HOURS * 60 * 60 * 1000),
          lastMessageAt: now,
        }).returning();
      } else if (conversation.expiresAt && conversation.expiresAt <= now) {
        [conversation] = await tx.update(conversations).set({
          language: parsed.data.language ?? conversation.language ?? "en",
          intent: null,
          stage: "new_conversation",
          state: {},
          patientId: null,
          relatedAppointmentId: null,
          expiresAt: new Date(now.getTime() + CONVERSATION_TTL_HOURS * 60 * 60 * 1000),
          lastMessageAt: now,
        }).where(eq(conversations.id, conversation.id)).returning();
      }

      const [newEvent] = await tx.insert(whatsappWebhookEventsTable).values({
        messageId: parsed.data.message_id,
        conversationId: conversation.id,
      }).onConflictDoNothing().returning({ id: whatsappWebhookEventsTable.id });
      if (!newEvent) {
        const [event] = await tx.select({ conversationId: whatsappWebhookEventsTable.conversationId })
          .from(whatsappWebhookEventsTable)
          .where(eq(whatsappWebhookEventsTable.messageId, parsed.data.message_id)).limit(1);
        const [duplicateConversation] = event
          ? await tx.select().from(conversations).where(eq(conversations.id, event.conversationId)).limit(1)
          : [conversation];
        return { duplicate: true, conversation: duplicateConversation };
      }
      [conversation] = await tx.update(conversations).set({
        language: parsed.data.language ?? conversation.language ?? "en",
        lastMessageAt: now,
        expiresAt: new Date(now.getTime() + CONVERSATION_TTL_HOURS * 60 * 60 * 1000),
      }).where(eq(conversations.id, conversation.id)).returning();
      return { duplicate: false, conversation };
    });
    ok(res, {
      duplicate: result.duplicate,
      incoming_message: result.duplicate ? undefined : parsed.data.message,
      conversation: conversationData(result.conversation),
      patient: result.conversation.patientId ? { id: result.conversation.patientId } : null,
      expires_in_hours: CONVERSATION_TTL_HOURS,
    });
  } catch (error) {
    logger.error({ errorName: error instanceof Error ? error.name : "unknown", integrationId: auth.id }, "WhatsApp message intake failed");
    fail(res, 500, "MESSAGE_PROCESSING_FAILED", "The WhatsApp message could not be recorded");
  }
});

const updateStateBody = z.object({
  medical_center_id: z.unknown(),
  language: z.enum(LANGUAGES).optional(),
  intent: z.enum(INTENTS).nullable().optional(),
  stage: z.enum(STAGES).optional(),
  state: z.record(z.string(), z.unknown()).optional(),
  patient_id: z.coerce.number().int().positive().nullable().optional(),
  related_appointment_id: z.coerce.number().int().positive().nullable().optional(),
});

router.patch("/conversations/:id/state", async (req, res): Promise<void> => {
  const auth = integration(res);
  if (!auth) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = updateStateBody.safeParse(req.body);
  if (!id.success || !parsed.success) {
    fail(res, 400, "INVALID_REQUEST", "Provide valid conversation state fields");
    return;
  }
  if (!parseCenterId(parsed.data.medical_center_id, auth.medicalCenterId)) {
    fail(res, 403, "TENANT_MISMATCH", "The requested medical center does not match this credential");
    return;
  }
  if (parsed.data.state && JSON.stringify(parsed.data.state).length > 8192) {
    fail(res, 413, "STATE_TOO_LARGE", "Conversation state must be at most 8 KB");
    return;
  }
  const [current] = await getDb().select().from(conversations).where(and(
    eq(conversations.id, id.data),
    eq(conversations.channel, "whatsapp"),
  )).limit(1);
  if (!current) {
    fail(res, 404, "CONVERSATION_NOT_FOUND", "WhatsApp conversation not found");
    return;
  }
  if (parsed.data.patient_id) {
    const [patient] = await getDb().select({ id: patientsTable.id }).from(patientsTable).where(and(
      eq(patientsTable.id, parsed.data.patient_id),
      sql`regexp_replace(coalesce(${patientsTable.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits(current.whatsappNumber ?? "")}`,
    )).limit(1);
    if (!patient) {
      fail(res, 403, "PATIENT_IDENTITY_MISMATCH", "The patient is not registered to this WhatsApp number");
      return;
    }
  }
  const nextPatientId = parsed.data.patient_id !== undefined ? parsed.data.patient_id : current.patientId;
  const nextAppointmentId = parsed.data.related_appointment_id !== undefined
    ? parsed.data.related_appointment_id
    : current.relatedAppointmentId;
  if (nextAppointmentId != null) {
    if (!nextPatientId || !current.whatsappNumber
      || !await verifyPatientNumber(nextPatientId, auth.medicalCenterId, current.whatsappNumber)) {
      fail(res, 403, "PATIENT_IDENTITY_MISMATCH", "Identify the conversation patient before linking an appointment");
      return;
    }
    const appointmentFilter = [
      eq(appointmentsTable.id, nextAppointmentId),
      eq(appointmentsTable.patientId, nextPatientId),
    ];
    const [appointment] = await getDb().select({ id: appointmentsTable.id }).from(appointmentsTable)
      .where(and(...appointmentFilter)).limit(1);
    if (!appointment) {
      fail(res, 404, "APPOINTMENT_NOT_FOUND", "Related appointment not found for this conversation patient");
      return;
    }
  }
  const patch: Record<string, unknown> = { lastMessageAt: new Date() };
  if (parsed.data.language !== undefined) patch.language = parsed.data.language;
  if (parsed.data.intent !== undefined) patch.intent = parsed.data.intent;
  if (parsed.data.stage !== undefined) patch.stage = parsed.data.stage;
  if (parsed.data.state !== undefined) patch.state = parsed.data.state;
  if (parsed.data.patient_id !== undefined) patch.patientId = parsed.data.patient_id;
  if (parsed.data.related_appointment_id !== undefined) patch.relatedAppointmentId = parsed.data.related_appointment_id;
  patch.expiresAt = new Date(Date.now() + CONVERSATION_TTL_HOURS * 60 * 60 * 1000);
  const [updated] = await getDb().update(conversations).set(patch as any)
    .where(and(eq(conversations.id, id.data), eq(conversations.channel, "whatsapp")))
    .returning();
  ok(res, { conversation: conversationData(updated) });
});

router.use((error: unknown, _req: Request, res: Response, next: NextFunction): void => {
  if (res.headersSent) {
    next(error);
    return;
  }
  logger.error({ errorName: error instanceof Error ? error.name : "unknown" }, "WhatsApp API request failed");
  fail(res, 500, "INTERNAL_ERROR", "The WhatsApp API request could not be completed");
});

export default router;
