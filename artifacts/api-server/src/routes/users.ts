import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, medicalCentersTable, staffInvitesTable, doctorsTable, patientsTable } from "@workspace/db";
import { requireAuth, getSessionUser, primaryRole } from "../lib/session";
import { z } from "zod";

const CLERK_API = "https://api.clerk.com/v1";

async function clerkCreateUser(opts: {
  emailAddress: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${CLERK_API}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email_address: [opts.emailAddress],
      password: opts.password,
      first_name: opts.firstName,
      last_name: opts.lastName,
      skip_password_checks: true,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    const msg = body?.errors?.[0]?.long_message || body?.errors?.[0]?.message || "Failed to create account";
    throw new Error(msg);
  }
  return res.json() as Promise<{ id: string }>;
}

async function clerkDeleteUser(clerkId: string): Promise<void> {
  await fetch(`${CLERK_API}/users/${clerkId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
  }).catch(() => {});
}

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
  consultationFee: z.string().optional(),
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
  await db.update(usersTable)
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

  const { centerName, address, latitude, longitude, adminName, specialization, consultationFee } = parsed.data;
  const [center] = await db.insert(medicalCentersTable).values({
    name: centerName,
    address: address ?? null,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    adminUserId: session.userId,
  }).returning();

  const userUpdates: Record<string, unknown> = { medicalCenterId: center.id, onboardingComplete: true };
  if (adminName?.trim()) userUpdates.name = adminName.trim();

  await db.update(usersTable).set(userUpdates as any).where(eq(usersTable.id, session.userId));

  // If the admin is also a doctor, create a doctor record
  let doctor = null;
  if (session.roles.includes("doctor")) {
    const displayName = adminName?.trim() || session.name || session.email;
    const nameParts = displayName.split(" ");
    const firstName = nameParts[0] ?? session.email;
    const lastName = nameParts.slice(1).join(" ") || "-";
    [doctor] = await db.insert(doctorsTable).values({
      userId: session.userId,
      clerkId: session.clerkId ?? null,
      firstName,
      lastName,
      specialization: specialization?.trim() || "General Practitioner",
      consultationFee: consultationFee?.trim() || null,
      email: session.email,
      medicalCenterId: center.id,
    }).returning();
  }

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
  const [patient] = await db.insert(patientsTable).values({
    userId: session.userId,
    clerkId: session.clerkId,
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

  await db.update(usersTable).set({ onboardingComplete: true }).where(eq(usersTable.id, session.userId));
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

  let clerkId: string | null = null;
  try {
    const clerkUser = await clerkCreateUser({
      emailAddress: email.toLowerCase(),
      password: tempPassword,
      firstName,
      lastName,
    });
    clerkId = clerkUser.id;
  } catch (err: any) {
    res.status(409).json({ error: err.message || "Failed to create account in auth system" });
    return;
  }

  let dbUser;
  try {
    [dbUser] = await db.insert(usersTable).values({
      clerkId: clerkId!,
      email: email.toLowerCase(),
      name: name.trim(),
      role,
      roles: [role],
      medicalCenterId: session.medicalCenterId,
      onboardingComplete: true,
      mustChangePassword: true,
    }).returning();
  } catch (err) {
    await clerkDeleteUser(clerkId!);
    res.status(500).json({ error: "Failed to save user — account creation rolled back" });
    return;
  }

  if (role === "doctor") {
    try {
      await db.insert(doctorsTable).values({
        userId: dbUser.id,
        clerkId: clerkId!,
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

  const [invite] = await db.insert(staffInvitesTable).values({
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
  await db.update(usersTable)
    .set({ mustChangePassword: false })
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

  const staff = await db.select().from(usersTable).where(eq(usersTable.medicalCenterId, session.medicalCenterId));
  const invites = await db.select().from(staffInvitesTable).where(eq(staffInvitesTable.medicalCenterId, session.medicalCenterId));
  res.json({ staff, invites });
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
  await db.update(usersTable).set({ aiAssistantEnabled: enabled ?? false }).where(eq(usersTable.id, userId));
  res.json({ ok: true });
});

export default router;
