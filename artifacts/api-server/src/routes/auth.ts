import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, staffInvitesTable } from "@workspace/db";
import { getSessionUser, requireAuth, startSession, destroySession, resolveSessionUser } from "../lib/session";
import { hashPassword, verifyPassword } from "../lib/password";

const router: IRouter = Router();

// /auth/me intentionally does NOT use requireAuth — deactivated users still need
// to read their own status so the frontend can show the "account deactivated" screen.
router.get("/auth/me", (req, res): void => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json(user);
});

const RegisterBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid email and a password of at least 8 characters are required" });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  // Inherit role + medical center from a pending staff invite when one exists
  const invite = await db.query.staffInvitesTable.findFirst({
    where: eq(staffInvitesTable.email, email),
  });

  const assignedRole = invite ? invite.role : "pending";

  const [created] = await db
    .insert(usersTable)
    .values({
      email,
      name: parsed.data.name?.trim() || null,
      passwordHash: await hashPassword(parsed.data.password),
      role: assignedRole,
      roles: invite ? [invite.role] : [],
      medicalCenterId: invite ? invite.medicalCenterId : null,
      onboardingComplete: false,
    })
    .returning();

  if (invite) {
    await db
      .update(staffInvitesTable)
      .set({ status: "accepted" })
      .where(eq(staffInvitesTable.id, invite.id));
  }

  startSession(req, created.id);
  req.session.save(() => {
    resolveSessionUser(created.id).then(
      (user) => res.status(201).json(user),
      () => res.status(201).json({ ok: true }),
    );
  });
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });

  // Verify against a dummy hash to keep timing consistent for unknown emails
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (user.deactivated) {
    res.status(403).json({ error: "ACCOUNT_DEACTIVATED" });
    return;
  }

  startSession(req, user.id);
  req.session.save(() => {
    resolveSessionUser(user.id).then(
      (sessionUser) => res.json(sessionUser),
      () => res.json({ ok: true }),
    );
  });
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  await destroySession(req);
  res.json({ ok: true });
});

export default router;
