import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const prescriptionsTable = pgTable("prescriptions", {
  id: serial("id").primaryKey(),
  consultationId: integer("consultation_id"),
  patientId: integer("patient_id").notNull(),
  doctorId: integer("doctor_id").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  dispensedAt: timestamp("dispensed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const prescriptionItemsTable = pgTable("prescription_items", {
  id: serial("id").primaryKey(),
  prescriptionId: integer("prescription_id").notNull(),
  medicationId: integer("medication_id").notNull(),
  dosage: text("dosage").notNull(),
  frequency: text("frequency").notNull(),
  duration: text("duration").notNull(),
  quantity: integer("quantity").notNull(),
  instructions: text("instructions"),
});

export const insertPrescriptionSchema = createInsertSchema(prescriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  issuedAt: true,
});
export const insertPrescriptionItemSchema = createInsertSchema(prescriptionItemsTable).omit({ id: true });
export type InsertPrescription = z.infer<typeof insertPrescriptionSchema>;
export type InsertPrescriptionItem = z.infer<typeof insertPrescriptionItemSchema>;
export type Prescription = typeof prescriptionsTable.$inferSelect;
export type PrescriptionItem = typeof prescriptionItemsTable.$inferSelect;
