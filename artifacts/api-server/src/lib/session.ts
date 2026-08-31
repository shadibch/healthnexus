import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, doctorsTable, patientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
export type AppRole =
  | "admin"
  | "doctor"
  | "patient"
  | "pharmacist"
  | "pharmacy"
  | "receptionist"
  | "pending";

// Priority order for selecting the "primary" display role
const ROLE_PRIORITY: Record<string, number> = {
  admin:        6,
  doctor:       5,
  receptionist: 4,
  pharmacist:   3,
  pharmacy:     2,
  patient:      1,
  pending:      0,
};

export function primaryRole(roles: string[]): AppRole {
  if (roles.length === 0) return "pending";
  return roles.reduce((best, r) =>
    (ROLE_PRIORITY[r] ?? 0) > (ROLE_PRIORITY[best] ?? 0) ? r : best
  ) as AppRole;
}

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

export interface SessionUser {
  userId: number;
  /** Highest-priority role — used for display and backward-compatible single-role checks */
  role: AppRole;
  /** Full set of roles this user holds */
  roles: AppRole[];
  name: string;
  email: string;
  onboardingComplete: boolean;
  medicalCenterId: number | null;
  doctorDbId: number | null;
  patientDbId: number | null;
  aiAssistantEnabled: boolean;
  subscriptionPlan: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
  deactivated: boolean;
}

/** Start a login session for the given user id */
export function startSession(req: Request, userId: number): void {
  (req.session as any).userId = userId;
}

export async function destroySession(req: Request): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

/** Build the SessionUser for a user id (or null if missing/deactivated).
 *
 * Resolves global account fields only (users table in `public`). The tenant
 * fields (`doctorDbId` / `patientDbId`) live in per-clinic schemas and are
 * filled in by `attachTenantIds` once the request's search_path is set to the
 * correct clinic schema (see lib/tenant.ts).
 */
export async function resolveSessionUser(userId: number): Promise<SessionUser | null> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
  });

  if (!user || user.deactivated) return null;

  // Resolve roles — DB may have roles array populated or fall back to role field
  const dbRoles: string[] = Array.isArray(user.roles) && user.roles.length > 0
    ? user.roles
    : user.role !== "pending" ? [user.role] : [];

  const computedPrimary = primaryRole(dbRoles);

  return {
    userId: user.id,
    role: computedPrimary,
    roles: dbRoles as AppRole[],
    name: user.name ?? "",
    email: user.email,
    onboardingComplete: user.onboardingComplete,
    medicalCenterId: user.medicalCenterId ?? null,
    doctorDbId: null,
    patientDbId: null,
    aiAssistantEnabled: user.aiAssistantEnabled,
    subscriptionPlan: user.subscriptionPlan,
    emailVerified: user.emailVerified,
    mustChangePassword: user.mustChangePassword,
    deactivated: user.deactivated,
  };
}

/**
 * Resolve a user's doctor/patient DB ids from the CURRENT tenant (clinic)
 * schema. Must be called while a tenant search_path is active.
 */
export async function attachTenantIds(
  user: SessionUser,
  tenantDb: any,
): Promise<SessionUser> {
  if (!user) return user;

  let doctorDbId: number | null = null;
  let patientDbId: number | null = null;

  if (user.roles.includes("doctor")) {
    const doctor = await tenantDb.query.doctorsTable.findFirst({
      where: eq(doctorsTable.userId, user.userId),
    });
    doctorDbId = doctor?.id ?? null;
  }

  if (user.roles.includes("patient")) {
    const patient = await tenantDb.query.patientsTable.findFirst({
      where: eq(patientsTable.userId, user.userId),
    });
    patientDbId = patient?.id ?? null;
  }

  return { ...user, doctorDbId, patientDbId };
}

export async function attachSessionUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = (req.session as any)?.userId as number | undefined;
  if (!userId) {
    (req as any).sessionUser = null;
    return next();
  }

  try {
    const sessionUser = await resolveSessionUser(userId);
    (req as any).sessionUser = sessionUser;

    next();
  } catch (err) {
    next(err);
  }
}

export function getSessionUser(req: Request): SessionUser | null {
  return (req as any).sessionUser ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (user.deactivated) {
    res.status(403).json({ error: "ACCOUNT_DEACTIVATED" });
    return;
  }
  next();
}

/** Passes if the user holds ANY of the listed roles */
export function requireRole(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = getSessionUser(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.some(r => user.roles.includes(r))) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
