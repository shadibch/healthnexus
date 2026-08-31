import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, NextFunction } from "express";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { pool, db, medicalCentersTable } from "@workspace/db";
import * as schema from "@workspace/db/schema";
import type { TenantClient } from "./tenant-schema";
import { getSessionUser, attachTenantIds, type SessionUser } from "./session";
import { tenantSchemaName } from "./tenant-schema";
import { logger } from "./logger";

/**
 * Request-scoped, per-tenant database access.
 *
 * HealthNexus is multi-tenant with ONE Postgres schema per clinic. A single
 * connection's `search_path` determines which tenant's data an unqualified
 * query touches, so we cannot reuse a shared pooled connection across requests
 * (search_path would leak between tenants).
 *
 * Instead each authenticated request that belongs to a clinic:
 *   1. checks out a dedicated pg client from the pool,
 *   2. sets `search_path = <clinic_schema>, public`,
 *   3. builds a Drizzle instance bound to that client,
 *   4. stores it in AsyncLocalStorage for the duration of the request,
 *   5. releases the client when the request finishes.
 *
 * Routes call `getDb()` (synchronously) to obtain the tenant Drizzle instance
 * for their clinic-scoped tables, and the module-level `db` for global tables.
 */

interface TenantContext {
  schemaName: string;
  centralId: number;
  client: TenantClient;
  tenantDb: NodePgDatabase<typeof schema>;
}

const tenantStore = new AsyncLocalStorage<TenantContext>();

/** Build a Drizzle instance bound to an explicit pg client. */
function makeDb(client: TenantClient): NodePgDatabase<typeof schema> {
  return drizzle(client, { schema });
}

/**
 * Resolve the tenant schema name for a clinic id (or null if unknown).
 * Reads the global `public.medical_centers` table.
 */
export async function resolveSchemaName(
  centralId: number,
): Promise<string | null> {
  const center = await db.query.medicalCentersTable.findFirst({
    where: eq(medicalCentersTable.id, centralId),
  });
  return center?.schemaName ?? tenantSchemaName(centralId);
}

/**
 * Express middleware — mount AFTER `attachSessionUser`. For authenticated
 * users belonging to a clinic, opens a tenant-scoped connection and sets the
 * search_path for the duration of the request.
 */
export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = getSessionUser(req);
  const centralId = user?.medicalCenterId ?? null;

  // No tenant context (not logged in, or staff/patient without a clinic yet,
  // or global administrative work). Run with the shared pool (no search_path).
  if (!centralId) {
    next();
    return;
  }

  const centralIdNum = Number(centralId);
  if (!Number.isFinite(centralIdNum) || centralIdNum <= 0) {
    next();
    return;
  }

  const client = await pool.connect();
  const schemaName = tenantSchemaName(centralIdNum);
  const tenantDb = makeDb(client);

  try {
    await client.query(`SET search_path TO ${schemaName}, public`);
  } catch (err) {
    // The tenant schema doesn't exist yet (not on-boarded). Fall back to public
    // so global operations still work; tenant tables appear after onboarding.
    await client.query("SET search_path TO public").catch(() => undefined);
    logger.warn({ err, centralId: centralIdNum }, "tenantMiddleware: failed to set search_path; using public");
    client.release();
    next();
    return;
  }

  const ctx: TenantContext = { schemaName, centralId: centralIdNum, client, tenantDb };

  // Resolve the user's doctor/patient ids from THIS clinic's schema now that the
  // tenant search_path is active, then expose the enriched session on the request.
  const rawUser = getSessionUser(req);
  const enriched = await attachTenantIds(rawUser as SessionUser, tenantDb).catch(
    () => rawUser as SessionUser,
  );
  (req as any).sessionUser = enriched;

  // ALS propagates across `await` in downstream async handlers, so the tenant
  // Drizzle instance stays active for the whole request chain. Release the
  // client once the response is fully sent.
  res.on("close", () => {
    try {
      client.release();
    } catch {
      /* already released */
    }
  });

  tenantStore.run(ctx, () => next());
}

/**
 * Return the current request's tenant-scoped Drizzle instance, or the shared
 * global instance when no tenant context is active (background jobs, global
 * queries, non-clinic requests).
 */
export function getDb(): NodePgDatabase<typeof schema> {
  const ctx = tenantStore.getStore();
  return ctx ? ctx.tenantDb : db;
}

/** Current tenant context (for logging / diagnostics), or null. */
export function currentTenant(): { schemaName: string; centralId: number } | null {
  const ctx = tenantStore.getStore();
  return ctx ? { schemaName: ctx.schemaName, centralId: ctx.centralId } : null;
}
