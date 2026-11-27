import { Router, type IRouter } from "express";
import { eq, and, gte, lt, isNull, notInArray, or, sql } from "drizzle-orm";
import { appointmentsTable, patientsTable, doctorsTable, doctorSchedulesTable, doctorUnavailablePeriodsTable, appointmentHistoryTable } from "@workspace/db";
import {
  ListAppointmentsQueryParams,
  CreateAppointmentBody,
  GetAppointmentParams,
  UpdateAppointmentParams,
  UpdateAppointmentBody,
  DeleteAppointmentParams,
  GetTodayAppointmentsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, getSessionUser } from "../lib/session";
import { getDb } from "../lib/tenant";
import { addLocalDays, configuredTimeZone, localTimeToUtc, minutesOfDay, partsInTimeZone, SchedulingError, validateAndLockSlot } from "../lib/scheduling";

const router: IRouter = Router();

function enrichAppointment(
  a: typeof appointmentsTable.$inferSelect,
  patientMap: Map<number, string>,
  doctorMap: Map<number, string>
) {
  return {
    ...a,
    patientName: patientMap.get(a.patientId) ?? null,
    doctorName: doctorMap.get(a.doctorId) ?? null,
  };
}

async function getMaps() {
  const patients = await getDb().select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await getDb().select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));
  return { patientMap, doctorMap };
}

// ── Available slots for a doctor on a date ────────────────────────────────────
// GET /appointments/slots?doctorId=1&date=2026-05-03
router.get("/appointments/slots", requireAuth, async (req, res): Promise<void> => {
  const doctorId = parseInt(req.query.doctorId as string);
  const dateStr = req.query.date as string;

  if (!doctorId || !dateStr) {
    res.status(400).json({ error: "doctorId and date are required" }); return;
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (!dateMatch || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateStr) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" }); return;
  }

  const [doctor] = await getDb().select().from(doctorsTable).where(eq(doctorsTable.id, doctorId)).limit(1);
  if (!doctor) { res.status(404).json({ error: "Doctor not found" }); return; }
  if (!doctor.isAvailable) { res.status(200).json({ doctorId, date: dateStr, slots: [] }); return; }

  let timeZone: string;
  try {
    timeZone = await configuredTimeZone(getDb());
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Clinic timezone not configured" });
    return;
  }
  const dayOfWeek = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  const dayStart = localTimeToUtc(dateStr, "00:00", timeZone);
  const dayEnd = localTimeToUtc(addLocalDays(dateStr, 1), "00:00", timeZone);
  if (!dayStart || !dayEnd) { res.status(400).json({ error: "Date invalid in clinic timezone" }); return; }
  const rules = await getDb().select().from(doctorSchedulesTable).where(and(
    eq(doctorSchedulesTable.doctorId, doctorId), eq(doctorSchedulesTable.dayOfWeek, dayOfWeek),
  ));
  const relevantRules = rules.filter((rule) =>
    (!rule.effectiveFrom || rule.effectiveFrom <= dateStr)
    && (!rule.effectiveUntil || rule.effectiveUntil >= dateStr),
  );
  const booked = await getDb().select({ scheduledAt: appointmentsTable.scheduledAt, duration: appointmentsTable.durationMinutes, status: appointmentsTable.status })
    .from(appointmentsTable).where(and(
      eq(appointmentsTable.doctorId, doctorId),
      notInArray(appointmentsTable.status, ["cancelled", "no_show"]),
      sql`${appointmentsTable.scheduledAt} < ${dayEnd} AND (${appointmentsTable.scheduledAt} + (${appointmentsTable.durationMinutes} * interval '1 minute')) > ${dayStart}`,
    ));
  const blocks = await getDb().select().from(doctorUnavailablePeriodsTable).where(and(
    or(isNull(doctorUnavailablePeriodsTable.doctorId), eq(doctorUnavailablePeriodsTable.doctorId, doctorId)),
    sql`${doctorUnavailablePeriodsTable.startsAt} < ${dayEnd} AND ${doctorUnavailablePeriodsTable.endsAt} > ${dayStart}`,
  ));
  const now = new Date();
  const slotMap = new Map<string, { time: string; available: boolean; booked: boolean; past: boolean }>();
  for (const rule of relevantRules) {
    for (let minute = minutesOfDay(rule.startTime); minute + rule.slotDurationMinutes <= minutesOfDay(rule.endTime); minute += rule.slotDurationMinutes) {
      const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      const start = localTimeToUtc(dateStr, time, timeZone);
      if (!start) continue;
      const end = new Date(start.getTime() + rule.slotDurationMinutes * 60_000);
      const isBooked = booked.some((appointment) => appointment.scheduledAt < end
        && appointment.scheduledAt.getTime() + appointment.duration * 60_000 > start.getTime());
      const isBlocked = blocks.some((block) => block.startsAt < end && block.endsAt > start);
      const past = start <= now;
      slotMap.set(time, { time, available: !past && !isBooked && !isBlocked, booked: isBooked || isBlocked, past });
    }
  }
  res.json({ doctorId, date: dateStr, timezone: timeZone, slots: [...slotMap.values()] });
});

