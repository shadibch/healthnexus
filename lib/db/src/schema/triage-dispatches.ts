import { pgTable, integer, timestamp, varchar } from "drizzle-orm/pg-core";

/** Global routing metadata used by Make callbacks to find the originating clinic tenant. */
export const triageDispatchesTable = pgTable("triage_dispatches", {
  externalEventId: varchar("external_event_id", { length: 255 }).primaryKey(),
  medicalCenterId: integer("medical_center_id").notNull(),
  requestedByUserId: integer("requested_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
