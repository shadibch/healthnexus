import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appointmentReminderLogsTable = pgTable("appointment_reminder_logs", {
  id: serial("id").primaryKey(),
  appointmentId: integer("appointment_id").notNull(),
  patientId: integer("patient_id").notNull(),
  configId: integer("config_id").notNull(),
  channel: text("channel").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("sent"),  // 'sent' | 'failed' | 'skipped'
  errorMessage: text("error_message"),
  renderedMessage: text("rendered_message"),
});

export const insertReminderLogSchema = createInsertSchema(
  appointmentReminderLogsTable,
).omit({ id: true, sentAt: true });

export type InsertReminderLog = z.infer<typeof insertReminderLogSchema>;
export type ReminderLog = typeof appointmentReminderLogsTable.$inferSelect;
