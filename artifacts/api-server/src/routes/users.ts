import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { pool, usersTable, medicalCentersTable, staffInvitesTable, doctorsTable, patientsTable } from "@workspace/db";
import { requireAuth, getSessionUser, primaryRole } from "../lib/session";
import { hashPassword, verifyPassword } from "../lib/password";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import { getDb } from "../lib/tenant";
import { ensureTenantSchema, tenantSchemaName } from "../lib/tenant-schema";
import { logger } from "../lib/logger";
import { z } from "zod";

const router: IRouter = Router();

const STAFF_ROLES = ["admin", "doctor", "receptionist", "pharmacist", "pharmacy"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  res.json(session);
});

const CompleteAdminOnboardingBody = z.object({
  centerName: z.string().min(2),
  address: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  adminName: z.string().optional(),
  specialization: z.string().optional(),
});

const CompletePatientOnboardingBody = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  phone: z.string().optional(),
  allergies: z.string().optional(),
  longTermConditions: z.string().optional(),
  currentMedications: z.string().optional(),
});

// ── POST /users/onboarding/role ───────────────────────────────────────────────
// Accept an array of roles. Primary role is computed by priority.
router.post("/users/onboarding/role", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;

  if (session.role !== "pending" && session.roles.length > 0) {
    res.status(400).json({ error: "Role already set" });
    return;
  }

  const rawRoles: unknown = req.body.roles;
  const rawRole: unknown = req.body.role;

  // Accept either roles[] or legacy single role
  let roles: string[] = [];
  if (Array.isArray(rawRoles)) {
    roles = rawRoles.filter((r): r is string => typeof r === "string");
  } else if (typeof rawRole === "string") {
    roles = [rawRole];
  }

  const validRoles = ["admin", "patient", "doctor", "receptionist", "pharmacist", "pharmacy"];
  const invalid = roles.find(r => !validRoles.includes(r));
  if (invalid || roles.length === 0) {
    res.status(400).json({ error: "Invalid role(s)" });
    return;
  }

  // Patient must be alone — cannot be combined with staff roles
  if (roles.includes("patient") && roles.length > 1) {
    res.status(400).json({ error: "Patient role cannot be combined with staff roles" });
    return;
  }

  const primary = primaryRole(roles);
  await getDb().update(usersTable)
    .set({ role: primary, roles })
    .where(eq(usersTable.id, session.userId));

  res.json({ ok: true, role: primary, roles });
});

// ── POST /users/onboarding/admin ──────────────────────────────────────────────
router.post("/users/onboarding/admin", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("admin")) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const parsed = CompleteAdminOnboardingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { centerName, address, latitude, longitude, adminName, specialization } = parsed.data;

  // ── Create the clinic and its dedicated tenant schema (schema-per-clinic) ──
  // Schema name is deterministic from the center id: tenant_clinic_id_<id>.
  const client = await pool.connect();
  let centerId: number;
  let schemaName: string;
  let doctor: (typeof doctorsTable.$inferSelect) | null = null;
  const wantsDoctor = session.roles.includes("doctor");
  try {
    await client.query("BEGIN");

    const [center] = await getDb().insert(medicalCentersTable).values({
      name: centerName,
      address: address ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      adminUserId: session.userId,
    }).returning();

    centerId = center.id;
    schemaName = tenantSchemaName(centerId);

    // Clone the clinic-scoped working tables into the new schema.
    await ensureTenantSchema(client, centerId);

    // If the admin is also a doctor, create their doctor profile INSIDE the new
    // clinic schema (doctors is a tenant table). Point the checked-out client at
    // the new schema and write through a tenant-bound Drizzle instance so the
    // record lives in tenant_clinic_id_<id>.doctors, atomic with the clinic insert.
    if (wantsDoctor) {
      await client.query(`SET search_path TO ${schemaName}, public`);
      const tenantDb = drizzle(client, { schema });
      const displayName = adminName?.trim() || session.name || session.email;
      const nameParts = displayName.split(" ");
      const firstName = nameParts[0] ?? session.email;
      const lastName = nameParts.slice(1).join(" ") || "-";
      [doctor] = await tenantDb.insert(doctorsTable).values({
        userId: session.userId,
        firstName,
        lastName,
        specialization: specialization?.trim() || "General Practitioner",
        email: session.email,
        medicalCenterId: centerId,
      }).returning();
    }

    // Persist the schema name on the registry row.
    await getDb().update(medicalCentersTable)
      .set({ schemaName })
      .where(eq(medicalCentersTable.id, centerId));

    await client.query("COMMIT");

    logger.info({ centerId, schemaName }, "created clinic tenant schema");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    logger.error({ err }, "failed to create clinic tenant schema");
    res.status(500).json({ error: "Failed to create clinic. Please try again." });
    return;
  }
  client.release();

  const userUpdates: Record<string, unknown> = { medicalCenterId: centerId, onboardingComplete: true };
  if (adminName?.trim()) userUpdates.name = adminName.trim();

  await getDb().update(usersTable).set(userUpdates as any).where(eq(usersTable.id, session.userId));

  const center = await getDb().query.medicalCentersTable.findFirst({
    where: eq(medicalCentersTable.id, centerId),
  });

  res.json({ ok: true, center, doctor });
});

