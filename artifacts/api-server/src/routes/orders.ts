import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, medicalOrdersTable } from "@workspace/db";
import { requireAuth, getSessionUser } from "../lib/session";

const router: IRouter = Router();

router.patch("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const idNum = parseInt(req.params.id);
  if (isNaN(idNum)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(medicalOrdersTable).where(eq(medicalOrdersTable.id, idNum));
  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }

  const { status, resultData, resultNotes, completedAt } = req.body as {
    status?: string; resultData?: string; resultNotes?: string; completedAt?: string;
  };

  const update: Partial<typeof medicalOrdersTable.$inferInsert> = {};
  if (status) update.status = status;
  if (resultData !== undefined) update.resultData = resultData;
  if (resultNotes !== undefined) update.resultNotes = resultNotes;
  if (completedAt) update.completedAt = new Date(completedAt);
  if (status === "completed" && !completedAt) update.completedAt = new Date();

  const [updated] = await db
    .update(medicalOrdersTable)
    .set(update)
    .where(eq(medicalOrdersTable.id, idNum))
    .returning();

  res.json(updated);
});

router.delete("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "doctor") {
    res.status(403).json({ error: "Only doctors can cancel orders" });
    return;
  }
  const idNum = parseInt(req.params.id);
  if (isNaN(idNum)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.update(medicalOrdersTable)
    .set({ status: "cancelled" })
    .where(eq(medicalOrdersTable.id, idNum));
  res.sendStatus(204);
});

export default router;
