import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
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
  // Payment / billing
  paymentStatus: text("payment_status").notNull().default("unpaid"),  // unpaid | paid | exempted | partial
  paymentMethod: text("payment_method"),                              // cash | card
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }),
  insuranceCompany: text("insurance_company"),
  insuranceAmount: numeric("insurance_amount", { precision: 10, scale: 2 }),
  // ── Consultation fee (snapshotted at creation from doctor's category) ──────
  consultationFeeApplied: numeric("consultation_fee_applied", { precision: 10, scale: 2 }),
  doctorCategory: text("doctor_category"),                                  // category name snapshot
  // ── Fee override audit trail ───────────────────────────────────────────────
  feeOverrideReason: text("fee_override_reason"),
  feeOverriddenBy: integer("fee_overridden_by"),                            // userId
  feeOverriddenAt: timestamp("fee_overridden_at", { withTimezone: true }),
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
