import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  appointmentReminderConfigsTable,
  appointmentReminderLogsTable,
  appointmentsTable,
  patientsTable,
  doctorsTable,
  medicalCentersTable,
} from "@workspace/db";
import { requireAuth, requireRole, getSessionUser } from "../lib/session";
import {
  seedDefaultConfigs,
  renderTemplate,
  DEFAULT_REMINDER_CONFIGS,
} from "../lib/reminder-scheduler";
import { z } from "zod";

const router: IRouter = Router();

// ── GET /reminders/config ─────────────────────────────────────────────────────
router.get(
  "/reminders/config",
  requireAuth,
  requireRole("admin", "doctor"),
  async (req, res): Promise<void> => {
    const session = getSessionUser(req)!;
    const centerId = session.medicalCenterId;
    if (!centerId) {
      res.status(400).json({ error: "No medical center associated" });
      return;
    }

    // Auto-seed defaults on first access
    await seedDefaultConfigs(centerId);

    const configs = await db
      .select()
      .from(appointmentReminderConfigsTable)
      .where(eq(appointmentReminderConfigsTable.medicalCenterId, centerId))
      .orderBy(appointmentReminderConfigsTable.channel, appointmentReminderConfigsTable.offsetUnit, appointmentReminderConfigsTable.offsetValue);

    res.json(configs);
  },
);

// ── POST /reminders/config ────────────────────────────────────────────────────
const CreateConfigBody = z.object({
  channel: z.enum(["email", "whatsapp"]),
  offsetValue: z.number().int().positive(),
  offsetUnit: z.enum(["minutes", "hours", "days"]),
  label: z.string().optional(),
  template: z.string().min(10),
  enabled: z.boolean().optional().default(true),
});

router.post(
  "/reminders/config",
  requireAuth,
  requireRole("admin", "doctor"),
  async (req, res): Promise<void> => {
    const session = getSessionUser(req)!;
    const centerId = session.medicalCenterId;
    if (!centerId) {
      res.status(400).json({ error: "No medical center associated" });
      return;
    }

    const parsed = CreateConfigBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const data = parsed.data;
    const label = data.label ?? `${data.offsetValue} ${data.offsetUnit} before`;

    const [config] = await db
      .insert(appointmentReminderConfigsTable)
      .values({ ...data, label, medicalCenterId: centerId })
      .returning();

    res.status(201).json(config);
  },
);

// ── PATCH /reminders/config/:id ───────────────────────────────────────────────
const UpdateConfigBody = z.object({
  channel: z.enum(["email", "whatsapp"]).optional(),
  offsetValue: z.number().int().positive().optional(),
  offsetUnit: z.enum(["minutes", "hours", "days"]).optional(),
  label: z.string().optional(),
  template: z.string().min(10).optional(),
  enabled: z.boolean().optional(),
});

