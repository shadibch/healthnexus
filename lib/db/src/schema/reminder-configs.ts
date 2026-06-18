import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const EMAIL_DEFAULT_TEMPLATE = `Hello {{patient_name}},

This is a friendly reminder that you have an upcoming appointment:

📅 Date: {{appointment_date}}
⏰ Time: {{appointment_time}}
👨‍⚕️ Doctor: Dr. {{doctor_name}}
🏥 Clinic: {{clinic_name}}

Please arrive 10 minutes early. If you need to reschedule, contact us as soon as possible.

Best regards,
{{clinic_name}}`;

export const WHATSAPP_DEFAULT_TEMPLATE = `Hello {{patient_name}} 👋

Reminder from *{{clinic_name}}*:

📅 *{{appointment_date}}*
⏰ *{{appointment_time}}*
👨‍⚕️ Dr. *{{doctor_name}}*

Please arrive 10 minutes early. Reply STOP to opt out.`;

export const appointmentReminderConfigsTable = pgTable(
  "appointment_reminder_configs",
  {
    id: serial("id").primaryKey(),
    medicalCenterId: integer("medical_center_id").notNull(),
    channel: text("channel").notNull(),        // 'email' | 'whatsapp'
    enabled: boolean("enabled").notNull().default(true),
    offsetValue: integer("offset_value").notNull(),  // numeric amount
    offsetUnit: text("offset_unit").notNull(),  // 'minutes' | 'hours' | 'days'
    label: text("label"),                      // human-readable e.g. "24 hours before"
    template: text("template").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
);

export const insertReminderConfigSchema = createInsertSchema(
  appointmentReminderConfigsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertReminderConfig = z.infer<typeof insertReminderConfigSchema>;
export type ReminderConfig = typeof appointmentReminderConfigsTable.$inferSelect;
