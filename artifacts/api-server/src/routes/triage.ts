import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { clinicTasksTable } from "@workspace/db";
import { getDb } from "../lib/tenant";
import { requireAuth } from "../lib/session";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/oy58jmqrna29ccwd8t5u2hggxit16qft";

const dispatchSchema = z.object({
  sender: z.string().min(1),
  requestor_role: z.enum(["Patient", "Nurse", "Doctor", "Manager", "Vendor"]),
  message: z.string().min(1),
});

const taskCallbackSchema = z.object({
  external_event_id: z.string().min(1),
  task_title: z.string().min(1),
  requestor_role: z.enum(["Patient", "Nurse", "Doctor", "Manager", "Vendor"]),
  department: z.enum(["Reception", "Doctor", "Pharmacy", "Billing", "IT"]),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  status: z.enum(["Open", "In Progress", "Pending Registration", "Resolved"]).default("Open"),
  patient_identifier: z.string().nullable().optional(),
  assigned_person: z.string().nullable().optional(),
  original_message: z.string().min(1),
});

const patchStatusSchema = z.object({
  status: z.enum(["Open", "In Progress", "Resolved"]),
});

function generateEventId(): string {
  return `evt_cams_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
}

router.post("/triage/dispatch", requireAuth, async (req, res): Promise<void> => {
  const parsed = dispatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const { sender, requestor_role, message } = parsed.data;
  const event_id = generateEventId();
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id, sender, requestor_role, timestamp, message }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn({ status: response.status, text }, "Make.com webhook responded with error");
      res.status(502).json({ error: "Make.com webhook unreachable", status: response.status });
      return;
    }

    res.json({ success: true, event_id });
  } catch (err) {
    logger.error({ err }, "Failed to dispatch triage message to Make.com");
    res.status(502).json({ error: "Failed to reach Make.com webhook" });
  }
});

router.post("/triage/tasks", async (req, res): Promise<void> => {
  const parsed = taskCallbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const data = parsed.data;
  const db = getDb();

  try {
    const existing = await db
      .select()
      .from(clinicTasksTable)
      .where(eq(clinicTasksTable.externalEventId, data.external_event_id))
      .limit(1);

    if (existing.length > 0) {
      res.status(200).json(existing[0]);
      return;
    }

    const [created] = await db
      .insert(clinicTasksTable)
      .values({
        externalEventId: data.external_event_id,
        taskTitle: data.task_title,
        requestorRole: data.requestor_role,
        department: data.department,
        priority: data.priority,
        status: data.status ?? "Open",
        patientIdentifier: data.patient_identifier ?? null,
        assignedPerson: data.assigned_person ?? null,
        originalMessage: data.original_message,
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "Failed to create triage task from callback");
    res.status(500).json({ error: "Failed to create triage task" });
  }
});

router.get("/triage/tasks", requireAuth, async (req, res): Promise<void> => {
  try {
    const department = typeof req.query.department === "string" ? req.query.department : undefined;
    const assignedPerson = typeof req.query.assigned_person === "string" ? req.query.assigned_person : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;

    const conditions = [];
    if (department) conditions.push(eq(clinicTasksTable.department, department));
    if (assignedPerson) conditions.push(eq(clinicTasksTable.assignedPerson, assignedPerson));
    if (status) conditions.push(eq(clinicTasksTable.status, status));

    const db = getDb();
    let q = db.select().from(clinicTasksTable);
    if (conditions.length === 1) q = q.where(conditions[0]) as typeof q;
    else if (conditions.length > 1) q = q.where(and(...conditions)) as typeof q;

    const tasks = await q.orderBy(desc(clinicTasksTable.createdAt));
    res.json(tasks);
  } catch (err) {
    logger.error({ err }, "Failed to list triage tasks");
    res.status(500).json({ error: "Failed to fetch triage tasks" });
  }
});

router.patch("/triage/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid task id" });
    return;
  }

  const parsed = patchStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(clinicTasksTable)
      .set({ status: parsed.data.status })
      .where(eq(clinicTasksTable.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Failed to update triage task");
    res.status(500).json({ error: "Failed to update triage task" });
  }
});

export default router;
