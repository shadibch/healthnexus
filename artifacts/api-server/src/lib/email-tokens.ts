import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  db,
  usersTable,
  emailVerificationTokensTable,
  passwordResetTokensTable,
} from "@workspace/db";

const VERIFY_EMAIL_TTL_MS = 15 * 60 * 1000; // link + OTP valid 15 minutes
const RESET_PASSWORD_TTL_MS = 10 * 60 * 1000; // link valid 10 minutes

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function randomToken(): string {
  return randomBytes(32).toString("hex");
}

function randomOtp(): string {
  const val = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return val.toString().padStart(6, "0");
}

export interface VerificationBundle {
  linkToken: string;
  otpCode: string;
  expiresAt: Date;
}

export interface ResetBundle {
  resetToken: string;
  expiresAt: Date;
}

/** Create a fresh (link token + OTP) bundle for email verification. Invalidate any prior ones. */
export async function createEmailVerification(
  userId: number,
): Promise<VerificationBundle> {
  const linkToken = randomToken();
  const otpCode = randomOtp();
  const expiresAt = new Date(Date.now() + VERIFY_EMAIL_TTL_MS);

  await db
    .delete(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.userId, userId));

  await db.insert(emailVerificationTokensTable).values({
    userId,
    tokenHash: sha256(linkToken),
    otpCodeHash: sha256(otpCode),
    expiresAt,
  });

  return { linkToken, otpCode, expiresAt };
}

/** Create a password-reset token. Invalidate any prior ones for the user. */
export async function createPasswordResetToken(
  userId: number,
): Promise<ResetBundle> {
  const resetToken = randomToken();
  const expiresAt = new Date(Date.now() + RESET_PASSWORD_TTL_MS);

  await db
    .delete(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.userId, userId));

  await db.insert(passwordResetTokensTable).values({
    userId,
    tokenHash: sha256(resetToken),
    expiresAt,
  });

  return { resetToken, expiresAt };
}

/**
 * Verify a link token (or OTP) and mark the user's email as verified.
 * Returns whether verification succeeded.
 */
export async function verifyEmailLinkToken(token: string): Promise<boolean> {
  const tokenHash = sha256(token);
  const row = await db.query.emailVerificationTokensTable.findFirst({
    where: eq(emailVerificationTokensTable.tokenHash, tokenHash),
  });

  if (!row) return false;
  if (row.expiresAt.getTime() < Date.now()) return false;

  await db
    .update(usersTable)
    .set({ emailVerified: true })
    .where(eq(usersTable.id, row.userId));
  await db
    .delete(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.id, row.id));

  return true;
}

/** Verify an OTP code that was sent in email, then mark the user's email as verified. */
export async function verifyEmailOtp(userId: number, otpCode: string): Promise<boolean> {
  const otpCodeHash = sha256(otpCode);
  const row = await db.query.emailVerificationTokensTable.findFirst({
    where: and(
      eq(emailVerificationTokensTable.userId, userId),
      eq(emailVerificationTokensTable.otpCodeHash, otpCodeHash),
    ),
  });

  if (!row) return false;
  if (row.expiresAt.getTime() < Date.now()) return false;

  await db
    .update(usersTable)
    .set({ emailVerified: true })
    .where(eq(usersTable.id, row.userId));
  await db
    .delete(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.id, row.id));

  return true;
}

/**
 * Validate a password-reset token, and if valid, set the user's new password.
 * Returns a result describing the outcome.
 */
export async function consumePasswordResetToken(
  token: string,
  newPasswordHash: string,
): Promise<"ok" | "invalid" | "expired"> {
  const tokenHash = sha256(token);
  const row = await db.query.passwordResetTokensTable.findFirst({
    where: and(
      eq(passwordResetTokensTable.tokenHash, tokenHash),
      isNull(passwordResetTokensTable.usedAt),
    ),
  });

  if (!row) return "invalid";
  if (row.expiresAt.getTime() < Date.now()) return "expired";

  await db
    .update(usersTable)
    .set({ passwordHash: newPasswordHash, mustChangePassword: false })
    .where(eq(usersTable.id, row.userId));

  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokensTable.id, row.id));

  // Prevent a verified user from being double-orphaned: if the account was
  // created but never verified, keep it as is — the password update alone is enough.
  return "ok";
}

/** Human-friendly validity window for the verify-email link/OTP (15 min) */
export const EMAIL_VERIFICATION_TTL_MINUTES = VERIFY_EMAIL_TTL_MS / 60000;
/** Human-friendly validity window for the password-reset link (10 min) */
export const PASSWORD_RESET_TTL_MINUTES = RESET_PASSWORD_TTL_MS / 60000;