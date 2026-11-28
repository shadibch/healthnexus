import { and, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import {
  appointmentsTable,
  clinicSettingsTable,
  doctorSchedulesTable,
  doctorUnavailablePeriodsTable,
  doctorsTable,
} from "@workspace/db";
import { localDateText, matchesScheduleSlot, partsInTimeZone, validTimeZone } from "./whatsapp-time";
export { addLocalDays, intervalsOverlap, localDateText, localTimeToUtc, matchesScheduleSlot, minutesOfDay, partsInTimeZone, validTimeZone, weekdayOfDate } from "./whatsapp-time";

export class SchedulingError extends Error {
  constructor(
    public readonly code: "SCHEDULING_NOT_CONFIGURED" | "SLOT_UNAVAILABLE" | "INVALID_TIME_ZONE",
    message: string,
  ) {
    super(message);
  }
}

/** Fallback clinic timezone when the clinic has not configured one yet. */
export const DEFAULT_TIME_ZONE = process.env.DEFAULT_TIME_ZONE?.trim() || "Asia/Dubai";

/** Fallback working hours used for doctors that have no schedule configured. */
const DEFAULT_START_TIME = "09:00";
const DEFAULT_END_TIME = "17:00";
const DEFAULT_SLOT_MINUTES = 30;

export interface ScheduleRule {
  doctorId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
}

/** A synthetic 09:00–17:00 / 30-minute schedule for a doctor with no rules. */
export function defaultScheduleRule(doctorId: number, dayOfWeek: number): ScheduleRule {
  return {
    doctorId,
    dayOfWeek,
    startTime: DEFAULT_START_TIME,
    endTime: DEFAULT_END_TIME,
    slotDurationMinutes: DEFAULT_SLOT_MINUTES,
    effectiveFrom: null,
    effectiveUntil: null,
  };
}

let warnedDefaultTimeZone = false;

export async function configuredTimeZone(executor: any): Promise<string> {
  const [settings] = await executor.select({ timeZone: clinicSettingsTable.timeZone })
    .from(clinicSettingsTable).limit(1);
  const configured = settings?.timeZone?.trim();
  const timeZone = configured || DEFAULT_TIME_ZONE;
  if (!configured && !warnedDefaultTimeZone) {
    warnedDefaultTimeZone = true;
    // eslint-disable-next-line no-console
    console.warn(`[scheduling] clinic timezone not configured; defaulting to ${DEFAULT_TIME_ZONE}`);
  }
  if (!validTimeZone(timeZone)) {
    throw new SchedulingError("INVALID_TIME_ZONE", "The configured clinic timezone is not a valid IANA timezone");
  }
  return timeZone;
}

/**
 * Effective schedule rules for a doctor on a given clinic-local day.
 *
 * If the doctor has no schedule rows at all we fall back to a sensible default
 * (09:00–17:00, 30-minute slots) so availability is never empty just because
 * the schedule has not been configured yet. If the doctor *does* have rules
 * but none apply to this day (e.g. a day off) we return an empty list.
 */
export async function getScheduleRulesForDay(
  executor: any,
  doctorId: number,
  dayOfWeek: number,
  dateStr: string,
): Promise<ScheduleRule[]> {
  const all = await executor.select().from(doctorSchedulesTable)
    .where(eq(doctorSchedulesTable.doctorId, doctorId)) as ScheduleRule[];
  const forDay = all.filter((rule) =>
    rule.dayOfWeek === dayOfWeek
    && (!rule.effectiveFrom || rule.effectiveFrom <= dateStr)
    && (!rule.effectiveUntil || rule.effectiveUntil >= dateStr),
  );
  if (forDay.length > 0) return forDay;
  if (all.length === 0) return [defaultScheduleRule(doctorId, dayOfWeek)];
  return [];
}


/** Validate a slot and serialize all HealthNexus API writers by tenant/doctor. */
export async function validateAndLockSlot(
  tx: any,
  input: { doctorId: number; start: Date; excludeAppointmentId?: number },
): Promise<{ end: Date; durationMinutes: number; timeZone: string }> {
  const { doctorId, start, excludeAppointmentId } = input;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':' || ${doctorId}::text))`);
  const [doctor] = await tx.select({ isAvailable: doctorsTable.isAvailable })
    .from(doctorsTable).where(eq(doctorsTable.id, doctorId)).limit(1);
  if (!doctor || !doctor.isAvailable) {
    throw new SchedulingError("SLOT_UNAVAILABLE", "The selected doctor is not available for booking");
  }
  const timeZone = await configuredTimeZone(tx);
  const local = partsInTimeZone(start, timeZone);
  const localDate = localDateText(local);
  const schedules = await getScheduleRulesForDay(tx, doctorId, local.weekday, localDate);
  const schedule = schedules.find((rule: ScheduleRule) => matchesScheduleSlot(rule, local, localDate));
  if (!schedule || start.getUTCMilliseconds() !== 0) {
    throw new SchedulingError("SLOT_UNAVAILABLE", "The requested time does not match a configured doctor schedule slot");
  }

  const end = new Date(start.getTime() + schedule.slotDurationMinutes * 60_000);
  const overlapsExisting = [
    eq(appointmentsTable.doctorId, doctorId),
    notInArray(appointmentsTable.status, ["cancelled", "no_show"]),
    sql`${appointmentsTable.scheduledAt} < ${end} AND (${appointmentsTable.scheduledAt} + (${appointmentsTable.durationMinutes} * interval '1 minute')) > ${start}`,
  ];
  if (excludeAppointmentId) overlapsExisting.push(sql`${appointmentsTable.id} <> ${excludeAppointmentId}` as any);
  const [conflict] = await tx.select({ id: appointmentsTable.id }).from(appointmentsTable)
    .where(and(...overlapsExisting)).limit(1);
  if (conflict) throw new SchedulingError("SLOT_UNAVAILABLE", "The requested slot overlaps an existing appointment");

  const [block] = await tx.select({ id: doctorUnavailablePeriodsTable.id })
    .from(doctorUnavailablePeriodsTable).where(and(
      or(isNull(doctorUnavailablePeriodsTable.doctorId), eq(doctorUnavailablePeriodsTable.doctorId, doctorId)),
      sql`${doctorUnavailablePeriodsTable.startsAt} < ${end} AND ${doctorUnavailablePeriodsTable.endsAt} > ${start}`,
    )).limit(1);
  if (block) throw new SchedulingError("SLOT_UNAVAILABLE", "The doctor or clinic is unavailable during the requested slot");

  return { end, durationMinutes: schedule.slotDurationMinutes, timeZone };
}
