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

export interface SessionUser {
  userId: number;
  clerkId: string;
  role: AppRole;
  name: string;
  email: string;
  onboardingComplete: boolean;
  medicalCenterId: number | null;
  doctorDbId: number | null;
  patientDbId: number | null;
  aiAssistantEnabled: boolean;
  subscriptionPlan: string;
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

      const [created] = await db
        .insert(usersTable)
        .values({
          clerkId: auth.userId,
          email,
          name,
          role: invite ? invite.role : "pending",
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

    let doctorDbId: number | null = null;
    let patientDbId: number | null = null;

    if (user.role === "doctor") {
      const doctor = await db.query.doctorsTable.findFirst({
        where: eq(doctorsTable.userId, user.id),
      });
      doctorDbId = doctor?.id ?? null;
    }

    if (user.role === "patient") {
      const patient = await db.query.patientsTable.findFirst({
        where: eq(patientsTable.userId, user.id),
      });
      patientDbId = patient?.id ?? null;
    }

    (req as any).sessionUser = {
      userId: user.id,
      clerkId: user.clerkId,
      role: user.role as AppRole,
      name: user.name ?? "",
      email: user.email,
      onboardingComplete: user.onboardingComplete,
      medicalCenterId: user.medicalCenterId ?? null,
      doctorDbId,
      patientDbId,
      aiAssistantEnabled: user.aiAssistantEnabled,
      subscriptionPlan: user.subscriptionPlan,
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
  next();
}

export function requireRole(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = getSessionUser(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
