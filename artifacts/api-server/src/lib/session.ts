import type { Request, Response, NextFunction } from "express";

export interface SessionUser {
  userId: string;
  role: "doctor" | "patient" | "pharmacy" | "receptionist";
  name: string;
  email: string;
  doctorDbId: number | null;
  patientDbId: number | null;
}

export function getSessionUser(req: Request): SessionUser | null {
  const s = (req as any).session;
  if (!s?.userId) return null;
  return {
    userId: s.userId,
    role: s.role,
    name: s.name,
    email: s.email,
    doctorDbId: s.doctorDbId ?? null,
    patientDbId: s.patientDbId ?? null,
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export function requireRole(...roles: Array<"doctor" | "patient" | "pharmacy" | "receptionist">) {
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
