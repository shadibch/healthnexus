import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const whatsappBookingRequestsTable = pgTable("whatsapp_booking_requests", {
  id: serial("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  appointmentId: integer("appointment_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("whatsapp_booking_requests_key_uq").on(table.idempotencyKey)]);
