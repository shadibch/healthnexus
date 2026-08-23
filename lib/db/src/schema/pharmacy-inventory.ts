import { pgTable, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pharmacyInventoryTable = pgTable(
  "pharmacy_inventory",
  {
    id: serial("id").primaryKey(),
    pharmacyId: integer("pharmacy_id").notNull(),
    medicationId: integer("medication_id").notNull(),
    inStock: boolean("in_stock").notNull().default(true),
    quantity: integer("quantity").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("pharmacy_inventory_pharmacy_medication_uq").on(t.pharmacyId, t.medicationId)],
);

export const insertPharmacyInventorySchema = createInsertSchema(pharmacyInventoryTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertPharmacyInventory = z.infer<typeof insertPharmacyInventorySchema>;
export type PharmacyInventory = typeof pharmacyInventoryTable.$inferSelect;
