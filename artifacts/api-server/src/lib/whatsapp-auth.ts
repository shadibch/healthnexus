import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, medicalCentersTable, whatsappIntegrationsTable } from "@workspace/db";
import { getSessionUser } from "./session";
import { logger } from "./logger";

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<number, RateBucket>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 120;

setInterval(() => {
  const now = Date.now();
  for (const [id, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(id);
  }
}, RATE_WINDOW_MS).unref();

function failure(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}

/**
 * Runs before tenantMiddleware. It authenticates bearer credentials and gives
 * the existing tenant middleware the authorized clinic ID for search_path setup.
 * Browser admins use the separate /credentials management endpoints.
 */
export async function whatsappIntegrationAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (process.env.NODE_ENV === "production" && !req.secure) {
    failure(res, 426, "HTTPS_REQUIRED", "WhatsApp integration endpoints require HTTPS");
    return;
  }
  const integrationPath = req.originalUrl.split("?", 1)[0].replace(/^\/api\/whatsapp(?=\/|$)/, "") || "/";
  if (["/credentials", "/schedule-rules", "/unavailable-periods", "/time-zone"].some((path) =>
    integrationPath === path || integrationPath.startsWith(`${path}/`),
  )) {
    next();
    return;
  }

  const authorization = req.get("authorization") ?? "";
  const match = /^Bearer\s+(hnwa_[A-Za-z0-9_-]{32,})$/i.exec(authorization);
  if (!match) {
    failure(res, 401, "INVALID_INTEGRATION_CREDENTIAL", "A valid integration bearer token is required");
    return;
  }

  try {
    const tokenHash = createHash("sha256").update(match[1]).digest("hex");
    const credential = await db.query.whatsappIntegrationsTable.findFirst({
      where: eq(whatsappIntegrationsTable.tokenHash, tokenHash),
    });
    if (!credential || credential.revokedAt || (credential.expiresAt && credential.expiresAt <= new Date())) {
      failure(res, 401, "INVALID_INTEGRATION_CREDENTIAL", "The integration credential is invalid or expired");
      return;
    }
    const center = await db.query.medicalCentersTable.findFirst({
      where: eq(medicalCentersTable.id, credential.medicalCenterId),
    });
    if (!center) {
      failure(res, 401, "INVALID_INTEGRATION_CREDENTIAL", "The integration clinic is no longer available");
      return;
    }

    const bucket = rateBuckets.get(credential.id);
    const now = Date.now();
    if (bucket && bucket.resetAt > now && bucket.count >= RATE_LIMIT) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      failure(res, 429, "RATE_LIMITED", "Too many requests; retry after the indicated delay");
      return;
    }
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(credential.id, { count: 1, resetAt: now + RATE_WINDOW_MS });
    } else {
      bucket.count += 1;
    }

    const integration = {
      id: credential.id,
      medicalCenterId: credential.medicalCenterId,
    };
    (req as any).whatsappIntegration = integration;
    res.locals.whatsappIntegration = integration;

    // Reuse the existing tenant middleware/search_path logic. The service has
    // no staff or patient role and therefore cannot inherit browser permissions.
    (req as any).sessionUser = {
      userId: 0,
      role: "pending",
      roles: [],
      name: "WhatsApp integration",
      email: "",
      phone: null,
      onboardingComplete: true,
      medicalCenterId: credential.medicalCenterId,
      doctorDbId: null,
      patientDbId: null,
      aiAssistantEnabled: false,
      subscriptionPlan: "integration",
      emailVerified: true,
      mustChangePassword: false,
      deactivated: false,
    };
    next();
  } catch (error) {
    logger.error({ errorName: error instanceof Error ? error.name : "unknown" }, "WhatsApp integration authentication failed");
    failure(res, 503, "INTEGRATION_AUTH_UNAVAILABLE", "Integration authentication is temporarily unavailable");
  }
}

export function getWhatsappIntegration(res: Response): { id: number; medicalCenterId: number } | null {
  return res.locals.whatsappIntegration ?? null;
}

export function integrationRequired(res: Response): boolean {
  if (getWhatsappIntegration(res)) return true;
  failure(res, 401, "INVALID_INTEGRATION_CREDENTIAL", "A valid integration bearer token is required");
  return false;
}

export function requireClinicAdmin(req: Request, res: Response): { userId: number; medicalCenterId: number } | null {
  const user = getSessionUser(req);
  if (!user) {
    failure(res, 401, "AUTHENTICATION_REQUIRED", "Sign in as a clinic administrator");
    return null;
  }
  if (!user.roles.includes("admin") || user.medicalCenterId == null) {
    failure(res, 403, "ADMIN_REQUIRED", "Only a clinic administrator can manage integration credentials");
    return null;
  }
  return { userId: user.userId, medicalCenterId: user.medicalCenterId };
}
