import { pgTable, serial, text, numeric, index } from "drizzle-orm/pg-core";

export const haadActivityCatalogueTable = pgTable(
  "haad_activity_catalogue",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    description: text("description").notNull(),
    descriptionAr: text("description_ar").notNull().default(""),
    category: text("category").notNull().default("procedure"),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
  },
  (t) => [
    index("haad_code_idx").on(t.code),
    index("haad_category_idx").on(t.category),
  ],
);

export type HaadActivityCatalogueItem = typeof haadActivityCatalogueTable.$inferSelect;
