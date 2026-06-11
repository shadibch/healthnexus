import { Router, type IRouter } from "express";
import { eq, ilike, and, or, sql } from "drizzle-orm";
import { db, encounterActivitiesTable, consultationsTable, haadActivityCatalogueTable } from "@workspace/db";
import { requireAuth, getSessionUser } from "../lib/session";

const router: IRouter = Router();

// ── Search HAAD activity codes catalogue (DB-backed autocomplete) ─────────────
router.get("/activities/catalogue", requireAuth, async (req, res): Promise<void> => {
  const q = (req.query.q as string | undefined)?.trim();
  const category = req.query.category as string | undefined;

  const conditions = [];

  if (category) {
    conditions.push(eq(haadActivityCatalogueTable.category, category));
  }

  if (q) {
    conditions.push(
      or(
        ilike(haadActivityCatalogueTable.code, `%${q}%`),
        ilike(haadActivityCatalogueTable.description, `%${q}%`),
        ilike(haadActivityCatalogueTable.descriptionAr, `%${q}%`)
      )
    );
  }

  const rows = await db
    .select({
      id: haadActivityCatalogueTable.id,
      code: haadActivityCatalogueTable.code,
      description: haadActivityCatalogueTable.description,
      descriptionAr: haadActivityCatalogueTable.descriptionAr,
      category: haadActivityCatalogueTable.category,
      unitPrice: haadActivityCatalogueTable.unitPrice,
    })
    .from(haadActivityCatalogueTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(haadActivityCatalogueTable.category, haadActivityCatalogueTable.code)
    .limit(50);

  // Return unitPrice as a number for frontend compatibility
  res.json(
    rows.map((r) => ({
      ...r,
      unitPrice: parseFloat(r.unitPrice ?? "0"),
    }))
  );
});

// ── List activities for an encounter ─────────────────────────────────────────
router.get("/consultations/:id/activities", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const consultationId = parseInt(String(req.params.id));

  const [consultation] = await db
    .select()
    .from(consultationsTable)
    .where(eq(consultationsTable.id, consultationId))
    .limit(1);

  if (!consultation) { res.status(404).json({ error: "Encounter not found" }); return; }
  if (session.role === "doctor" && session.doctorDbId !== consultation.doctorId) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  if (session.role === "patient" && session.patientDbId !== consultation.patientId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const activities = await db
    .select()
    .from(encounterActivitiesTable)
    .where(eq(encounterActivitiesTable.consultationId, consultationId))
    .orderBy(encounterActivitiesTable.addedAt);

  res.json(activities);
});

// ── Add an activity to an encounter ──────────────────────────────────────────
router.post("/consultations/:id/activities", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "doctor") {
    res.status(403).json({ error: "Only doctors can add activities" }); return;
  }

  const consultationId = parseInt(String(req.params.id));
  const [consultation] = await db
    .select()
    .from(consultationsTable)
    .where(eq(consultationsTable.id, consultationId))
    .limit(1);

  if (!consultation) { res.status(404).json({ error: "Encounter not found" }); return; }
  if (session.doctorDbId !== consultation.doctorId) {
    res.status(403).json({ error: "Not your encounter" }); return;
  }
  if (consultation.status === "completed") {
    res.status(400).json({ error: "Cannot modify a completed encounter" }); return;
  }

  const { activityCode, description, category, quantity = 1, unitPrice, notes } = req.body;

  if (!activityCode || !description || unitPrice == null) {
    res.status(400).json({ error: "activityCode, description and unitPrice are required" }); return;
  }

  const qty = Math.max(1, parseInt(quantity) || 1);
  const price = parseFloat(unitPrice);
  const total = (qty * price).toFixed(2);

  const [activity] = await db
    .insert(encounterActivitiesTable)
    .values({
      consultationId,
      activityCode,
      description,
      category: category ?? "procedure",
      quantity: qty,
      unitPrice: price.toFixed(2),
      total,
      notes: notes || null,
    })
    .returning();

  res.status(201).json(activity);
});

// ── Update activity quantity ──────────────────────────────────────────────────
router.patch("/activities/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "doctor") {
    res.status(403).json({ error: "Only doctors can modify activities" }); return;
  }

  const activityId = parseInt(String(req.params.id));
  const [activity] = await db
    .select()
    .from(encounterActivitiesTable)
    .where(eq(encounterActivitiesTable.id, activityId))
    .limit(1);

  if (!activity) { res.status(404).json({ error: "Activity not found" }); return; }

  const [consultation] = await db
    .select()
    .from(consultationsTable)
    .where(eq(consultationsTable.id, activity.consultationId))
    .limit(1);

  if (!consultation || session.doctorDbId !== consultation.doctorId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  const qty = Math.max(1, parseInt(req.body.quantity) || activity.quantity);
  const price = parseFloat(activity.unitPrice);
  const total = (qty * price).toFixed(2);

  const [updated] = await db
    .update(encounterActivitiesTable)
    .set({ quantity: qty, total, notes: req.body.notes ?? activity.notes })
    .where(eq(encounterActivitiesTable.id, activityId))
    .returning();

  res.json(updated);
});

// ── Remove an activity ────────────────────────────────────────────────────────
router.delete("/activities/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "doctor") {
    res.status(403).json({ error: "Only doctors can remove activities" }); return;
  }

  const activityId = parseInt(String(req.params.id));
  const [activity] = await db
    .select()
    .from(encounterActivitiesTable)
    .where(eq(encounterActivitiesTable.id, activityId))
    .limit(1);

  if (!activity) { res.status(404).json({ error: "Activity not found" }); return; }

  const [consultation] = await db
    .select()
    .from(consultationsTable)
    .where(eq(consultationsTable.id, activity.consultationId))
    .limit(1);

  if (!consultation || session.doctorDbId !== consultation.doctorId) {
    res.status(403).json({ error: "Access denied" }); return;
  }

  await db
    .delete(encounterActivitiesTable)
    .where(eq(encounterActivitiesTable.id, activityId));

  res.status(204).send();
});

export default router;
