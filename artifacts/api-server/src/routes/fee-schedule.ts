import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, doctorCategoriesTable, doctorsTable } from "@workspace/db";
import { requireAuth, getSessionUser } from "../lib/session";

const router: IRouter = Router();

// ── GET /fee-schedule — all active categories (any authenticated user) ─────────
router.get("/fee-schedule", requireAuth, async (_req, res): Promise<void> => {
  const categories = await db
    .select()
    .from(doctorCategoriesTable)
    .where(eq(doctorCategoriesTable.isActive, true))
    .orderBy(asc(doctorCategoriesTable.sortOrder), asc(doctorCategoriesTable.id));
  res.json(categories);
});

// ── POST /fee-schedule — create category (admin / doctor / receptionist) ───────
router.post("/fee-schedule", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const allowed = session.roles.some((r) =>
    ["admin", "doctor", "receptionist"].includes(r)
  );
  if (!allowed) {
    res.status(403).json({ error: "Admin, doctor or receptionist only" });
    return;
  }

  const { name, description, consultationFee, sortOrder } = req.body as {
    name?: string;
    description?: string;
    consultationFee?: number | string;
    sortOrder?: number;
  };

  if (!name || !consultationFee) {
    res.status(400).json({ error: "name and consultationFee are required" });
    return;
  }
  const fee = parseFloat(String(consultationFee));
  if (isNaN(fee) || fee < 0) {
    res.status(400).json({ error: "consultationFee must be a non-negative number" });
    return;
  }

  const [created] = await db
    .insert(doctorCategoriesTable)
    .values({
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      consultationFee: fee.toFixed(2),
      sortOrder: sortOrder ?? 0,
    })
    .returning();

  res.status(201).json(created);
});

// ── PATCH /fee-schedule/:id — update name / fee / description ─────────────────
router.patch("/fee-schedule/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const allowed = session.roles.some((r) =>
    ["admin", "doctor", "receptionist"].includes(r)
  );
  if (!allowed) {
    res.status(403).json({ error: "Admin, doctor or receptionist only" });
    return;
  }

  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, description, consultationFee, sortOrder, isActive } = req.body as {
    name?: string;
    description?: string;
    consultationFee?: number | string;
    sortOrder?: number;
    isActive?: boolean;
  };

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = String(name).trim();
  if (description !== undefined) updateData.description = description;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (consultationFee !== undefined) {
    const fee = parseFloat(String(consultationFee));
    if (isNaN(fee) || fee < 0) {
      res.status(400).json({ error: "consultationFee must be a non-negative number" });
      return;
    }
    updateData.consultationFee = fee.toFixed(2);
  }

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const [updated] = await db
    .update(doctorCategoriesTable)
    .set(updateData as any)
    .where(eq(doctorCategoriesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Category not found" }); return; }
  res.json(updated);
});

// ── DELETE /fee-schedule/:id — soft-delete (mark inactive) ────────────────────
router.delete("/fee-schedule/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const allowed = session.roles.some((r) =>
    ["admin", "doctor", "receptionist"].includes(r)
  );
  if (!allowed) {
    res.status(403).json({ error: "Admin, doctor or receptionist only" });
    return;
  }

  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Check if any doctors are still using this category
  const usingDoctors = await db
    .select({ id: doctorsTable.id })
    .from(doctorsTable)
    .where(eq(doctorsTable.categoryId, id))
    .limit(1);

  if (usingDoctors.length > 0) {
    res.status(409).json({
      error: "Cannot delete: doctors are still assigned this category. Reassign them first.",
    });
    return;
  }

  const [deactivated] = await db
    .update(doctorCategoriesTable)
    .set({ isActive: false })
    .where(eq(doctorCategoriesTable.id, id))
    .returning();

  if (!deactivated) { res.status(404).json({ error: "Category not found" }); return; }
  res.json({ ok: true });
});

// ── PATCH /doctors/:id/category — assign category to doctor ───────────────────
router.patch("/doctors/:id/category", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const allowed = session.roles.some((r) =>
    ["admin", "doctor", "receptionist"].includes(r)
  );
  if (!allowed) {
    res.status(403).json({ error: "Admin, doctor or receptionist only" });
    return;
  }

  const doctorId = parseInt(String(req.params.id));
  if (isNaN(doctorId)) { res.status(400).json({ error: "Invalid doctor id" }); return; }

  const { categoryId } = req.body as { categoryId?: number | null };

  // Validate category exists if provided
  if (categoryId != null) {
    const [cat] = await db
      .select()
      .from(doctorCategoriesTable)
      .where(eq(doctorCategoriesTable.id, categoryId));
    if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
  }

  const [updated] = await db
    .update(doctorsTable)
    .set({ categoryId: categoryId ?? null })
    .where(eq(doctorsTable.id, doctorId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Doctor not found" }); return; }
  res.json(updated);
});

// ── PATCH /consultations/:id/fee-override — authorized fee override with audit ─
router.patch("/consultations/:id/fee-override", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const allowed = session.roles.some((r) =>
    ["admin", "doctor", "receptionist"].includes(r)
  );
  if (!allowed) {
    res.status(403).json({ error: "Not authorized to override fees" });
    return;
  }

  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid consultation id" }); return; }

  const { consultationFeeApplied, reason } = req.body as {
    consultationFeeApplied?: number | string;
    reason?: string;
  };

  if (consultationFeeApplied == null) {
    res.status(400).json({ error: "consultationFeeApplied is required" });
    return;
  }
  if (!reason || String(reason).trim().length < 5) {
    res.status(400).json({ error: "A reason of at least 5 characters is required for fee overrides" });
    return;
  }

  const fee = parseFloat(String(consultationFeeApplied));
  if (isNaN(fee) || fee < 0) {
    res.status(400).json({ error: "consultationFeeApplied must be a non-negative number" });
    return;
  }

  const { consultationsTable } = await import("@workspace/db");
  const { eq: eqOp } = await import("drizzle-orm");

  const [updated] = await db
    .update(consultationsTable)
    .set({
      consultationFeeApplied: fee.toFixed(2),
      feeOverrideReason: String(reason).trim(),
      feeOverriddenBy: session.userId,
      feeOverriddenAt: new Date(),
    } as any)
    .where(eqOp(consultationsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Consultation not found" }); return; }
  res.json(updated);
});

export default router;
