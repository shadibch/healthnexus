import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const staffInvitesTable = pgTable("staff_invites", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  medicalCenterId: integer("medical_center_id").notNull(),
  status: text("status").notNull().default("pending"),
  invitedByUserId: integer("invited_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStaffInviteSchema = createInsertSchema(staffInvitesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStaffInvite = z.infer<typeof insertStaffInviteSchema>;
export type StaffInvite = typeof staffInvitesTable.$inferSelect;
