import { pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";

export const clinicSettingsTable = pgTable("clinic_settings", {
  id: serial("id").primaryKey(),
  clinicName: text("clinic_name").notNull().default("HealthNexus Medical Center"),
  logoBase64: text("logo_base64"),
  // Physical address
  address: text("address"),
  city: text("city"),
  country: text("country"),
  // GPS coordinates — stored as NUMERIC(10,6) for ±90 / ±180 with 6 decimal places
  latitude: numeric("latitude", { precision: 10, scale: 6 }),
  longitude: numeric("longitude", { precision: 10, scale: 6 }),
  currency: text("currency").notNull().default("AED"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
