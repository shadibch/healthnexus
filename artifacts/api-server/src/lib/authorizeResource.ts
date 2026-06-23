import type { Request, Response, NextFunction } from "express";

type SessionUser = {
  userId: string;
  roles: string[];
  medicalCenterId?: string | null;
  patientDbId?: string | null;
};

type Options<T> = {
  // Extract resource owner / tenant info
  getResource: (req: Request) => Promise<T | null>;
  // How to read tenant id from resource
  getResourceTenantId: (resource: T) => string | null | undefined;
  // Optional: how to read resource id for patients
  getResourcePatientId?: (resource: T) => string | null | undefined;
  // Allowed roles (e.g., ["admin", "doctor"]) 
  allowRoles?: string[];
};

/**
 * Generic authorization guard to prevent IDOR / cross-tenant access.
 */
export function authorizeResource<T>(opts: Options<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = (req as any).sessionUser as SessionUser | undefined;

    if (!session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const resource = await opts.getResource(req);
    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }

    // Role check
    if (opts.allowRoles && !opts.allowRoles.some((r) => session.roles.includes(r))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Patient self-access restriction
    if (session.roles.includes("patient") && opts.getResourcePatientId) {
      const patientId = opts.getResourcePatientId(resource);
      if (session.patientDbId !== patientId) {
        res.status(403).json({ error: "Not your record" });
        return;
      }
    }

    // Tenant isolation
    const resourceTenantId = opts.getResourceTenantId(resource);
    if (
      session.medicalCenterId &&
      resourceTenantId &&
      session.medicalCenterId !== resourceTenantId
    ) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Attach resource for downstream handlers
    (req as any).resource = resource;
    next();
  };
}