// ── POST /users/onboarding/patient ────────────────────────────────────────────
router.post("/users/onboarding/patient", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("patient")) {
    res.status(403).json({ error: "Patient only" });
    return;
  }

  const parsed = CompletePatientOnboardingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const [patient] = await getDb().insert(patientsTable).values({
    userId: session.userId,
    firstName: data.firstName,
    lastName: data.lastName,
    dateOfBirth: data.dateOfBirth ?? null,
    gender: data.gender ?? null,
    phone: data.phone ?? null,
    email: session.email,
    allergies: data.allergies ?? null,
    longTermConditions: data.longTermConditions ?? null,
    currentMedications: data.currentMedications ?? null,
  }).returning();

  await getDb().update(usersTable).set({ onboardingComplete: true }).where(eq(usersTable.id, session.userId));
  res.json({ ok: true, patient });
});

// ── POST /users/create-staff ──────────────────────────────────────────────────
const CreateStaffBody = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["doctor", "pharmacist", "receptionist"]),
  tempPassword: z.string().min(8),
  specialization: z.string().optional(),
});

router.post("/users/create-staff", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("admin") || !session.medicalCenterId) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, email, role, tempPassword, specialization } = parsed.data;
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? name;
  const lastName = nameParts.slice(1).join(" ") || "-";

  const existing = await getDb().query.usersTable.findFirst({
    where: eq(usersTable.email, email.toLowerCase()),
  });
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  let dbUser;
  try {
    [dbUser] = await getDb().insert(usersTable).values({
      email: email.toLowerCase(),
      name: name.trim(),
      passwordHash: await hashPassword(tempPassword),
      role,
      roles: [role],
      medicalCenterId: session.medicalCenterId,
      onboardingComplete: true,
      mustChangePassword: true,
    }).returning();
  } catch (err) {
    res.status(500).json({ error: "Failed to create staff account" });
    return;
  }

  if (role === "doctor") {
    try {
      await getDb().insert(doctorsTable).values({
        userId: dbUser.id,
        firstName,
        lastName,
        specialization: specialization?.trim() || "General Practitioner",
        email: email.toLowerCase(),
        medicalCenterId: session.medicalCenterId,
      });
    } catch (_) {
      // non-fatal — doctor record can be updated later
    }
  }

  res.json({ ok: true, user: { id: dbUser.id, email: dbUser.email, name: dbUser.name, role } });
});

// ── POST /users/invite-staff (kept for backward compat) ───────────────────────
const InviteStaffBody = z.object({
  email: z.string().email(),
  role: z.enum(["doctor", "pharmacist", "receptionist"]),
});

router.post("/users/invite-staff", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("admin") || !session.medicalCenterId) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const parsed = InviteStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, role } = parsed.data;

  const [invite] = await getDb().insert(staffInvitesTable).values({
    email: email.toLowerCase(),
    role,
    medicalCenterId: session.medicalCenterId,
    invitedByUserId: session.userId,
    status: "pending",
  }).returning();

  res.json({ ok: true, invite });
});

