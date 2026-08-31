import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { stockTable, medicationsTable } from "@workspace/db";
import {
  ListStockQueryParams,
  CreateStockBody,
  UpdateStockParams,
  UpdateStockBody,
} from "@workspace/api-zod";
import { getDb } from "../lib/tenant";

const router: IRouter = Router();

function isLowStock(s: typeof stockTable.$inferSelect) {
  return s.quantity <= s.minimumQuantity;
}

function isExpiringSoon(s: typeof stockTable.$inferSelect) {
  if (!s.expiryDate) return false;
  const expiry = new Date(s.expiryDate);
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return expiry <= thirtyDaysFromNow;
}

async function enrichStock(s: typeof stockTable.$inferSelect) {
  const [med] = await getDb().select().from(medicationsTable).where(eq(medicationsTable.id, s.medicationId));
  return {
    ...s,
    medicationName: med?.name ?? null,
    isLowStock: isLowStock(s),
  };
}

router.get("/stock", async (req, res): Promise<void> => {
  const parsed = ListStockQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const meds = await getDb().select().from(medicationsTable);
  const medMap = new Map(meds.map((m) => [m.id, m.name]));

  let all = await getDb().select().from(stockTable);
  if (parsed.data.medicationId) {
    all = all.filter((s) => s.medicationId === parsed.data.medicationId);
  }
  if (parsed.data.lowStock) {
    all = all.filter(isLowStock);
  }

  res.json(
    all.map((s) => ({
      ...s,
      medicationName: medMap.get(s.medicationId) ?? null,
      isLowStock: isLowStock(s),
    }))
  );
});

router.get("/stock/alerts", async (req, res): Promise<void> => {
  const meds = await getDb().select().from(medicationsTable);
  const medMap = new Map(meds.map((m) => [m.id, m.name]));

  const all = await getDb().select().from(stockTable);
  const enriched = all.map((s) => ({
    ...s,
    medicationName: medMap.get(s.medicationId) ?? null,
    isLowStock: isLowStock(s),
  }));

  const lowStock = enriched.filter((s) => s.isLowStock);
  const expiringSoon = enriched.filter(isExpiringSoon);

  res.json({
    lowStock,
    expiringSoon,
    totalLowStock: lowStock.length,
    totalExpiringSoon: expiringSoon.length,
  });
});

router.post("/stock", async (req, res): Promise<void> => {
  const parsed = CreateStockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [stock] = await getDb().insert(stockTable).values(parsed.data as any).returning();
  const [med] = await getDb().select().from(medicationsTable).where(eq(medicationsTable.id, stock.medicationId));
  res.status(201).json({ ...stock, medicationName: med?.name ?? null, isLowStock: isLowStock(stock) });
});

router.patch("/stock/:id", async (req, res): Promise<void> => {
  const params = UpdateStockParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateStockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [stock] = await getDb().update(stockTable)
    .set(parsed.data as any)
    .where(eq(stockTable.id, params.data.id))
    .returning();
  if (!stock) {
    res.status(404).json({ error: "Stock item not found" });
    return;
  }
  const [med] = await getDb().select().from(medicationsTable).where(eq(medicationsTable.id, stock.medicationId));
  res.json({ ...stock, medicationName: med?.name ?? null, isLowStock: isLowStock(stock) });
});

export default router;
