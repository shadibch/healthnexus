import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { clinicTasksTable } from "@workspace/db";
import { getDb } from "../lib/tenant";
import { getSessionUser, requireAuth } from "../lib/session";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/oy58jmqrna29ccwd8t5u2hggxit16qft";

const DEPARTMENTS = ["Reception", "Doctor", "Pharmacy", "Billing", "IT"] as const;
const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

const dispatchSchema = z.object({
  message: z.string().trim().min(1),
});

const taskCallbackSchema = z.object({
  external_event_id: z.string().min(1),
  task_title: z.string().min(1),
  requestor_role: z.enum(["Patient", "Nurse", "Doctor", "Manager", "Vendor"]),
  department: z.enum(DEPARTMENTS),
  priority: z.enum(PRIORITIES),
  status: z.enum(["Open", "In Progress", "Pending Registration", "Resolved"]).default("Open"),
  patient_identifier: z.string().nullable().optional(),
  assigned_person: z.string().nullable().optional(),
  original_message: z.string().min(1),
});

// A triage task can be updated in several ways:
//  • clinical staff move it through its lifecycle (status)
//  • the Operator role forwards an unrouted ticket to the right
//    department / person (department, assigned_person, priority)
const patchTaskSchema = z.object({
  status: z.enum(["Open", "In Progress", "Resolved"]).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  assigned_person: z.string().trim().min(1).max(255).nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
}).refine(
  (d) =>
    d.status !== undefined ||
    d.department !== undefined ||
    d.assigned_person !== undefined ||
    d.priority !== undefined,
  { message: "At least one field must be provided" },
);

function generateEventId(message: string): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "_");
  const messageHash = crypto.createHash("sha256").update(message).digest("hex").slice(0, 12);
  return `evt_cams_${date}_${messageHash}`;
}

router.post("/triage/dispatch", requireAuth, async (req, res): Promise<void> => {
  const parsed = dispatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const user = getSessionUser(req)!;
  const { message } = parsed.data;
  const sender = user.email;
  const requestor_role = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  const event_id = generateEventId(message);

  try {
    const response = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender, requestor_role, event_id, message }),
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
    const unassigned =
      req.query.unassigned === "true" || req.query.unassigned === "1";

    const conditions = [];
    if (department) conditions.push(eq(clinicTasksTable.department, department));
    if (assignedPerson) conditions.push(eq(clinicTasksTable.assignedPerson, assignedPerson));
    if (status) conditions.push(eq(clinicTasksTable.status, status));
    // "Unassigned" = no one has been given ownership yet. These are the tickets
    // the automation could not route, and are the Operator's queue.
    if (unassigned) conditions.push(isNull(clinicTasksTable.assignedPerson));

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

  const parsed = patchTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const { status, department, assigned_person, priority } = parsed.data;
  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (department !== undefined) updates.department = department;
  if (assigned_person !== undefined) updates.assignedPerson = assigned_person;
  if (priority !== undefined) updates.priority = priority;

  try {
    const db = getDb();
    const [updated] = await db
      .update(clinicTasksTable)
      .set(updates)
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
