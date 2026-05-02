import { Router, type IRouter } from "express";
import { eq, ilike, or } from "drizzle-orm";
import { db, patientsTable, appointmentsTable, consultationsTable, prescriptionsTable, prescriptionItemsTable, medicationsTable, doctorsTable } from "@workspace/db";
import {
  ListPatientsQueryParams,
  CreatePatientBody,
  GetPatientParams,
  UpdatePatientParams,
  UpdatePatientBody,
  DeletePatientParams,
  GetPatientHistoryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/patients", async (req, res): Promise<void> => {
  const parsed = ListPatientsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, limit = 50, offset = 0 } = parsed.data;

  let patients;
  if (search) {
    patients = await db
      .select()
      .from(patientsTable)
      .where(
        or(
          ilike(patientsTable.firstName, `%${search}%`),
          ilike(patientsTable.lastName, `%${search}%`),
          ilike(patientsTable.phone, `%${search}%`),
          ilike(patientsTable.nationalId, `%${search}%`)
        )
      )
      .limit(limit)
      .offset(offset);
  } else {
    patients = await db.select().from(patientsTable).limit(limit).offset(offset);
  }
  res.json(patients);
});

router.post("/patients", async (req, res): Promise<void> => {
  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [patient] = await db.insert(patientsTable).values(parsed.data).returning();
  res.status(201).json(patient);
});

router.get("/patients/:id", async (req, res): Promise<void> => {
  const params = GetPatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, params.data.id));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  res.json(patient);
});

router.patch("/patients/:id", async (req, res): Promise<void> => {
  const params = UpdatePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [patient] = await db
    .update(patientsTable)
    .set(parsed.data)
    .where(eq(patientsTable.id, params.data.id))
    .returning();
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  res.json(patient);
});

router.delete("/patients/:id", async (req, res): Promise<void> => {
  const params = DeletePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [patient] = await db.delete(patientsTable).where(eq(patientsTable.id, params.data.id)).returning();
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/patients/:id/history", async (req, res): Promise<void> => {
  const params = GetPatientHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const patientId = params.data.id;

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, patientId));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const doctors = await db.select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  const appointments = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.patientId, patientId))
    .orderBy(appointmentsTable.scheduledAt);

  const consultations = await db
    .select()
    .from(consultationsTable)
    .where(eq(consultationsTable.patientId, patientId))
    .orderBy(consultationsTable.createdAt);

  const prescriptionsRaw = await db
    .select()
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.patientId, patientId))
    .orderBy(prescriptionsTable.issuedAt);

  const prescriptionIds = prescriptionsRaw.map((p) => p.id);
  let allItems: (typeof prescriptionItemsTable.$inferSelect & { medicationName: string | null })[] = [];
  if (prescriptionIds.length > 0) {
    const items = await db
      .select({
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
      .leftJoin(medicationsTable, eq(prescriptionItemsTable.medicationId, medicationsTable.id));
    allItems = items.filter((i) => prescriptionIds.includes(i.prescriptionId));
  }

  const prescriptions = prescriptionsRaw.map((p) => ({
    ...p,
    patientName: `${patient.firstName} ${patient.lastName}`,
    doctorName: doctorMap.get(p.doctorId) ?? null,
    dispensedAt: p.dispensedAt ? p.dispensedAt.toISOString() : null,
    items: allItems.filter((i) => i.prescriptionId === p.id),
  }));

  res.json({
    patient,
    appointments: appointments.map((a) => ({
      ...a,
      patientName: `${patient.firstName} ${patient.lastName}`,
      doctorName: doctorMap.get(a.doctorId) ?? null,
    })),
    consultations: consultations.map((c) => ({
      ...c,
      patientName: `${patient.firstName} ${patient.lastName}`,
      doctorName: doctorMap.get(c.doctorId) ?? null,
    })),
    prescriptions,
  });
});

export default router;
