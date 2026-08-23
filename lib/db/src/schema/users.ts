import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name"),
  role: text("role").notNull().default("pending"),
  roles: text("roles").array().notNull().default(sql`'{}'::text[]`),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  medicalCenterId: integer("medical_center_id"),
  subscriptionPlan: text("subscription_plan").notNull().default("free"),
  aiAssistantEnabled: boolean("ai_assistant_enabled").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  deactivated: boolean("deactivated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
