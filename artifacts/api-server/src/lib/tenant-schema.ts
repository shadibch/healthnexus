/**
 * A Postgres client connection. We use drizzle's `NodePgClient` type
 * (covers pg Pool/PoolClient, all of which expose `.query()`).
 */
export type TenantClient = import("drizzle-orm/node-postgres").NodePgClient;/**
 * Tables that are CLONED into every clinic's tenant schema (schema-per-clinic).
 * These are the clinic-scoped working tables. Tables NOT listed here (users,
 * medical_centers, email_verification_tokens, password_reset_tokens,
 * medications, pharmacies, doctor_categories, haad_activity_catalogue) stay
 * global in the `public` schema and are shared across all clinics.
 *
 * Each tenant table is created via `CREATE TABLE ... (LIKE public.<t>
 * INCLUDING ALL)` so it always mirrors the current Drizzle schema (columns,
 * defaults, NOT NULL, checks, indexes) without hand-written DDL drift.
 */
export const TENANT_TABLES = [
  "patients",
  "doctors",
  "appointments",
  "consultations",
  "prescriptions",
  "prescription_items",
  "stock",
  "medical_orders",
  "encounter_activities",
  "clinic_settings",
  "staff_invites",
  "appointment_reminder_configs",
  "appointment_reminder_logs",
  "conversations",
  "messages",
  "pharmacy_inventory",
] as const;

/** Build a Postgres-safe schema identifier for a clinic tenant. */
export function tenantSchemaName(centralId: number): string {
  return `tenant_clinic_id_${centralId}`;
}

/**
 * Create the per-clinic schema (if missing) and clone the tenant tables into it.
 * Idempotent — safe to call on every signup/onboarding and on retries.
 *
 * Note: run inside the onboarding transaction; `client` is the shared pg client
 * used for the medical_centers insert so all mutations commit together.
 */
export async function ensureTenantSchema(
  client: TenantClient,
  centralId: number,
): Promise<string> {
  const schema = tenantSchemaName(centralId);

  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

  for (const table of TENANT_TABLES) {
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`,
    );
  }

  return schema;
}
