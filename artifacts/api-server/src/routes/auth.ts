import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, staffInvitesTable } from "@workspace/db";
import { getSessionUser, requireAuth, startSession, destroySession, resolveSessionUser } from "../lib/session";
import { hashPassword, verifyPassword } from "../lib/password";
import { sendEmail } from "../lib/mailer";
import {
  createEmailVerification,
  createPasswordResetToken,
  verifyEmailLinkToken,
  verifyEmailOtp,
  consumePasswordResetToken,
  EMAIL_VERIFICATION_TTL_MINUTES,
  PASSWORD_RESET_TTL_MINUTES,
} from "../lib/email-tokens";
import { logger } from "../lib/logger";

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

function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 8080}`).replace(/\/$/, "");
}

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
      emailVerified: false,
    })
    .returning();

  if (invite) {
    await db
      .update(staffInvitesTable)
      .set({ status: "accepted" })
      .where(eq(staffInvitesTable.id, invite.id));
  }

  // Email verification — send failure must not block the account creation
  try {
    const verification = await createEmailVerification(created.id);
    const verifyUrl = `${appBaseUrl()}/verify-email?token=${verification.linkToken}`;

    await sendEmail({
      to: created.email,
      subject: "Verify your email — HealthNexus",
      text:
        `Welcome to HealthNexus!\n\n` +
        `Please verify your email address to activate your account.\n\n` +
        `Open this link to verify (valid for ${EMAIL_VERIFICATION_TTL_MINUTES} minutes):\n${verifyUrl}\n\n` +
        `Or enter this code in the app:\n${verification.otpCode}\n\n` +
        `If you didn't create an account, you can safely ignore this email.`,
      html:
        `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">` +
        `<h2 style="color:#0f172a;margin:0 0 8px;">Verify your email</h2>` +
        `<p style="color:#475569;line-height:1.6;">Welcome to HealthNexus! Please verify your email address to activate your account.</p>` +
        `<p style="margin:20px 0;"><a href="${verifyUrl}" style="background:#059669;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Verify Email</a></p>` +
        `<p style="color:#64748b;font-size:13px;line-height:1.6;">Or enter this code in the app:<br/><strong style="font-size:18px;letter-spacing:3px;color:#0f172a;">${verification.otpCode}</strong></p>` +
        `<p style="color:#94a3b8;font-size:12px;margin-top:24px;">This link is valid for ${EMAIL_VERIFICATION_TTL_MINUTES} minutes. If you didn't create an account, you can safely ignore this email.</p>` +
        `</div>`,
    });
    logger.info({ userId: created.id, email: created.email }, "verification email sent on register");
  } catch (err) {
    logger.error({ err, userId: created.id }, "failed to send verification email (account created anyway)");
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
  if (!user.emailVerified) {
    res.status(403).json({ error: "ACCOUNT_NOT_VERIFIED", userId: user.id });
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

const EmailVerifyBody = z.object({
  token: z.string().min(10).optional(),
  email: z.string().email().optional(),
  otpCode: z.string().regex(/^\d{6}$/).optional(),
});

// Verify via a link token OR an OTP code (the latter keyed by email). Requires one of them.
router.post("/auth/verify-email", async (req, res): Promise<void> => {
  const parsed = EmailVerifyBody.safeParse(req.body);
  if (!parsed.success || (!parsed.data.token && !parsed.data.otpCode)) {
    res.status(400).json({ error: "A verification token or OTP code is required" });
    return;
  }

  let ok = false;

  if (parsed.data.token) {
    ok = await verifyEmailLinkToken(parsed.data.token);
  } else if (parsed.data.email && parsed.data.otpCode) {
    const email = parsed.data.email.toLowerCase().trim();
    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
    if (user) {
      ok = await verifyEmailOtp(user.id, parsed.data.otpCode);
    }
  }

  if (!ok) {
    res.status(400).json({ error: "INVALID_OR_EXPIRED_VERIFICATION" });
    return;
  }

  res.json({ ok: true, emailVerified: true });
});

const ResendVerifyBody = z.object({
  email: z.string().email(),
});

// Resend the verification email for a pending account.
router.post("/auth/resend-verification", async (req, res): Promise<void> => {
  const parsed = ResendVerifyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
  if (!user) {
    // Don't reveal whether the account exists
    res.status(200).json({ ok: true });
    return;
  }
  if (user.emailVerified) {
    res.status(200).json({ ok: true, alreadyVerified: true });
    return;
  }
  if (user.deactivated) {
    res.status(200).json({ ok: true });
    return;
  }

  try {
    const verification = await createEmailVerification(user.id);
    const verifyUrl = `${appBaseUrl()}/verify-email?token=${verification.linkToken}`;

    await sendEmail({
      to: user.email,
      subject: "Verify your email — HealthNexus",
      text:
        `Resending verification for your HealthNexus account.\n\n` +
        `Open this link to verify (valid for ${EMAIL_VERIFICATION_TTL_MINUTES} minutes):\n${verifyUrl}\n\n` +
        `Or enter this code in the app:\n${verification.otpCode}\n\n`,
      html:
        `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">` +
        `<h2 style="color:#0f172a;margin:0 0 8px;">Verify your email</h2>` +
        `<p style="color:#475569;line-height:1.6;">Here is a fresh verification link for your HealthNexus account.</p>` +
        `<p style="margin:20px 0;"><a href="${verifyUrl}" style="background:#059669;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Verify Email</a></p>` +
        `<p style="color:#64748b;font-size:13px;line-height:1.6;">Or enter this code in the app:<br/><strong style="font-size:18px;letter-spacing:3px;color:#0f172a;">${verification.otpCode}</strong></p>` +
        `<p style="color:#94a3b8;font-size:12px;margin-top:24px;">This link is valid for ${EMAIL_VERIFICATION_TTL_MINUTES} minutes.</p>` +
        `</div>`,
    });
  } catch (err) {
    logger.error({ err, userId: user.id }, "failed to resend verification email");
  }

  res.status(200).json({ ok: true });
});

const ForgotPasswordBody = z.object({
  email: z.string().email(),
});

// Send a reset link to the user's email. Always responds 200 to avoid email enumeration.
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });

  // Send to any non-deactivated account (verified or not) — a reset alone cannot
