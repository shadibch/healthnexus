import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { prescriptionsTable, prescriptionItemsTable, medicationsTable, patientsTable, doctorsTable } from "@workspace/db";
import {
  ListPrescriptionsQueryParams,
  CreatePrescriptionBody,
  GetPrescriptionParams,
  UpdatePrescriptionParams,
  UpdatePrescriptionBody,
} from "@workspace/api-zod";
import { requireAuth, getSessionUser } from "../lib/session";
import { getDb } from "../lib/tenant";

const router: IRouter = Router();

async function enrichPrescription(
  prescription: typeof prescriptionsTable.$inferSelect,
  patientMap: Map<number, string>,
  doctorMap: Map<number, string>
) {
  const items = await getDb().select({
      id: prescriptionItemsTable.id,
      prescriptionId: prescriptionItemsTable.prescriptionId,
      medicationId: prescriptionItemsTable.medicationId,
      medicationName: medicationsTable.name,
      dosage: prescriptionItemsTable.dosage,
      frequency: prescriptionItemsTable.frequency,
      duration: prescriptionItemsTable.duration,
      quantity: prescriptionItemsTable.quantity,
      instructions: prescriptionItemsTable.instructions,
    })
    .from(prescriptionItemsTable)
    .leftJoin(medicationsTable, eq(prescriptionItemsTable.medicationId, medicationsTable.id))
    .where(eq(prescriptionItemsTable.prescriptionId, prescription.id));

  return {
    ...prescription,
    dispensedAt: prescription.dispensedAt ? prescription.dispensedAt.toISOString() : null,
    patientName: patientMap.get(prescription.patientId) ?? null,
    doctorName: doctorMap.get(prescription.doctorId) ?? null,
    items,
  };
}

router.get("/prescriptions", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const parsed = ListPrescriptionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const patients = await getDb().select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await getDb().select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  let all = await getDb().select().from(prescriptionsTable).orderBy(prescriptionsTable.issuedAt);

  // Role-based isolation
  if (session.roles.includes("patient") && session.patientDbId != null) {
    all = all.filter((p) => p.patientId === session.patientDbId);
  } else if (session.roles.includes("doctor") && session.doctorDbId != null) {
    all = all.filter((p) => p.doctorId === session.doctorDbId);
  }
  // pharmacy sees all prescriptions

  const { patientId, doctorId, status, limit = 20 } = parsed.data;
  if (patientId && !session.roles.includes("patient")) all = all.filter((p) => p.patientId === patientId);
  if (doctorId && !session.roles.includes("doctor")) all = all.filter((p) => p.doctorId === doctorId);
  if (status) all = all.filter((p) => p.status === status);
  // consultationId filter (not in generated schema — parsed directly)
  const consultationIdRaw = req.query["consultationId"];
  if (consultationIdRaw) {
    const cid = parseInt(consultationIdRaw as string);
    if (!isNaN(cid)) all = all.filter((p) => p.consultationId === cid);
  }

  const sliced = all.slice(0, limit);
  const enriched = await Promise.all(sliced.map((p) => enrichPrescription(p, patientMap, doctorMap)));
  res.json(enriched);
});

router.post("/prescriptions", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.roles.includes("patient")) {
    res.status(403).json({ error: "Patients cannot create prescriptions" });
    return;
  }

  const parsed = CreatePrescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { items, ...prescriptionData } = parsed.data;
  const [prescription] = await getDb().insert(prescriptionsTable)
    .values(prescriptionData)
    .returning();

  if (items && items.length > 0) {
    await getDb().insert(prescriptionItemsTable).values(
      items.map((item) => ({ ...item, prescriptionId: prescription.id }))
    );
  }

  const patients = await getDb().select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await getDb().select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  const enriched = await enrichPrescription(prescription, patientMap, doctorMap);
  res.status(201).json(enriched);
});

router.get("/prescriptions/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const params = GetPrescriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [prescription] = await getDb().select()
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.id, params.data.id));
  if (!prescription) {
    res.status(404).json({ error: "Prescription not found" });
    return;
  }

  // Access control
  if (session.roles.includes("patient") && session.patientDbId !== prescription.patientId) {
    res.status(403).json({ error: "Not your prescription" });
    return;
  }
  if (session.roles.includes("doctor") && session.doctorDbId !== prescription.doctorId) {
    res.status(403).json({ error: "Not your prescription" });
    return;
  }

  const patients = await getDb().select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await getDb().select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  res.json(await enrichPrescription(prescription, patientMap, doctorMap));
});

router.patch("/prescriptions/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.roles.includes("patient")) {
    res.status(403).json({ error: "Patients cannot modify prescriptions" });
    return;
  }

  const params = UpdatePrescriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePrescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof prescriptionsTable.$inferInsert> = {};
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.notes != null) updateData.notes = parsed.data.notes;
  if (parsed.data.dispensedAt != null) updateData.dispensedAt = new Date(parsed.data.dispensedAt);

  const [prescription] = await getDb().update(prescriptionsTable)
    .set(updateData)
    .where(eq(prescriptionsTable.id, params.data.id))
    .returning();
  if (!prescription) {
    res.status(404).json({ error: "Prescription not found" });
    return;
  }

  const patients = await getDb().select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await getDb().select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  res.json(await enrichPrescription(prescription, patientMap, doctorMap));
});

export default router;
