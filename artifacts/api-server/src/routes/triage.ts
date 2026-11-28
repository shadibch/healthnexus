import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { clinicTasksTable, db, doctorsTable, pool, triageDispatchesTable } from "@workspace/db";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import { getDb } from "../lib/tenant";
import { getSessionUser, requireAuth, type AppRole } from "../lib/session";
import { tenantSchemaName } from "../lib/tenant-schema";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/oy58jmqrna29ccwd8t5u2hggxit16qft";

const DEPARTMENTS = ["Reception", "Doctor", "Pharmacy", "Billing", "IT"] as const;
const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;

/** The requestor roles Make.com understands. */
const MAKE_REQUESTOR_ROLES = ["Patient", "Nurse", "Doctor", "Manager", "Vendor"] as const;
type MakeRequestorRole = (typeof MAKE_REQUESTOR_ROLES)[number];

const dispatchSchema = z.object({
  message: z.string().trim().min(1),
});

const taskCallbackSchema = z.object({
  external_event_id: z.string().min(1),
  task_title: z.string().min(1),
  requestor_role: z.enum(MAKE_REQUESTOR_ROLES),
  department: z.enum(DEPARTMENTS),
  priority: z.enum(PRIORITIES),
  status: z.enum(["Open", "In Progress", "Pending Registration", "Resolved"]).default("Open"),
  patient_identifier: z.string().nullable().optional(),
  assigned_person: z.string().nullable().optional(),
  original_message: z.string().min(1),
});

// Make.com sometimes echoes the original dispatch payload back to the callback
// endpoint instead of the normalised task object. We accept that shape too and
// fill in sensible defaults so the ticket still reaches the Operator queue.
const dispatchEchoSchema = z.object({
  sender: z.string().optional(),
  requestor_role: z.string().optional(),
  event_id: z.string().min(1).optional(),
  external_event_id: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  timestamp: z.string().optional(),
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

/** `evt_cams_<current_date>_<hash of message>`, per the integration contract. */
function generateEventId(message: string): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "_");
  const messageHash = crypto.createHash("sha256").update(message).digest("hex").slice(0, 12);
  return `evt_cams_${date}_${messageHash}`;
}

/** Map a HealthNexus role to the Make.com requestor_role vocabulary. */
function toMakeRequestorRole(role: AppRole): MakeRequestorRole {
  switch (role) {
    case "doctor": return "Doctor";
    case "nurse": return "Nurse";
    case "patient": return "Patient";
    case "pharmacist":
    case "pharmacy": return "Vendor";
    default: return "Manager"; // admin, receptionist, accountant, operator, pending
  }
}

/** Coerce an arbitrary incoming role string into a valid Make.com role. */
function normaliseRequestorRole(value: string | undefined): MakeRequestorRole {
  const wanted = value?.trim().toLowerCase();
  return MAKE_REQUESTOR_ROLES.find((role) => role.toLowerCase() === wanted) ?? "Manager";
}

router.post("/triage/dispatch", requireAuth, async (req, res): Promise<void> => {
  const parsed = dispatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const user = getSessionUser(req)!;
  if (!user.medicalCenterId) {
    res.status(403).json({ error: "Your account is not assigned to a clinic" });
    return;
  }
  const { message } = parsed.data;
  const sender = user.email;
  const requestor_role = toMakeRequestorRole(user.role);
  const event_id = generateEventId(message);
  const timestamp = new Date().toISOString();
  const payload = { sender, requestor_role, event_id, message, timestamp };

  try {
    await db.insert(triageDispatchesTable).values({
      externalEventId: event_id,
      medicalCenterId: user.medicalCenterId,
      requestedByUserId: user.userId,
    }).onConflictDoUpdate({
      target: triageDispatchesTable.externalEventId,
      set: { medicalCenterId: user.medicalCenterId, requestedByUserId: user.userId },
    });

    const response = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const responseBody = await response.text().catch(() => "");

    if (!response.ok) {
      logger.warn({ status: response.status, responseBody, payload }, "Make.com webhook responded with error");
      res.status(502).json({ error: "Make.com webhook unreachable", status: response.status });
      return;
    }

    logger.info({ event_id, requestor_role, sender }, "Dispatched triage message to Make.com");
    res.json({ success: true, event_id, payload, response_body: responseBody });
  } catch (err) {
    logger.error({ err }, "Failed to dispatch triage message to Make.com");
    res.status(502).json({ error: "Failed to reach Make.com webhook" });
  }
});