router.get("/appointments/today", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const parsed = GetTodayAppointmentsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const { patientMap, doctorMap } = await getMaps();

  let all = await getDb().select()
    .from(appointmentsTable)
    .where(and(gte(appointmentsTable.scheduledAt, todayStart), lt(appointmentsTable.scheduledAt, todayEnd)));

  if (session.roles.includes("doctor") && session.doctorDbId != null) {
    all = all.filter((a) => a.doctorId === session.doctorDbId);
  } else if (session.roles.includes("patient") && session.patientDbId != null) {
    all = all.filter((a) => a.patientId === session.patientDbId);
  }

  const appointments = all.map((a) => enrichAppointment(a, patientMap, doctorMap));

  res.json({
    date: todayStart.toISOString().split("T")[0],
    total: appointments.length,
    scheduled: appointments.filter((a) => a.status === "scheduled").length,
    confirmed: appointments.filter((a) => a.status === "confirmed").length,
    inProgress: appointments.filter((a) => a.status === "in_progress").length,
    completed: appointments.filter((a) => a.status === "completed").length,
    cancelled: appointments.filter((a) => a.status === "cancelled").length,
    noShow: appointments.filter((a) => a.status === "no_show").length,
    appointments,
  });
});

router.get("/appointments", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const parsed = ListAppointmentsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { patientMap, doctorMap } = await getMaps();
  let all = await getDb().select().from(appointmentsTable).orderBy(appointmentsTable.scheduledAt);

  if (session.roles.includes("doctor") && session.doctorDbId != null) {
    all = all.filter((a) => a.doctorId === session.doctorDbId);
  } else if (session.roles.includes("patient") && session.patientDbId != null) {
    all = all.filter((a) => a.patientId === session.patientDbId);
  }

  const { doctorId, patientId, status, date, limit = 50, offset = 0 } = parsed.data;
  if (doctorId && !session.roles.includes("patient")) all = all.filter((a) => a.doctorId === doctorId);
  if (patientId && !session.roles.includes("doctor")) all = all.filter((a) => a.patientId === patientId);
  if (status) all = all.filter((a) => a.status === status);
  if (date) {
    const d = new Date(date);
    const nextDay = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    all = all.filter((a) => a.scheduledAt >= d && a.scheduledAt < nextDay);
  }

  const sliced = all.slice(offset, offset + limit);
  res.json(sliced.map((a) => enrichAppointment(a, patientMap, doctorMap)));
});

