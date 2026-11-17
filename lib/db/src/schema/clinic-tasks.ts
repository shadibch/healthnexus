import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clinicTasksTable = pgTable("clinic_tasks", {
  id: serial("id").primaryKey(),
  externalEventId: varchar("external_event_id", { length: 255 }).unique().notNull(),
  taskTitle: text("task_title").notNull(),
  requestorRole: varchar("requestor_role", { length: 32 }).notNull(),
  department: varchar("department", { length: 32 }).notNull(),
  priority: varchar("priority", { length: 32 }).notNull(),
  status: varchar("status", { length: 48 }).notNull().default("Open"),
  patientIdentifier: varchar("patient_identifier", { length: 64 }),
  assignedPerson: varchar("assigned_person", { length: 255 }),
  originalMessage: text("original_message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClinicTaskSchema = createInsertSchema(clinicTasksTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClinicTask = z.infer<typeof insertClinicTaskSchema>;
export type ClinicTask = typeof clinicTasksTable.$inferSelect;