router.post("/triage/tasks", async (req, res): Promise<void> => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const bodyKeys = Object.keys(body);

  // A `{}` body means the Make.com HTTP module is sending no mapped fields.
  if (bodyKeys.length === 0) {
    logger.warn(
      { ip: req.ip, contentType: req.headers["content-type"] },
      "Make.com triage callback received an empty body — check the HTTP module Body mapping",
    );
    res.status(400).json({
      error: "Empty callback body",
      hint: "In the Make.com scenario, map the task fields into the HTTP module body: external_event_id, task_title, requestor_role, department, priority, original_message.",
    });
    return;
  }

  const parsed = taskCallbackSchema.safeParse(body);
  let data: z.infer<typeof taskCallbackSchema>;

  if (parsed.success) {
    data = parsed.data;
  } else {
    // Fallback: the scenario echoed the dispatch payload instead of the
    // normalised task. Turn it into a ticket the Operator can route.
    const echo = dispatchEchoSchema.safeParse(body);
    const eventId = echo.success ? echo.data.event_id ?? echo.data.external_event_id : undefined;
    const message = echo.success ? echo.data.message : undefined;
    if (!eventId || !message) {
      logger.warn({ bodyKeys, issues: parsed.error.issues }, "Make.com triage callback body was not recognised");
      res.status(400).json({
        error: "Invalid input",
        details: parsed.error.issues,
        received_keys: bodyKeys,
      });
      return;
    }
    const title = message.length > 80 ? `${message.slice(0, 77)}…` : message;
    data = {
      external_event_id: eventId,
      task_title: title,
      requestor_role: normaliseRequestorRole(echo.data!.requestor_role),
      department: "Reception",
      priority: "Medium",
      status: "Open",
      patient_identifier: null,
      assigned_person: null,
      original_message: message,
    };
    logger.info({ eventId }, "Make.com callback echoed the dispatch payload; creating task with defaults");
  }

  let client: any;
  try {
    const dispatch = await db.query.triageDispatchesTable.findFirst({
      where: eq(triageDispatchesTable.externalEventId, data.external_event_id),
    });
    if (!dispatch) {
      res.status(404).json({ error: "Unknown dispatch event", external_event_id: data.external_event_id });
      return;
    }

    client = await pool.connect();
    const schemaName = tenantSchemaName(dispatch.medicalCenterId);
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    await client.query(`CREATE TABLE IF NOT EXISTS ${schemaName}.clinic_tasks (LIKE public.clinic_tasks INCLUDING ALL)`);
    await client.query(`SET LOCAL search_path TO ${schemaName}, public`);
    const tenantDb = drizzle(client, { schema });

    const existing = await tenantDb
      .select()
      .from(clinicTasksTable)
      .where(eq(clinicTasksTable.externalEventId, data.external_event_id))
      .limit(1);

    if (existing.length > 0) {
      await client.query("COMMIT");
      res.status(200).json(existing[0]);
      return;
    }

    const [created] = await tenantDb
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

    await client.query("COMMIT");
    res.status(201).json(created);
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ err }, "Failed to create triage task from callback");
    res.status(500).json({ error: "Failed to create triage task" });
  } finally {
    client?.release();
  }
});

router.get("/triage/my-tasks", requireAuth, async (req, res): Promise<void> => {
  const user = getSessionUser(req)!;
  if (!user.medicalCenterId) {
    res.status(403).json({ error: "Your account is not assigned to a clinic" });
    return;
  }

  try {
    const assignees = new Set([user.email, user.name].map(value => value.trim()).filter(Boolean));
    if (user.roles.includes("doctor")) {
      const doctor = await getDb().query.doctorsTable.findFirst({
        where: eq(doctorsTable.userId, user.userId),
      });
      if (doctor) {
        assignees.add(`${doctor.firstName} ${doctor.lastName}`.trim());
        assignees.add(`Dr. ${doctor.firstName} ${doctor.lastName}`.trim());
      }
    }

    const conditions = [...assignees].map(name =>
      sql`lower(${clinicTasksTable.assignedPerson}) = lower(${name})`,
    );
    if (conditions.length === 0) {
      res.json([]);
      return;
    }

    const tasks = await getDb().select().from(clinicTasksTable)
      .where(or(...conditions))
      .orderBy(desc(clinicTasksTable.createdAt));
    res.json(tasks);
  } catch (err) {
    logger.error({ err, userId: user.userId }, "Failed to list user triage tasks");
    res.status(500).json({ error: "Failed to fetch your tasks" });
  }
});

router.get("/triage/tasks", requireAuth, async (req, res): Promise<void> => {
  const user = getSessionUser(req)!;
  if (!user.medicalCenterId) {
    res.status(403).json({ error: "Your account is not assigned to a clinic" });
    return;
  }
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
  const user = getSessionUser(req)!;
  if (!user.medicalCenterId) {
    res.status(403).json({ error: "Your account is not assigned to a clinic" });
    return;
  }
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
