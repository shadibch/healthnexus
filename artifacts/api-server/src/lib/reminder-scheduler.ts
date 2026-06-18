import cron from "node-cron";
import { db } from "@workspace/db";
import {
  appointmentReminderConfigsTable,
  appointmentReminderLogsTable,
  appointmentsTable,
  doctorsTable,
  patientsTable,
  medicalCentersTable,
  EMAIL_DEFAULT_TEMPLATE,
  WHATSAPP_DEFAULT_TEMPLATE,
} from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { format } from "date-fns";
import { logger } from "./logger";

// ── Template rendering ────────────────────────────────────────────────────────

interface ReminderContext {
  patient_name: string;
  doctor_name: string;
  clinic_name: string;
  appointment_date: string;
  appointment_time: string;
  appointment_type: string;
}

export function renderTemplate(template: string, ctx: ReminderContext): string {
  return template
    .replace(/\{\{patient_name\}\}/g, ctx.patient_name)
    .replace(/\{\{doctor_name\}\}/g, ctx.doctor_name)
    .replace(/\{\{clinic_name\}\}/g, ctx.clinic_name)
    .replace(/\{\{appointment_date\}\}/g, ctx.appointment_date)
    .replace(/\{\{appointment_time\}\}/g, ctx.appointment_time)
    .replace(/\{\{appointment_type\}\}/g, ctx.appointment_type);
}

// ── Channel: Email ────────────────────────────────────────────────────────────

async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  if (!process.env.SMTP_HOST) {
    logger.info({ to, subject }, "[DEV] Email reminder — SMTP not configured, logging only");
    logger.debug({ body }, "[DEV] Email body");
    return;
  }

  // Dynamic import so nodemailer is optional
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
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject,
    text: body,
  });
}

// ── Channel: WhatsApp (Twilio) ────────────────────────────────────────────────