// ── Patient self-book ─────────────────────────────────────────────────────────
// POST /appointments/book  (patient only)
router.post("/appointments/book", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("patient") || !session.patientDbId) {
    res.status(403).json({ error: "Only patients can use self-booking" }); return;
  }

  const { doctorId, scheduledAt, type = "routine", notes } = req.body;
  if (!doctorId || !scheduledAt) {
    res.status(400).json({ error: "doctorId and scheduledAt are required" }); return;
  }

  const slotDate = new Date(scheduledAt);
  if (isNaN(slotDate.getTime())) {
    res.status(400).json({ error: "Invalid scheduledAt" }); return;
  }
  if (slotDate <= new Date()) {
    res.status(400).json({ error: "Cannot book a slot in the past" }); return;
  }

  let appointment;
  try {
    appointment = await getDb().transaction(async (tx) => {
      const slot = await validateAndLockSlot(tx, { doctorId: Number(doctorId), start: slotDate });
      const parts = partsInTimeZone(slotDate, slot.timeZone);
      const today = partsInTimeZone(new Date(), slot.timeZone);
      let queueNumber: number | null = null;
      if (parts.year === today.year && parts.month === today.month && parts.day === today.day) {
        const dateText = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
        const start = localTimeToUtc(dateText, "00:00", slot.timeZone)!;
        const end = localTimeToUtc(addLocalDays(dateText, 1), "00:00", slot.timeZone)!;
        const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(appointmentsTable).where(and(
          gte(appointmentsTable.scheduledAt, start), lt(appointmentsTable.scheduledAt, end),
          notInArray(appointmentsTable.status, ["cancelled", "no_show"]),
        ));
        queueNumber = (count?.value ?? 0) + 1;
      }
      const [created] = await tx.insert(appointmentsTable).values({
        patientId: session.patientDbId!,
        doctorId: Number(doctorId),
        scheduledAt: slotDate,
        durationMinutes: slot.durationMinutes,
        source: "patient",
        type,
        status: "scheduled",
        notes: notes ?? null,
        queueNumber,
      }).returning();
      await tx.insert(appointmentHistoryTable).values({
        appointmentId: created.id, action: "booked", source: "patient",
        nextDoctorId: created.doctorId, nextScheduledAt: created.scheduledAt, actorId: session.userId,
      });
      return created;
    });
  } catch (error) {
    if (error instanceof SchedulingError) {
      res.status(error.code === "SCHEDULING_NOT_CONFIGURED" ? 503 : 409).json({ error: error.message, code: error.code });
      return;
    }
    throw error;
  }

  const { patientMap, doctorMap } = await getMaps();
  res.status(201).json(enrichAppointment(appointment, patientMap, doctorMap));
});

// ── Patient cancel ────────────────────────────────────────────────────────────
router.patch("/appointments/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("patient") || !session.patientDbId) {
    res.status(403).json({ error: "Only patients can use self-cancel" }); return;
  }

  const apptId = parseInt(String(req.params.id));
  const [appointment] = await getDb().select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, apptId))
    .limit(1);

  if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }
  if (appointment.patientId !== session.patientDbId) {
    res.status(403).json({ error: "Not your appointment" }); return;
  }
  if (["completed", "cancelled", "no_show", "in_progress"].includes(appointment.status)) {
    res.status(400).json({ error: `Cannot cancel an appointment with status: ${appointment.status}` }); return;
  }

  const updated = await getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(appointmentsTable).where(eq(appointmentsTable.id, apptId)).for("update").limit(1);
    if (!row || row.patientId !== session.patientDbId || ["completed", "cancelled", "no_show", "in_progress"].includes(row.status)) return null;
    const [cancelled] = await tx.update(appointmentsTable).set({ status: "cancelled" })
      .where(eq(appointmentsTable.id, apptId)).returning();
    if (cancelled) await tx.insert(appointmentHistoryTable).values({
      appointmentId: cancelled.id,
      action: "cancelled",
      source: "patient",
      previousDoctorId: cancelled.doctorId,
      previousScheduledAt: cancelled.scheduledAt,
      actorId: session.userId,
    });
    return cancelled;
  });
  if (!updated) { res.status(409).json({ error: "Appointment status changed; refresh and try again" }); return; }

  const { patientMap, doctorMap } = await getMaps();
  res.json(enrichAppointment(updated, patientMap, doctorMap));
});

