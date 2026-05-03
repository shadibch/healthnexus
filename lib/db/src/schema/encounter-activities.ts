import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";

export const encounterActivitiesTable = pgTable("encounter_activities", {
  id: serial("id").primaryKey(),
  consultationId: integer("consultation_id").notNull(),
  activityCode: text("activity_code").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("procedure"),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EncounterActivity = typeof encounterActivitiesTable.$inferSelect;
export type InsertEncounterActivity = typeof encounterActivitiesTable.$inferInsert;
