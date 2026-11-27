import { index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

/** One-off breaks/leave/holidays/clinic closures stored as absolute instants. */
export const doctorUnavailablePeriodsTable = pgTable("doctor_unavailable_periods", {
  id: serial("id").primaryKey(),
  doctorId: integer("doctor_id"), // NULL means the whole clinic is unavailable
  kind: varchar("kind", { length: 32 }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("doctor_unavailable_periods_doctor_time_idx").on(table.doctorId, table.startsAt, table.endsAt)]);
