import { pgTable, serial, text, timestamp, numeric, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const doctorCategoriesTable = pgTable("doctor_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),                                             // e.g. "General Practitioner"
  description: text("description"),                                         // optional note
  consultationFee: numeric("consultation_fee", { precision: 10, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),                    // for display ordering
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDoctorCategorySchema = createInsertSchema(doctorCategoriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDoctorCategory = z.infer<typeof insertDoctorCategorySchema>;
export type DoctorCategory = typeof doctorCategoriesTable.$inferSelect;
