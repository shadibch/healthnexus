import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const consultationsTable = pgTable("consultations", {
  id: serial("id").primaryKey(),
  appointmentId: integer("appointment_id").notNull(),
  patientId: integer("patient_id").notNull(),
  doctorId: integer("doctor_id").notNull(),
  parentConsultationId: integer("parent_consultation_id"),
  encounterType: text("encounter_type").notNull().default("initial"), // initial | follow_up | emergency
  chiefComplaint: text("chief_complaint"),
  diagnosis: text("diagnosis"),
  treatmentPlan: text("treatment_plan"),
  notes: text("notes"),
  vitals: text("vitals"),
  followUpDate: text("follow_up_date"),
  status: text("status").notNull().default("in_progress"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertConsultationSchema = createInsertSchema(consultationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertConsultation = z.infer<typeof insertConsultationSchema>;
export type Consultation = typeof consultationsTable.$inferSelect;
