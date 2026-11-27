import { and, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import {
  appointmentsTable,
  clinicSettingsTable,
  doctorSchedulesTable,
  doctorUnavailablePeriodsTable,
  doctorsTable,
} from "@workspace/db";
import { localDateText, matchesScheduleSlot, partsInTimeZone, validTimeZone } from "./whatsapp-time";
export { addLocalDays, intervalsOverlap, localDateText, localTimeToUtc, matchesScheduleSlot, minutesOfDay, partsInTimeZone, validTimeZone } from "./whatsapp-time";

export class SchedulingError extends Error {
  constructor(
    public readonly code: "SCHEDULING_NOT_CONFIGURED" | "SLOT_UNAVAILABLE" | "INVALID_TIME_ZONE",
    message: string,
  ) {
    super(message);
  }
}

export async function configuredTimeZone(executor: any): Promise<string> {
  const [settings] = await executor.select({ timeZone: clinicSettingsTable.timeZone })
    .from(clinicSettingsTable).limit(1);
  if (!settings?.timeZone) {
    throw new SchedulingError("SCHEDULING_NOT_CONFIGURED", "Set the clinic timezone before using scheduling");
  }
  if (!validTimeZone(settings.timeZone)) {
    throw new SchedulingError("INVALID_TIME_ZONE", "The configured clinic timezone is not a valid IANA timezone");
  }
  return settings.timeZone;
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
  const schedules = await tx.select().from(doctorSchedulesTable).where(and(
    eq(doctorSchedulesTable.doctorId, doctorId),
    eq(doctorSchedulesTable.dayOfWeek, local.weekday),
  ));
  const schedule = schedules.find((rule: typeof doctorSchedulesTable.$inferSelect) => matchesScheduleSlot(rule, local, localDate));
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