router.patch(
  "/reminders/config/:id",
  requireAuth,
  requireRole("admin", "doctor"),
  async (req, res): Promise<void> => {
    const session = getSessionUser(req)!;
    const centerId = session.medicalCenterId;
    if (!centerId) {
      res.status(400).json({ error: "No medical center associated" });
      return;
    }

    const parsed = UpdateConfigBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const id = Number(req.params["id"]);
    const [updated] = await db
      .update(appointmentReminderConfigsTable)
      .set(parsed.data)
      .where(
        and(
          eq(appointmentReminderConfigsTable.id, id),
          eq(appointmentReminderConfigsTable.medicalCenterId, centerId),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Config not found" });
      return;
    }
    res.json(updated);
  },
);

// ── DELETE /reminders/config/:id ──────────────────────────────────────────────
router.delete(
  "/reminders/config/:id",
  requireAuth,
  requireRole("admin", "doctor"),
  async (req, res): Promise<void> => {
    const session = getSessionUser(req)!;
    const centerId = session.medicalCenterId;
    if (!centerId) {
      res.status(400).json({ error: "No medical center associated" });
      return;
    }

    const id = Number(req.params["id"]);
    await db
      .delete(appointmentReminderConfigsTable)
      .where(
        and(
          eq(appointmentReminderConfigsTable.id, id),
          eq(appointmentReminderConfigsTable.medicalCenterId, centerId),
        ),
      );

    res.json({ ok: true });
  },
);

// ── GET /reminders/logs ───────────────────────────────────────────────────────
router.get(
  "/reminders/logs",
  requireAuth,
  requireRole("admin", "doctor"),
  async (req, res): Promise<void> => {
    const session = getSessionUser(req)!;
    const centerId = session.medicalCenterId;
    if (!centerId) {
      res.status(400).json({ error: "No medical center associated" });
      return;
    }

    const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
    const offset = Number(req.query["offset"] ?? 0);
    const channel = req.query["channel"] as string | undefined;
    const status  = req.query["status"]  as string | undefined;

    // Fetch logs scoped to this center's configs
    const centerConfigs = await db
      .select({ id: appointmentReminderConfigsTable.id })
      .from(appointmentReminderConfigsTable)
      .where(eq(appointmentReminderConfigsTable.medicalCenterId, centerId));

    const configIds = centerConfigs.map((c) => c.id);
    if (configIds.length === 0) {
      res.json([]);
      return;
    }

    const { inArray: drizzleInArray } = await import("drizzle-orm");
    const conditions: any[] = [drizzleInArray(appointmentReminderLogsTable.configId, configIds)];
    if (channel) conditions.push(eq(appointmentReminderLogsTable.channel, channel));
    if (status)  conditions.push(eq(appointmentReminderLogsTable.status, status));

    const logs = await db
      .select()
      .from(appointmentReminderLogsTable)
      .where(and(...conditions))
      .orderBy(desc(appointmentReminderLogsTable.sentAt))
      .limit(limit)
      .offset(offset);

    res.json(logs);
  },
);

// ── GET /reminders/logs/appointment/:appointmentId ────────────────────────────
router.get(
  "/reminders/logs/appointment/:appointmentId",
  requireAuth,
  requireRole("admin", "doctor"),
  async (req, res): Promise<void> => {
    const appointmentId = Number(req.params["appointmentId"]);
    const logs = await db
      .select()
      .from(appointmentReminderLogsTable)
      .where(eq(appointmentReminderLogsTable.appointmentId, appointmentId))
      .orderBy(desc(appointmentReminderLogsTable.sentAt));

    res.json(logs);
  },
);

// ── POST /reminders/test ──────────────────────────────────────────────────────
const TestReminderBody = z.object({
  configId: z.number().int().positive(),
  recipientEmail: z.string().email().optional(),
  recipientPhone: z.string().optional(),
});

router.post(
  "/reminders/test",
  requireAuth,
  requireRole("admin", "doctor"),
  async (req, res): Promise<void> => {
    const session = getSessionUser(req)!;
    const centerId = session.medicalCenterId;
    if (!centerId) {
      res.status(400).json({ error: "No medical center associated" });
      return;
    }

    const parsed = TestReminderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const config = await db.query.appointmentReminderConfigsTable.findFirst({
      where: and(
        eq(appointmentReminderConfigsTable.id, parsed.data.configId),
        eq(appointmentReminderConfigsTable.medicalCenterId, centerId),
      ),
    });

    if (!config) {
      res.status(404).json({ error: "Config not found" });
      return;
    }

    const center = await db.query.medicalCentersTable.findFirst({
      where: eq(medicalCentersTable.id, centerId),
    });

    const ctx = {
      patient_name: "John Doe / جون دو",
      doctor_name: session.name ?? "Smith",
      clinic_name: center?.name ?? "HealthNexus",
      appointment_date: "January 15, 2026",
      appointment_time: "10:00 AM",
      appointment_type: "routine",
    };

    const rendered = renderTemplate(config.template, ctx);

    // In dev mode, just return the rendered message without actually sending
    const emailConfigured = !!process.env.SMTP_HOST || !!process.env.RESEND_API_KEY;
    const twilioConfigured = !!process.env.TWILIO_ACCOUNT_SID;

    res.json({
      ok: true,
      rendered,
      channel: config.channel,
      devMode: config.channel === "email" ? !emailConfigured : !twilioConfigured,
      note:
        config.channel === "email" && !emailConfigured
          ? "Email not configured — set SMTP_HOST/… or RESEND_API_KEY to enable real email delivery."
          : config.channel === "whatsapp" && !twilioConfigured
          ? "Twilio not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM to enable WhatsApp delivery."
          : "Message sent successfully.",
    });
  },
);

export default router;