// ── Patient reschedule ────────────────────────────────────────────────────────
router.patch("/appointments/:id/reschedule", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("patient") || !session.patientDbId) {
    res.status(403).json({ error: "Only patients can use self-reschedule" }); return;
  }

  const apptId = parseInt(String(req.params.id));
  const { scheduledAt, doctorId } = req.body;

  if (!scheduledAt) { res.status(400).json({ error: "scheduledAt is required" }); return; }

  const [appointment] = await getDb().select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, apptId))
    .limit(1);

  if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }
  if (appointment.patientId !== session.patientDbId) {
    res.status(403).json({ error: "Not your appointment" }); return;
  }
  if (["completed", "cancelled", "no_show", "in_progress"].includes(appointment.status)) {
    res.status(400).json({ error: `Cannot reschedule an appointment with status: ${appointment.status}` }); return;
  }

  const newDate = new Date(scheduledAt);
  if (isNaN(newDate.getTime())) { res.status(400).json({ error: "Invalid scheduledAt" }); return; }
  if (newDate <= new Date()) { res.status(400).json({ error: "Cannot reschedule to a past slot" }); return; }

  const targetDoctorId = doctorId ? parseInt(doctorId) : appointment.doctorId;

  let updated;
  try {
    updated = await getDb().transaction(async (tx) => {
      const [current] = await tx.select().from(appointmentsTable).where(eq(appointmentsTable.id, apptId)).for("update").limit(1);
      if (!current || current.patientId !== session.patientDbId) throw new Error("APPOINTMENT_NOT_FOUND");
      if (["completed", "cancelled", "no_show", "in_progress"].includes(current.status)) throw new Error("RESCHEDULE_NOT_ALLOWED");
      const slot = await validateAndLockSlot(tx, { doctorId: targetDoctorId, start: newDate, excludeAppointmentId: apptId });
      const [rescheduled] = await tx.update(appointmentsTable).set({
        scheduledAt: newDate,
        doctorId: targetDoctorId,
        durationMinutes: slot.durationMinutes,
        status: "scheduled",
        source: "patient",
      }).where(eq(appointmentsTable.id, apptId)).returning();
      await tx.insert(appointmentHistoryTable).values({
        appointmentId: apptId,
        action: "rescheduled",
        source: "patient",
        previousDoctorId: current.doctorId,
        nextDoctorId: targetDoctorId,
        previousScheduledAt: current.scheduledAt,
        nextScheduledAt: newDate,
        actorId: session.userId,
      });
      return rescheduled;
    });
  } catch (error) {
    if (error instanceof SchedulingError) {
      res.status(error.code === "SCHEDULING_NOT_CONFIGURED" ? 503 : 409).json({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof Error && error.message === "RESCHEDULE_NOT_ALLOWED") {
      res.status(409).json({ error: "This appointment can no longer be rescheduled" }); return;
    }
    if (error instanceof Error && error.message === "APPOINTMENT_NOT_FOUND") {
      res.status(404).json({ error: "Appointment not found" }); return;
    }
    throw error;
  }

  const { patientMap, doctorMap } = await getMaps();
  res.json(enrichAppointment(updated, patientMap, doctorMap));
});

