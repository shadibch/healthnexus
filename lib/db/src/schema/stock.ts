import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const stockTable = pgTable("stock", {
  id: serial("id").primaryKey(),
  medicationId: integer("medication_id").notNull(),
  quantity: integer("quantity").notNull().default(0),
  minimumQuantity: integer("minimum_quantity").notNull().default(10),
  unitCost: numeric("unit_cost", { precision: 10, scale: 2 }),
  expiryDate: text("expiry_date"),
  batchNumber: text("batch_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStockSchema = createInsertSchema(stockTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStock = z.infer<typeof insertStockSchema>;
export type Stock = typeof stockTable.$inferSelect;
