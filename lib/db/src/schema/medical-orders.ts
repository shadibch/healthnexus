import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const medicalOrdersTable = pgTable("medical_orders", {
  id: serial("id").primaryKey(),
  consultationId: integer("consultation_id").notNull(),
  patientId: integer("patient_id").notNull(),
  doctorId: integer("doctor_id").notNull(),
  type: text("type").notNull(), // lab | xray | ct | mri | ultrasound | ecg | other
  name: text("name").notNull(),
  priority: text("priority").notNull().default("routine"), // stat | urgent | routine
  status: text("status").notNull().default("ordered"), // ordered | in_progress | completed | cancelled
  notes: text("notes"),
  resultData: text("result_data"),
  resultNotes: text("result_notes"),
  orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMedicalOrderSchema = createInsertSchema(medicalOrdersTable).omit({
  id: true,
  createdAt: true,
  orderedAt: true,
});
export type InsertMedicalOrder = z.infer<typeof insertMedicalOrderSchema>;
export type MedicalOrder = typeof medicalOrdersTable.$inferSelect;