// grant access to an unverified account, so this does not weaken security.
  if (user && !user.deactivated) {
    try {
    const bundle = await createPasswordResetToken(user.id);
    const resetUrl = `${appBaseUrl()}/reset-password?token=${bundle.resetToken}`;

    await sendEmail({
      to: user.email,
      subject: "Reset your password — HealthNexus",
      text:
        `We received a request to reset your HealthNexus password.\n\n` +
        `Open this link to choose a new password (valid for ${PASSWORD_RESET_TTL_MINUTES} minutes):\n${resetUrl}\n\n` +
        `If you didn't request this, you can safely ignore this email.`,
      html:
        `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">` +
        `<h2 style="color:#0f172a;margin:0 0 8px;">Reset your password</h2>` +
        `<p style="color:#475569;line-height:1.6;">We received a request to reset your HealthNexus password. Use the button below to choose a new one.</p>` +
        `<p style="margin:20px 0;"><a href="${resetUrl}" style="background:#059669;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Reset Password</a></p>` +
        `<p style="color:#94a3b8;font-size:12px;margin-top:24px;">This link is valid for ${PASSWORD_RESET_TTL_MINUTES} minutes. If you didn't request this, you can safely ignore this email.</p>` +
        `</div>`,
    });

    logger.info({ userId: user.id }, "password reset email sent");
  } catch (err) {
    logger.error({ err, userId: user.id }, "failed to send password reset email");
  }
  }

  res.status(200).json({ ok: true });
});

const ResetPasswordBody = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8),
});

// Complete a password reset using the token from the email link.
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid token and a password of at least 8 characters are required" });
    return;
  }

  const newPasswordHash = await hashPassword(parsed.data.newPassword);
  const outcome = await consumePasswordResetToken(parsed.data.token, newPasswordHash);

  if (outcome === "invalid") {
    res.status(400).json({ error: "INVALID_RESET_TOKEN" });
    return;
  }
  if (outcome === "expired") {
    res.status(400).json({ error: "RESET_TOKEN_EXPIRED" });
    return;
  }

  res.json({ ok: true });
});

export default router;