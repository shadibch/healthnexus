import { pgTable, serial, text, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const medicalCentersTable = pgTable("medical_centers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  latitude: numeric("latitude", { precision: 10, scale: 6 }),
  longitude: numeric("longitude", { precision: 10, scale: 6 }),
  adminUserId: integer("admin_user_id"),
  schemaName: text("schema_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMedicalCenterSchema = createInsertSchema(medicalCentersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMedicalCenter = z.infer<typeof insertMedicalCenterSchema>;
export type MedicalCenter = typeof medicalCentersTable.$inferSelect;
