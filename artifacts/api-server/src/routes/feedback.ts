import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/session";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/mailer";

const router = Router();

const CLINIC_EMAIL = process.env.FEEDBACK_EMAIL ?? "support@camsclinic.org";

const FeedbackSchema = z.object({
  name:    z.string().min(1).max(100),
  email:   z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(5).max(5000),
});

router.post("/feedback", requireAuth, async (req, res) => {
  const parsed = FeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const { name, email, subject, message } = parsed.data;

  const timestamp = new Date().toLocaleString("en-AE", { timeZone: "Asia/Dubai" });

  try {
    // ── Internal notification to the clinic (to CLINIC_EMAIL) ────────────────
    // `from` is deliberately omitted so the mailer uses the authenticated
    // SMTP sender (SMTP_FROM / info@…) — Hostinger rejects foreign senders.
    await sendEmail({
      to: CLINIC_EMAIL,
      replyTo: email,
      subject: `[HealthNexus Feedback] ${subject} — ${name}`,
      text: [
        "New feedback received via HealthNexus platform",
        "",
        `From:    ${name}`,
        `Email:   ${email}`,
        `Subject: ${subject}`,
        `Time:    ${timestamp}`,
        "",
        "Message:",
        "─".repeat(50),
        message,
        "─".repeat(50),
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#059669;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
            <h2 style="margin:0;font-size:18px">New Feedback — HealthNexus</h2>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              <tr><td style="padding:6px 0;color:#6b7280;width:80px"><b>From:</b></td><td>${name}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280"><b>Email:</b></td><td><a href="mailto:${email}">${email}</a></td></tr>
              <tr><td style="padding:6px 0;color:#6b7280"><b>Subject:</b></td><td>${subject}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280"><b>Time:</b></td><td>${timestamp}</td></tr>
            </table>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px">
              <p style="margin:0;white-space:pre-wrap;color:#111827">${message.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</p>
            </div>
            <p style="margin-top:16px;color:#9ca3af;font-size:12px">Reply directly to this email to respond to the user.</p>
          </div>
        </div>`,
    });

    // ── Confirmation to the user ─────────────────────────────────────────────
    await sendEmail({
      to: email,
      subject: `We received your message — ${subject}`,
      text: [
        `Dear ${name},`,
        "",
        "Thank you for reaching out to us. We have received your message and will get back to you as soon as possible.",
        "",
        "Here is a copy of your submission:",
        "",
        `Subject: ${subject}`,
        "",
        message,
        "",
        "─".repeat(50),
        "This is an automated confirmation. Please do not reply to this email.",
        `For further queries, contact us directly at ${CLINIC_EMAIL}.`,
        "",
        "Best regards,",
        "HealthNexus Support Team",
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#059669;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
            <h2 style="margin:0;font-size:18px">We received your message</h2>
          </div>
          <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <p style="color:#374151">Dear <b>${name}</b>,</p>
            <p style="color:#374151">Thank you for reaching out. We have received your message and will get back to you as soon as possible.</p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;margin:20px 0">
              <p style="margin:0 0 8px;color:#6b7280;font-size:13px"><b>Subject:</b> ${subject}</p>
              <p style="margin:0;white-space:pre-wrap;color:#111827;font-size:14px">${message.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</p>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
            <p style="color:#9ca3af;font-size:12px;margin:0">
              This is an automated confirmation. For further queries contact us at
              <a href="mailto:${CLINIC_EMAIL}">${CLINIC_EMAIL}</a>.
            </p>
          </div>
        </div>`,
    });

    req.log.info({ name, email, subject }, "Feedback submitted");
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to send feedback emails");
    res.status(500).json({ error: "Failed to send. Please try again later." });
  }
});

export default router;
