import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  channel: text("channel").notNull().default("internal"),
  whatsappNumber: text("whatsapp_number"),
  language: text("language"),
  intent: text("intent"),
  stage: text("stage"),
  state: jsonb("state").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  patientId: integer("patient_id"),
  relatedAppointmentId: integer("related_appointment_id"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("conversations_whatsapp_number_uq")
    .on(table.whatsappNumber)
    .where(sql`${table.channel} = 'whatsapp' AND ${table.whatsappNumber} IS NOT NULL`),
]);

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
