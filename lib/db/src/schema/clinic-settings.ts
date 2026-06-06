import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const clinicSettingsTable = pgTable("clinic_settings", {
  id: serial("id").primaryKey(),
  clinicName: text("clinic_name").notNull().default("HealthNexus Medical Center"),
  logoBase64: text("logo_base64"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
