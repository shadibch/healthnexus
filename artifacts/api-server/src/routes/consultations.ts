import { Router, type IRouter } from "express";
import { eq, desc, lt, and } from "drizzle-orm";
import { db, consultationsTable, patientsTable, doctorsTable, medicalOrdersTable, doctorCategoriesTable } from "@workspace/db";
import {
  ListConsultationsQueryParams,
  CreateConsultationBody,
  GetConsultationParams,
  UpdateConsultationParams,
  UpdateConsultationBody,
} from "@workspace/api-zod";
import { requireAuth, getSessionUser } from "../lib/session";

// Server-side schema: omit doctorId — always set from session, never from body
const CreateConsultationServerBody = CreateConsultationBody.omit({ doctorId: true });

const router: IRouter = Router();

async function getMaps() {
  const patients = await db.select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await db.select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));
  return { patientMap, doctorMap };
}

/**
 * Resolves the consultation fee from the doctor's assigned category.
 * Falls back to the legacy doctors.consultationFee if no category is set.
 */
async function resolveDoctorFee(
  doctorId: number
): Promise<{ fee: string | null; categoryName: string | null }> {
  const [doctor] = await db
    .select()
    .from(doctorsTable)
    .where(eq(doctorsTable.id, doctorId));

  if (!doctor) return { fee: null, categoryName: null };

  if (doctor.categoryId != null) {
    const [category] = await db
      .select()
      .from(doctorCategoriesTable)
      .where(eq(doctorCategoriesTable.id, doctor.categoryId));
    if (category) {
      return { fee: category.consultationFee, categoryName: category.name };
    }
  }

  // Backward compat: use legacy consultationFee on the doctor record
  if (doctor.consultationFee != null) {
    return { fee: doctor.consultationFee, categoryName: null };
  }

  return { fee: null, categoryName: null };
}

router.get("/consultations", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const parsed = ListConsultationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { patientMap, doctorMap } = await getMaps();
  let all = await db.select().from(consultationsTable).orderBy(desc(consultationsTable.createdAt));

  // Role-based isolation
  if (session.roles.includes("doctor") && session.doctorDbId != null) {
    all = all.filter((c) => c.doctorId === session.doctorDbId);
  } else if (session.roles.includes("patient") && session.patientDbId != null) {
    all = all.filter((c) => c.patientId === session.patientDbId);
  }

  const { patientId, doctorId, limit = 20 } = parsed.data;
  if (patientId) all = all.filter((c) => c.patientId === patientId);
  if (doctorId) all = all.filter((c) => c.doctorId === doctorId);

  // Support direct appointmentId filter (for encounter page lookup)
  const appointmentIdRaw = req.query.appointmentId;
  if (appointmentIdRaw) {
    const appointmentId = parseInt(String(appointmentIdRaw));
    if (!isNaN(appointmentId)) all = all.filter((c) => c.appointmentId === appointmentId);
  }

  const sliced = all.slice(0, limit);
  res.json(
    sliced.map((c) => ({
      ...c,
      patientName: patientMap.get(c.patientId) ?? null,
      doctorName: doctorMap.get(c.doctorId) ?? null,
    }))
  );
});

