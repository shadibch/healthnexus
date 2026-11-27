import { index, integer, pgTable, serial, time, text, timestamp } from "drizzle-orm/pg-core";

/** Recurring clinic-local working periods. Multiple periods per day allow breaks. */
export const doctorSchedulesTable = pgTable("doctor_schedules", {
  id: serial("id").primaryKey(),
  doctorId: integer("doctor_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0 Sunday through 6 Saturday
  startTime: time("start_time", { withTimezone: false }).notNull(),
  endTime: time("end_time", { withTimezone: false }).notNull(),
  slotDurationMinutes: integer("slot_duration_minutes").notNull(),
  effectiveFrom: text("effective_from"), // YYYY-MM-DD, inclusive
  effectiveUntil: text("effective_until"), // YYYY-MM-DD, inclusive
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("doctor_schedules_doctor_day_idx").on(table.doctorId, table.dayOfWeek)]);