router.post("/appointments", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.roles.includes("patient")) {
    res.status(403).json({ error: "Patients must use POST /appointments/book" }); return;
  }

  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const scheduledAt = new Date(parsed.data.scheduledAt);
  let appointment;
  try {
    appointment = await getDb().transaction(async (tx) => {
      const slot = await validateAndLockSlot(tx, { doctorId: parsed.data.doctorId, start: scheduledAt });
      const local = partsInTimeZone(scheduledAt, slot.timeZone);
      const today = partsInTimeZone(new Date(), slot.timeZone);
      let queueNumber: number | null = null;
      if (local.year === today.year && local.month === today.month && local.day === today.day) {
        const dateText = `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
        const start = localTimeToUtc(dateText, "00:00", slot.timeZone)!;
        const end = localTimeToUtc(addLocalDays(dateText, 1), "00:00", slot.timeZone)!;
        const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(appointmentsTable).where(and(
          gte(appointmentsTable.scheduledAt, start), lt(appointmentsTable.scheduledAt, end),
          notInArray(appointmentsTable.status, ["cancelled", "no_show"]),
        ));
        queueNumber = (count?.value ?? 0) + 1;
      }
      const [created] = await tx.insert(appointmentsTable).values({
        ...parsed.data,
        scheduledAt,
        durationMinutes: slot.durationMinutes,
        source: "clinic",
        queueNumber,
      }).returning();
      await tx.insert(appointmentHistoryTable).values({
        appointmentId: created.id, action: "booked", source: "clinic",
        nextDoctorId: created.doctorId, nextScheduledAt: created.scheduledAt, actorId: session.userId,
      });
      return created;
    });
  } catch (error) {
    if (error instanceof SchedulingError) {
      res.status(error.code === "SCHEDULING_NOT_CONFIGURED" ? 503 : 409).json({ error: error.message, code: error.code });
      return;
    }
    throw error;
  }

  const { patientMap, doctorMap } = await getMaps();
  res.status(201).json(enrichAppointment(appointment, patientMap, doctorMap));
});

router.get("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const params = GetAppointmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [appointment] = await getDb().select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, params.data.id));

  if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }
  if (session.roles.includes("doctor") && session.doctorDbId !== appointment.doctorId) {
    res.status(403).json({ error: "Not your appointment" }); return;
  }
  if (session.roles.includes("patient") && session.patientDbId !== appointment.patientId) {
    res.status(403).json({ error: "Not your appointment" }); return;
  }

  const { patientMap, doctorMap } = await getMaps();
  res.json(enrichAppointment(appointment, patientMap, doctorMap));
});

router.patch("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.roles.includes("patient")) {
    res.status(403).json({ error: "Patients must use /cancel or /reschedule endpoints" }); return;
  }

  const params = UpdateAppointmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateAppointmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updateData: Partial<typeof appointmentsTable.$inferInsert> = {};
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.notes != null) updateData.notes = parsed.data.notes;
  if (parsed.data.type != null) updateData.type = parsed.data.type;
  if (parsed.data.queueNumber != null) updateData.queueNumber = parsed.data.queueNumber;
  if (parsed.data.scheduledAt != null) updateData.scheduledAt = new Date(parsed.data.scheduledAt);

  let appointment;
  if (updateData.scheduledAt != null) {
    try {
      appointment = await getDb().transaction(async (tx) => {
        const [current] = await tx.select().from(appointmentsTable).where(eq(appointmentsTable.id, params.data.id)).for("update").limit(1);
        if (!current) return null;
        const slot = await validateAndLockSlot(tx, {
          doctorId: current.doctorId,
          start: updateData.scheduledAt as Date,
          excludeAppointmentId: current.id,
        });
        const [updated] = await tx.update(appointmentsTable).set({
          ...updateData,
          durationMinutes: slot.durationMinutes,
        }).where(eq(appointmentsTable.id, current.id)).returning();
        await tx.insert(appointmentHistoryTable).values({
          appointmentId: current.id,
          action: "rescheduled",
          source: "clinic",
          previousDoctorId: current.doctorId,
          nextDoctorId: current.doctorId,
          previousScheduledAt: current.scheduledAt,
          nextScheduledAt: updated.scheduledAt,
          actorId: session.userId,
        });
        return updated;
      });
    } catch (error) {
      if (error instanceof SchedulingError) {
        res.status(error.code === "SCHEDULING_NOT_CONFIGURED" ? 503 : 409).json({ error: error.message, code: error.code });
        return;
      }
      throw error;
    }
  } else {
    [appointment] = await getDb().update(appointmentsTable)
      .set(updateData)
      .where(eq(appointmentsTable.id, params.data.id))
      .returning();
  }
  if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }

  const { patientMap, doctorMap } = await getMaps();
  res.json(enrichAppointment(appointment, patientMap, doctorMap));
});

router.delete("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.roles.includes("patient")) {
    res.status(403).json({ error: "Patients must use the cancel endpoint" }); return;
  }

  const params = DeleteAppointmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [appointment] = await getDb().delete(appointmentsTable)
    .where(eq(appointmentsTable.id, params.data.id))
    .returning();
  if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }
  res.sendStatus(204);
});

export default router;
