import { index, integer, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const whatsappIntegrationsTable = pgTable("whatsapp_integrations", {
  id: serial("id").primaryKey(),
  medicalCenterId: integer("medical_center_id").notNull(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  tokenPrefix: varchar("token_prefix", { length: 16 }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdByUserId: integer("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const whatsappAuditLogsTable = pgTable("whatsapp_audit_logs", {
  id: serial("id").primaryKey(),
  integrationId: integer("integration_id").notNull(),
  medicalCenterId: integer("medical_center_id").notNull(),
  action: varchar("action", { length: 48 }).notNull(),
  entityType: varchar("entity_type", { length: 48 }).notNull(),
  entityId: integer("entity_id"),
  requestId: varchar("request_id", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("whatsapp_audit_center_created_idx").on(table.medicalCenterId, table.createdAt)]);

export const whatsappWebhookEventsTable = pgTable("whatsapp_webhook_events", {
  id: serial("id").primaryKey(),
  messageId: varchar("message_id", { length: 255 }).notNull(),
  conversationId: integer("conversation_id").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("whatsapp_webhook_events_message_id_uq").on(table.messageId)]);