// ── POST /users/mark-password-changed ─────────────────────────────────────────
router.post("/users/mark-password-changed", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  await getDb().update(usersTable)
    .set({ mustChangePassword: false })
    .where(eq(usersTable.id, session.userId));
  res.json({ ok: true });
});

// ── POST /users/change-password ───────────────────────────────────────────────
const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post("/users/change-password", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  const user = await getDb().query.usersTable.findFirst({ where: eq(usersTable.id, session.userId) });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    res.status(400).json({ error: "New password must be different from the current one" });
    return;
  }

  await getDb().update(usersTable)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword) })
    .where(eq(usersTable.id, session.userId));

  res.json({ ok: true });
});

// ── GET /users/staff ──────────────────────────────────────────────────────────
router.get("/users/staff", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("admin") || !session.medicalCenterId) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const staff = await getDb().select().from(usersTable).where(eq(usersTable.medicalCenterId, session.medicalCenterId));
  const invites = await getDb().select().from(staffInvitesTable).where(eq(staffInvitesTable.medicalCenterId, session.medicalCenterId));
  res.json({ staff, invites });
});

// ── PATCH /users/:id/roles ────────────────────────────────────────────────────
const MANAGEABLE_ROLES = ["admin", "doctor", "receptionist", "pharmacist", "pharmacy"] as const;

router.patch("/users/:id/roles", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("admin") || !session.medicalCenterId) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const targetId = parseInt(String(req.params.id));
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const rawRoles: unknown = req.body.roles;
  if (!Array.isArray(rawRoles) || rawRoles.length === 0) {
    res.status(400).json({ error: "At least one role is required" });
    return;
  }
  const roles = rawRoles.filter((r): r is string => typeof r === "string" && MANAGEABLE_ROLES.includes(r as any));
  if (roles.length === 0) {
    res.status(400).json({ error: "No valid roles provided" });
    return;
  }

  const target = await getDb().query.usersTable.findFirst({ where: eq(usersTable.id, targetId) });
  if (!target || target.medicalCenterId !== session.medicalCenterId) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const primary = primaryRole(roles);
  await getDb().update(usersTable).set({ role: primary, roles }).where(eq(usersTable.id, targetId));

  // Auto-create doctor record when doctor role is newly added
  const hadDoctor = Array.isArray(target.roles) && target.roles.includes("doctor");
  const getsDoctor = roles.includes("doctor");
  if (getsDoctor && !hadDoctor) {
    const existing = await getDb().query.doctorsTable.findFirst({ where: eq(doctorsTable.userId, targetId) });
    if (!existing) {
      const nameParts = (target.name ?? target.email).split(/\s+/);
      await getDb().insert(doctorsTable).values({
        userId: target.id,
        firstName: nameParts[0] ?? target.email,
        lastName: nameParts.slice(1).join(" ") || "-",
        specialization: "General Practitioner",
        email: target.email,
        medicalCenterId: session.medicalCenterId,
      });
    }
  }

  res.json({ ok: true, roles, role: primary });
});

// ── PATCH /users/:id/deactivate ───────────────────────────────────────────────
router.patch("/users/:id/deactivate", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("admin") || !session.medicalCenterId) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const targetId = parseInt(String(req.params.id));
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  if (targetId === session.userId) {
    res.status(400).json({ error: "You cannot deactivate your own account" });
    return;
  }

  const deactivated: boolean = !!req.body.deactivated;

  const target = await getDb().query.usersTable.findFirst({ where: eq(usersTable.id, targetId) });
  if (!target || target.medicalCenterId !== session.medicalCenterId) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await getDb().update(usersTable).set({ deactivated }).where(eq(usersTable.id, targetId));
  res.json({ ok: true, deactivated });
});

// ── PATCH /users/ai-assistant ─────────────────────────────────────────────────
router.patch("/users/ai-assistant", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("admin") && !session.roles.includes("doctor")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { enabled, targetUserId } = req.body as { enabled?: boolean; targetUserId?: number };
  const userId = (session.roles.includes("admin") && targetUserId) ? targetUserId : session.userId;
  await getDb().update(usersTable).set({ aiAssistantEnabled: enabled ?? false }).where(eq(usersTable.id, userId));
  res.json({ ok: true });
});

export default router;
