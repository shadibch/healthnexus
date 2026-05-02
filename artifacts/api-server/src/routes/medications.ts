import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, medicationsTable } from "@workspace/db";
import {
  ListMedicationsQueryParams,
  CreateMedicationBody,
  GetMedicationParams,
  UpdateMedicationParams,
  UpdateMedicationBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/medications", async (req, res): Promise<void> => {
  const parsed = ListMedicationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, category } = parsed.data;

  let all = await db.select().from(medicationsTable);
  if (search) {
    const s = search.toLowerCase();
    all = all.filter(
      (m) =>
        m.name.toLowerCase().includes(s) ||
        (m.genericName ?? "").toLowerCase().includes(s)
    );
  }
  if (category) {
    all = all.filter((m) => m.category?.toLowerCase().includes(category.toLowerCase()));
  }
  res.json(all);
});

router.post("/medications", async (req, res): Promise<void> => {
  const parsed = CreateMedicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [medication] = await db.insert(medicationsTable).values(parsed.data).returning();
  res.status(201).json(medication);
});

router.get("/medications/:id", async (req, res): Promise<void> => {
  const params = GetMedicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [medication] = await db.select().from(medicationsTable).where(eq(medicationsTable.id, params.data.id));
  if (!medication) {
    res.status(404).json({ error: "Medication not found" });
    return;
  }
  res.json(medication);
});

router.patch("/medications/:id", async (req, res): Promise<void> => {
  const params = UpdateMedicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMedicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [medication] = await db
    .update(medicationsTable)
    .set(parsed.data)
    .where(eq(medicationsTable.id, params.data.id))
    .returning();
  if (!medication) {
    res.status(404).json({ error: "Medication not found" });
    return;
  }
  res.json(medication);
});

export default router;
