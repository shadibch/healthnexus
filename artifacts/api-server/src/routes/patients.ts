import { Router, type IRouter } from "express";
import { eq, ilike, or, desc } from "drizzle-orm";
import { patientsTable, appointmentsTable, consultationsTable, prescriptionsTable, prescriptionItemsTable, medicationsTable, doctorsTable, medicalOrdersTable } from "@workspace/db";
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
import { getDb } from "../lib/tenant";

const router: IRouter = Router();

router.get("/patients", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;

  // Patients can only see their own record
  if (session.roles.includes("patient")) {
    if (!session.patientDbId) { res.status(403).json({ error: "No patient record" }); return; }
    const [patient] = await getDb().select().from(patientsTable).where(eq(patientsTable.id, session.patientDbId));
    res.json(patient ? [patient] : []);
    return;
  }

  const parsed = ListPatientsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, limit = 50, offset = 0 } = parsed.data;

  // Only allow staff roles to list patients
  const isStaff = session.roles.some((r) => r !== "patient");
  if (!isStaff) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let patients;
  if (search) {
    patients = await getDb().select()
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
    patients = await getDb().select().from(patientsTable).limit(limit).offset(offset);
  }
  res.json(patients);
});

router.post("/patients", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.roles.includes("patient")) {
    res.status(403).json({ error: "Patients cannot register new patients" });
    return;
  }
  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [patient] = await getDb().insert(patientsTable).values(parsed.data).returning();
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
  if (session.roles.includes("patient") && session.patientDbId !== params.data.id) {
    res.status(403).json({ error: "Not your record" });
    return;
  }
  const [patient] = await getDb().select().from(patientsTable).where(eq(patientsTable.id, params.data.id));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  // Ensure staff can only access patients within their medical center
  if (!session.roles.includes("patient") && session.medicalCenterId && patient.medicalCenterId !== session.medicalCenterId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(patient);
});

router.patch("/patients/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  // Only doctors or admins can modify patient records
  if (!session.roles.includes("doctor") && !session.roles.includes("admin")) {
    res.status(403).json({ error: "Forbidden" });
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
  const [existing] = await getDb().select().from(patientsTable).where(eq(patientsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  if (session.medicalCenterId && existing.medicalCenterId !== session.medicalCenterId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [patient] = await getDb().update(patientsTable)
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
  // Only doctors within the same medical center can delete
  if (!session.roles.includes("doctor")) {
    res.status(403).json({ error: "Only doctors can delete patient records" });
    return;
  }
  const params = DeletePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await getDb().select().from(patientsTable).where(eq(patientsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  if (session.medicalCenterId && existing.medicalCenterId !== session.medicalCenterId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [patient] = await getDb().delete(patientsTable).where(eq(patientsTable.id, params.data.id)).returning();
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
  if (session.roles.includes("patient") && session.patientDbId !== patientId) {
    res.status(403).json({ error: "Not your record" });
    return;
  }

  const [patient] = await getDb().select().from(patientsTable).where(eq(patientsTable.id, patientId));
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }
  // Enforce same medical center for staff
  if (!session.roles.includes("patient") && session.medicalCenterId && patient.medicalCenterId !== session.medicalCenterId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const doctors = await getDb().select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  const [appointments, consultations, prescriptionsRaw] = await Promise.all([
    getDb().select().from(appointmentsTable).where(eq(appointmentsTable.patientId, patientId)).orderBy(appointmentsTable.scheduledAt),
    getDb().select().from(consultationsTable).where(eq(consultationsTable.patientId, patientId)).orderBy(consultationsTable.createdAt),
    getDb().select().from(prescriptionsTable).where(eq(prescriptionsTable.patientId, patientId)).orderBy(prescriptionsTable.issuedAt),
  ]);

  const prescriptionIds = prescriptionsRaw.map((p) => p.id);
  let allItems: any[] = [];
  if (prescriptionIds.length > 0) {
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
  const patientId = parseInt(String(req.params.id));
  if (isNaN(patientId)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Patient can only see their own encounters
  if (session.roles.includes("patient") && session.patientDbId !== patientId) {
    res.status(403).json({ error: "Not your record" });
    return;
  }

  const doctors = await getDb().select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  const encounters = await getDb().select()
    .from(consultationsTable)
    .where(eq(consultationsTable.patientId, patientId))
    .orderBy(desc(consultationsTable.createdAt))
    .limit(3);

  // Fetch orders for each encounter
  const encountersWithOrders = await Promise.all(
    encounters.map(async (enc) => {
      const orders = await getDb().select()
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
