import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const appointmentHistoryTable = pgTable("appointment_history", {
  id: serial("id").primaryKey(),
  appointmentId: integer("appointment_id").notNull(),
  action: text("action").notNull(),
  source: text("source").notNull(),
  previousDoctorId: integer("previous_doctor_id"),
  nextDoctorId: integer("next_doctor_id"),
  previousScheduledAt: timestamp("previous_scheduled_at", { withTimezone: true }),
  nextScheduledAt: timestamp("next_scheduled_at", { withTimezone: true }),
  actorId: integer("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
