import { logger } from "./logger";

export interface MailOptions {
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(opts: MailOptions): Promise<void> {
  if (!process.env.SMTP_HOST) {
    logger.info({ to: opts.to, subject: opts.subject }, "[DEV] sendEmail — SMTP not configured, logging only");
    logger.debug({ text: opts.text }, "[DEV] Email body");
    return;
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: opts.from ?? process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}
