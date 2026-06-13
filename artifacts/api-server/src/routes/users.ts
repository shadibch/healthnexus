import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, medicalCentersTable, staffInvitesTable, doctorsTable, patientsTable } from "@workspace/db";
import { requireAuth, getSessionUser } from "../lib/session";
import { z } from "zod";

const router: IRouter = Router();

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  res.json(session);
});

const CompleteAdminOnboardingBody = z.object({
  centerName: z.string().min(2),
  address: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  adminIsDoctor: z.boolean().optional().default(true),
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

router.post("/users/onboarding/role", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const { role } = req.body as { role?: string };

  if (!role || !["admin", "patient"].includes(role)) {
    res.status(400).json({ error: "Role must be admin or patient" });
    return;
  }

  if (session.role !== "pending") {
    res.status(400).json({ error: "Role already set" });
    return;
  }

  await db.update(usersTable).set({ role }).where(eq(usersTable.id, session.userId));
  res.json({ ok: true, role });
});

router.post("/users/onboarding/admin", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const parsed = CompleteAdminOnboardingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { centerName, address, latitude, longitude, adminIsDoctor } = parsed.data;
  const [center] = await db.insert(medicalCentersTable).values({
    name: centerName,
    address: address ?? null,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    adminUserId: session.userId,
  }).returning();

  await db.update(usersTable).set({
    medicalCenterId: center.id,
    onboardingComplete: true,
  }).where(eq(usersTable.id, session.userId));

  // If the admin is also a doctor, create a doctor record for them
  let doctor = null;
  if (adminIsDoctor) {
    const nameParts = (session.name ?? session.email).split(" ");
    const firstName = nameParts[0] ?? session.email;
    const lastName = nameParts.slice(1).join(" ") || "-";
    [doctor] = await db.insert(doctorsTable).values({
      userId: session.userId,
      clerkId: session.clerkId ?? null,
      firstName,
      lastName,
      specialization: "General Practitioner",
      email: session.email,
      medicalCenterId: center.id,
    }).returning();
  }

  res.json({ ok: true, center, doctor });
});

router.post("/users/onboarding/patient", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "patient") {
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

const InviteStaffBody = z.object({
  email: z.string().email(),
  role: z.enum(["doctor", "pharmacist", "receptionist"]),
});

router.post("/users/invite-staff", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "admin" || !session.medicalCenterId) {
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

router.get("/users/staff", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "admin" || !session.medicalCenterId) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const staff = await db.select().from(usersTable).where(eq(usersTable.medicalCenterId, session.medicalCenterId));
  const invites = await db.select().from(staffInvitesTable).where(eq(staffInvitesTable.medicalCenterId, session.medicalCenterId));
  res.json({ staff, invites });
});

router.patch("/users/ai-assistant", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "admin" && session.role !== "doctor") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { enabled, targetUserId } = req.body as { enabled?: boolean; targetUserId?: number };
  const userId = (session.role === "admin" && targetUserId) ? targetUserId : session.userId;
  await db.update(usersTable).set({ aiAssistantEnabled: enabled ?? false }).where(eq(usersTable.id, userId));
  res.json({ ok: true });
});

export default router;
