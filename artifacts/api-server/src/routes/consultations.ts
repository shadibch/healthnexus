import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, consultationsTable, patientsTable, doctorsTable } from "@workspace/db";
import {
  ListConsultationsQueryParams,
  CreateConsultationBody,
  GetConsultationParams,
  UpdateConsultationParams,
  UpdateConsultationBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/consultations", async (req, res): Promise<void> => {
  const parsed = ListConsultationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const patients = await db.select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await db.select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  let all = await db.select().from(consultationsTable).orderBy(consultationsTable.createdAt);

  const { patientId, doctorId, limit = 20 } = parsed.data;
  if (patientId) all = all.filter((c) => c.patientId === patientId);
  if (doctorId) all = all.filter((c) => c.doctorId === doctorId);

  const sliced = all.slice(0, limit);
  res.json(
    sliced.map((c) => ({
      ...c,
      patientName: patientMap.get(c.patientId) ?? null,
      doctorName: doctorMap.get(c.doctorId) ?? null,
    }))
  );
});

router.post("/consultations", async (req, res): Promise<void> => {
  const parsed = CreateConsultationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [consultation] = await db.insert(consultationsTable).values(parsed.data).returning();

  const patients = await db.select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await db.select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  res.status(201).json({
    ...consultation,
    patientName: patientMap.get(consultation.patientId) ?? null,
    doctorName: doctorMap.get(consultation.doctorId) ?? null,
  });
});

router.get("/consultations/:id", async (req, res): Promise<void> => {
  const params = GetConsultationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [consultation] = await db
    .select()
    .from(consultationsTable)
    .where(eq(consultationsTable.id, params.data.id));
  if (!consultation) {
    res.status(404).json({ error: "Consultation not found" });
    return;
  }

  const patients = await db.select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await db.select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  res.json({
    ...consultation,
    patientName: patientMap.get(consultation.patientId) ?? null,
    doctorName: doctorMap.get(consultation.doctorId) ?? null,
  });
});

router.patch("/consultations/:id", async (req, res): Promise<void> => {
  const params = UpdateConsultationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateConsultationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [consultation] = await db
    .update(consultationsTable)
    .set(parsed.data)
    .where(eq(consultationsTable.id, params.data.id))
    .returning();
  if (!consultation) {
    res.status(404).json({ error: "Consultation not found" });
    return;
  }

  const patients = await db.select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await db.select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  res.json({
    ...consultation,
    patientName: patientMap.get(consultation.patientId) ?? null,
    doctorName: doctorMap.get(consultation.doctorId) ?? null,
  });
});

export default router;
