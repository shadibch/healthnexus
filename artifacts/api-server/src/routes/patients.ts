import { Router, type IRouter } from "express";
import { eq, ilike, or, desc } from "drizzle-orm";
import { db, patientsTable, appointmentsTable, consultationsTable, prescriptionsTable, prescriptionItemsTable, medicationsTable, doctorsTable, medicalOrdersTable } from "@workspace/db";
import {
  ListPatientsQueryParams,
  CreatePatientBody,
  GetPatientParams,
  UpdatePatientParams,
  UpdatePatientBody,
  DeletePatientParams,
  GetPatientHistoryParams,
} from "@workspace/api-zod";
import { requireAuth, getSessionUser } from "../lib/session";

const router: IRouter = Router();

router.get("/patients", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;

  // Patients can only see their own record
  if (session.role === "patient") {
    if (!session.patientDbId) { res.status(403).json({ error: "No patient record" }); return; }
    const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, session.patientDbId));
    res.json(patient ? [patient] : []);
    return;
  }

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

router.post("/patients", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role === "patient") {
    res.status(403).json({ error: "Patients cannot register new patients" });
    return;
  }
  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [patient] = await db.insert(patientsTable).values(parsed.data).returning();
  res.status(201).json(patient);
});

router.get("/patients/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const params = GetPatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Patient can only fetch their own record
  if (session.role === "patient" && session.patientDbId !== params.data.id) {
    res.status(403).json({ error: "Not your record" });
    return;
  }
  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, params.data.id));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  res.json(patient);
});

router.patch("/patients/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role === "patient") {
    res.status(403).json({ error: "Patients cannot modify records directly" });
    return;
  }
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

router.delete("/patients/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "doctor") {
    res.status(403).json({ error: "Only doctors can delete patient records" });
    return;
  }
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

router.get("/patients/:id/history", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const params = GetPatientHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const patientId = params.data.id;

  // Patients can only see their own history
  if (session.role === "patient" && session.patientDbId !== patientId) {
    res.status(403).json({ error: "Not your record" });
    return;
  }

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, patientId));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const doctors = await db.select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  const [appointments, consultations, prescriptionsRaw] = await Promise.all([
    db.select().from(appointmentsTable).where(eq(appointmentsTable.patientId, patientId)).orderBy(appointmentsTable.scheduledAt),
    db.select().from(consultationsTable).where(eq(consultationsTable.patientId, patientId)).orderBy(consultationsTable.createdAt),
    db.select().from(prescriptionsTable).where(eq(prescriptionsTable.patientId, patientId)).orderBy(prescriptionsTable.issuedAt),
  ]);

  const prescriptionIds = prescriptionsRaw.map((p) => p.id);
  let allItems: any[] = [];
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

// Last 3 encounters for a patient — any doctor can read (read-only clinical history)
router.get("/patients/:id/encounters", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const patientId = parseInt(req.params.id);
  if (isNaN(patientId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Patient can only see their own encounters
  if (session.role === "patient" && session.patientDbId !== patientId) {
    res.status(403).json({ error: "Not your record" });
    return;
  }

  const doctors = await db.select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  const encounters = await db
    .select()
    .from(consultationsTable)
    .where(eq(consultationsTable.patientId, patientId))
    .orderBy(desc(consultationsTable.createdAt))
    .limit(3);

  // Fetch orders for each encounter
  const encountersWithOrders = await Promise.all(
    encounters.map(async (enc) => {
      const orders = await db
        .select()
        .from(medicalOrdersTable)
        .where(eq(medicalOrdersTable.consultationId, enc.id))
        .orderBy(medicalOrdersTable.orderedAt);
      return {
        ...enc,
        doctorName: doctorMap.get(enc.doctorId) ?? null,
        orders,
      };
    })
  );

  res.json(encountersWithOrders);
});

export default router;