async function sendWhatsApp(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";

  if (!sid || !token) {
    logger.info({ to }, "[DEV] WhatsApp reminder — Twilio not configured, logging only");
    logger.debug({ body }, "[DEV] WhatsApp body");
    return;
  }

  const phone = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: phone, Body: body }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio error ${res.status}: ${text}`);
  }
}

// ── Default config seeding ────────────────────────────────────────────────────

export const DEFAULT_REMINDER_CONFIGS = [
  { channel: "email",    offsetValue: 7,   offsetUnit: "days",    label: "7 days before",    template: EMAIL_DEFAULT_TEMPLATE,    enabled: true },
  { channel: "email",    offsetValue: 48,  offsetUnit: "hours",   label: "48 hours before",  template: EMAIL_DEFAULT_TEMPLATE,    enabled: true },
  { channel: "email",    offsetValue: 24,  offsetUnit: "hours",   label: "24 hours before",  template: EMAIL_DEFAULT_TEMPLATE,    enabled: true },
  { channel: "whatsapp", offsetValue: 24,  offsetUnit: "hours",   label: "24 hours before",  template: WHATSAPP_DEFAULT_TEMPLATE, enabled: true },
  { channel: "whatsapp", offsetValue: 3,   offsetUnit: "hours",   label: "3 hours before",   template: WHATSAPP_DEFAULT_TEMPLATE, enabled: true },
  { channel: "whatsapp", offsetValue: 30,  offsetUnit: "minutes", label: "30 minutes before", template: WHATSAPP_DEFAULT_TEMPLATE, enabled: true },
] as const;

export async function seedDefaultConfigs(medicalCenterId: number): Promise<void> {
  const existing = await db
    .select({ id: appointmentReminderConfigsTable.id })
    .from(appointmentReminderConfigsTable)
    .where(eq(appointmentReminderConfigsTable.medicalCenterId, medicalCenterId));

  if (existing.length > 0) return;

  await db.insert(appointmentReminderConfigsTable).values(
    DEFAULT_REMINDER_CONFIGS.map((c) => ({ ...c, medicalCenterId })),
  );
  logger.info({ medicalCenterId }, "Seeded default reminder configs");
}

// ── Main scheduler tick ───────────────────────────────────────────────────────

export async function runReminderTick(): Promise<void> {
  logger.debug("Reminder scheduler tick started");

  // Find enabled configs
  const configs = await db
    .select()
    .from(appointmentReminderConfigsTable)
    .where(eq(appointmentReminderConfigsTable.enabled, true));

  if (configs.length === 0) return;

  // For each config find appointments whose reminder trigger time has arrived
  // trigger_time = scheduledAt - offset; we check the 10-min window [now-10m, now]
  for (const config of configs) {
    try {
      const intervalExpr =
        config.offsetUnit === "days"
          ? sql`interval '1 day' * ${config.offsetValue}`
          : config.offsetUnit === "hours"
          ? sql`interval '1 hour' * ${config.offsetValue}`
          : sql`interval '1 minute' * ${config.offsetValue}`;

      const rows = await db.execute(sql`
        SELECT
          a.id            AS appointment_id,
          a.patient_id,
          a.doctor_id,
          a.scheduled_at,
          a.status        AS appointment_status,
          a.type          AS appointment_type,
          p.first_name    AS patient_first_name,
          p.last_name     AS patient_last_name,
          p.email         AS patient_email,
          p.phone         AS patient_phone,
          d.first_name    AS doctor_first_name,
          d.last_name     AS doctor_last_name,
          d.medical_center_id,
          mc.name         AS clinic_name
        FROM appointments a
        JOIN doctors  d  ON d.id  = a.doctor_id
        JOIN patients p  ON p.id  = a.patient_id
        JOIN medical_centers mc ON mc.id = d.medical_center_id
        WHERE
          a.status IN ('scheduled', 'confirmed')
          AND a.scheduled_at > NOW()
          AND d.medical_center_id = ${config.medicalCenterId}
          AND (a.scheduled_at - ${intervalExpr})
                BETWEEN NOW() - INTERVAL '10 minutes' AND NOW()
          AND NOT EXISTS (
            SELECT 1 FROM appointment_reminder_logs l
            WHERE l.appointment_id = a.id
              AND l.config_id      = ${config.id}
              AND l.status         = 'sent'
          )
      `);

      for (const row of rows.rows) {
        const patientName = `${row.patient_first_name} ${row.patient_last_name}`.trim();
        const doctorName  = `${row.doctor_first_name} ${row.doctor_last_name}`.trim();
        const scheduledAt = new Date(row.scheduled_at as string);

        const ctx: ReminderContext = {
          patient_name:     patientName,
          doctor_name:      doctorName,
          clinic_name:      (row.clinic_name as string) ?? "HealthNexus",
          appointment_date: format(scheduledAt, "MMMM d, yyyy"),
          appointment_time: format(scheduledAt, "h:mm a"),
          appointment_type: (row.appointment_type as string) ?? "routine",
        };

        const rendered = renderTemplate(config.template, ctx);

        let status: "sent" | "failed" | "skipped" = "sent";
        let errorMessage: string | null = null;

        try {
          if (config.channel === "email") {
            const email = row.patient_email as string | null;
            if (!email) {
              status = "skipped";
              errorMessage = "Patient has no email address";
            } else {
              await sendEmail(email, `Appointment Reminder — ${ctx.clinic_name}`, rendered);
            }
          } else if (config.channel === "whatsapp") {
            const phone = row.patient_phone as string | null;
            if (!phone) {
              status = "skipped";
              errorMessage = "Patient has no phone number";
            } else {
              await sendWhatsApp(phone, rendered);
            }
          }
        } catch (sendErr: any) {
          status = "failed";
          errorMessage = sendErr?.message ?? String(sendErr);
          logger.warn({ appointmentId: row.appointment_id, configId: config.id, err: sendErr }, "Reminder send failed");
        }

        await db.insert(appointmentReminderLogsTable).values({
          appointmentId: row.appointment_id as number,
          patientId: row.patient_id as number,
          configId: config.id,
          channel: config.channel,
          status,
          errorMessage,
          renderedMessage: rendered,
        });

        logger.info(
          { appointmentId: row.appointment_id, channel: config.channel, status, label: config.label },
          "Reminder processed",
        );
      }
    } catch (err) {
      logger.error({ configId: config.id, err }, "Error processing reminder config");
    }
  }

  logger.debug("Reminder scheduler tick complete");
}

// ── Start scheduler ───────────────────────────────────────────────────────────

export function startReminderScheduler(): void {
  // Run immediately on boot, then every 5 minutes
  runReminderTick().catch((err) =>
    logger.error({ err }, "Initial reminder tick failed"),
  );

  cron.schedule("*/5 * * * *", async () => {
    try {
      await runReminderTick();
    } catch (err) {
      logger.error({ err }, "Reminder scheduler tick failed");
    }
  });

  logger.info("Appointment reminder scheduler started (every 5 minutes)");
}
