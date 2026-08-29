import { logger } from "./logger";

export interface EmailProviderOptions {
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
}

// Hard bounds so a slow SMTP server can never stall an HTTP response.
const CONNECTION_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 15_000;
const GREETING_TIMEOUT_MS = 10_000;

/**
 * Resolve the "from" address used for a given message.
 * - Explicit opts.from wins.
 * - HTTP provider (Resend) uses RESEND_FROM (a verified Resend-domain address),
 *   falling back to SMTP_FROM / SMTP_USER for consistency.
 */
function resolveFrom(opts: EmailProviderOptions): string {
  if (opts.from) return opts.from;
  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM) return process.env.RESEND_FROM;
  return process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "mailer@healthnexus.local";
}

/**
 * Send via Resend's HTTP API (HTTPS / port 443). Works on Render's free tier,
 * which blocks outbound SMTP on ports 25/465/587.
 */
async function sendViaResend(opts: EmailProviderOptions): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resolveFrom(opts),
      to: [opts.to],
      reply_to: opts.replyTo,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

/**
 * Send via SMTP (nodemailer). Preferred locally / on paid hosts where outbound
 * SMTP is allowed.
 */
async function sendViaSmtp(opts: EmailProviderOptions): Promise<void> {
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    pool: true,
    maxConnections: 5,
    maxMessages: 20,
  });

  await transporter.sendMail({
    from: resolveFrom(opts),
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

/**
 * Send an email. Provider selection order:
 *   1. Resend HTTP API  (if RESEND_API_KEY set)  — works on Render free tier
 *   2. SMTP             (if SMTP_HOST set)        — local / paid hosts
 *   3. Log-only         (neither set)             — local dev without mail
 */
export async function sendEmail(opts: EmailProviderOptions): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    logger.info({ to: opts.to, subject: opts.subject, provider: "resend" }, "sending email via Resend API");
    await sendViaResend(opts);
    return;
  }

  if (process.env.SMTP_HOST) {
    logger.info({ to: opts.to, subject: opts.subject, provider: "smtp" }, "sending email via SMTP");
    await sendViaSmtp(opts);
    return;
  }

  logger.info({ to: opts.to, subject: opts.subject }, "[DEV] sendEmail — no provider configured, logging only");
  logger.info({ text: opts.text }, "[DEV] Email body");
}