// Create consultation/encounter with 7-day follow-up detection + fee auto-apply
router.post("/consultations", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("doctor")) {
    res.status(403).json({ error: "Only doctors can create consultations" });
    return;
  }

  const parsed = CreateConsultationServerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data as any;
  const doctorId = session.doctorDbId!;
  const patientId = data.patientId;
  const appointmentId = data.appointmentId;

  // Prevent duplicate encounter for the same appointment
  if (appointmentId) {
    const existing = await db
      .select()
      .from(consultationsTable)
      .where(eq(consultationsTable.appointmentId, appointmentId))
      .limit(1);
    if (existing.length > 0) {
      const { patientMap, doctorMap } = await getMaps();
      const enc = existing[0];
      const orders = await db
        .select()
        .from(medicalOrdersTable)
        .where(eq(medicalOrdersTable.consultationId, enc.id))
        .orderBy(medicalOrdersTable.orderedAt);
      res.status(200).json({
        ...enc,
        patientName: patientMap.get(enc.patientId) ?? null,
        doctorName: doctorMap.get(enc.doctorId) ?? null,
        isFollowUp: enc.encounterType === "follow_up",
        orders,
      });
      return;
    }
  }

  // 7-day follow-up detection
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentConsultations = await db
    .select()
    .from(consultationsTable)
    .where(
      and(
        eq(consultationsTable.patientId, patientId),
        lt(consultationsTable.createdAt, sevenDaysAgo)
      )
    )
    .orderBy(desc(consultationsTable.createdAt))
    .limit(1);

  let parentConsultationId: number | null = null;
  let encounterType = data.encounterType ?? "initial";

  if (recentConsultations.length > 0) {
    parentConsultationId = recentConsultations[0].id;
    encounterType = "follow_up";
  }

  // Auto-apply consultation fee from doctor's category (or legacy fee)
  const { fee, categoryName } = await resolveDoctorFee(doctorId);

  const [consultation] = await db
    .insert(consultationsTable)
    .values({
      ...data,
      doctorId,
      parentConsultationId,
      encounterType,
      consultationFeeApplied: fee,
      doctorCategory: categoryName,
    })
    .returning();

  const { patientMap, doctorMap } = await getMaps();
  res.status(201).json({
    ...consultation,
    patientName: patientMap.get(consultation.patientId) ?? null,
    doctorName: doctorMap.get(consultation.doctorId) ?? null,
    isFollowUp: parentConsultationId != null,
  });
});

router.get("/consultations/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
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

  if (session.roles.includes("patient") && session.patientDbId !== consultation.patientId) {
    res.status(403).json({ error: "Not your consultation" });
    return;
  }

  const { patientMap, doctorMap } = await getMaps();

  const orders = await db
    .select()
    .from(medicalOrdersTable)
    .where(eq(medicalOrdersTable.consultationId, consultation.id))
    .orderBy(medicalOrdersTable.orderedAt);

  res.json({
    ...consultation,
    patientName: patientMap.get(consultation.patientId) ?? null,
    doctorName: doctorMap.get(consultation.doctorId) ?? null,
    orders,
  });
});

router.patch("/consultations/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("doctor")) {
    res.status(403).json({ error: "Only doctors can update consultations" });
    return;
  }

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

  const { patientMap, doctorMap } = await getMaps();
  res.json({
    ...consultation,
    patientName: patientMap.get(consultation.patientId) ?? null,
    doctorName: doctorMap.get(consultation.doctorId) ?? null,
  });
});

router.get("/consultations/:id/orders", requireAuth, async (req, res): Promise<void> => {
  const idNum = parseInt(String(req.params.id));
  if (isNaN(idNum)) { res.status(400).json({ error: "Invalid id" }); return; }
  const orders = await db
    .select()
    .from(medicalOrdersTable)
    .where(eq(medicalOrdersTable.consultationId, idNum))
    .orderBy(medicalOrdersTable.orderedAt);
  res.json(orders);
});

router.post("/consultations/:id/orders", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("doctor")) {
    res.status(403).json({ error: "Only doctors can create medical orders" });
    return;
  }

  const idNum = parseInt(String(req.params.id));
  if (isNaN(idNum)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [consultation] = await db
    .select()
    .from(consultationsTable)
    .where(eq(consultationsTable.id, idNum));
  if (!consultation) { res.status(404).json({ error: "Consultation not found" }); return; }

  const { type, name, priority, notes } = req.body as {
    type: string; name: string; priority?: string; notes?: string;
  };
  if (!type || !name) {
    res.status(400).json({ error: "type and name are required" });
    return;
  }

  const [order] = await db.insert(medicalOrdersTable).values({
    consultationId: idNum,
    patientId: consultation.patientId,
    doctorId: consultation.doctorId,
    type,
    name,
    priority: priority ?? "routine",
    notes: notes ?? null,
    status: "ordered",
  }).returning();

  res.status(201).json(order);
});

export default router;
