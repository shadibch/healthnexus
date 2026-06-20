import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, staffInvitesTable, doctorsTable, patientsTable } from "@workspace/db";
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

export interface SessionUser {
  userId: number;
  clerkId: string;
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
  mustChangePassword: boolean;
  deactivated: boolean;
}

export async function attachSessionUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  if (!auth?.userId) {
    (req as any).sessionUser = null;
    return next();
  }

  try {
    let user = await db.query.usersTable.findFirst({
      where: eq(usersTable.clerkId, auth.userId),
    });

    if (!user) {
      const claims = (auth.sessionClaims ?? {}) as Record<string, any>;
      const email = ((claims.email as string) ?? "").toLowerCase().trim();
      const name =
        (claims.fullName as string) ||
        (claims.firstName as string) ||
        email;

      const invite = email
        ? await db.query.staffInvitesTable.findFirst({
            where: eq(staffInvitesTable.email, email),
          })
        : null;

      const assignedRole = invite ? invite.role : "pending";
      const assignedRoles: string[] = invite ? [invite.role] : [];

      const [created] = await db
        .insert(usersTable)
        .values({
          clerkId: auth.userId,
          email,
          name,
          role: assignedRole,
          roles: assignedRoles,
          medicalCenterId: invite ? invite.medicalCenterId : null,
          onboardingComplete: false,
        })
        .returning();
      user = created;

      if (invite) {
        await db
          .update(staffInvitesTable)
          .set({ status: "accepted" })
          .where(eq(staffInvitesTable.id, invite.id));
      }
    }

    // Resolve roles — DB may have roles array populated or fall back to role field
    const dbRoles: string[] = Array.isArray(user.roles) && user.roles.length > 0
      ? user.roles
      : user.role !== "pending" ? [user.role] : [];

    const computedPrimary = primaryRole(dbRoles);

    let doctorDbId: number | null = null;
    let patientDbId: number | null = null;

    if (dbRoles.includes("doctor")) {
      const doctor = await db.query.doctorsTable.findFirst({
        where: eq(doctorsTable.userId, user.id),
      });
      doctorDbId = doctor?.id ?? null;
    }

    if (dbRoles.includes("patient")) {
      const patient = await db.query.patientsTable.findFirst({
        where: eq(patientsTable.userId, user.id),
      });
      patientDbId = patient?.id ?? null;
    }

    (req as any).sessionUser = {
      userId: user.id,
      clerkId: user.clerkId,
      role: computedPrimary,
      roles: dbRoles as AppRole[],
      name: user.name ?? "",
      email: user.email,
      onboardingComplete: user.onboardingComplete,
      medicalCenterId: user.medicalCenterId ?? null,
      doctorDbId,
      patientDbId,
      aiAssistantEnabled: user.aiAssistantEnabled,
      subscriptionPlan: user.subscriptionPlan,
      mustChangePassword: user.mustChangePassword,
      deactivated: user.deactivated,
    } satisfies SessionUser;

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
