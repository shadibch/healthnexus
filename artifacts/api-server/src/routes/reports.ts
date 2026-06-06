import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import {
  db,
  patientsTable,
  consultationsTable,
  medicalOrdersTable,
  prescriptionsTable,
  prescriptionItemsTable,
  medicationsTable,
} from "@workspace/db";
import { requireAuth, requireRole, getSessionUser } from "../lib/session";

const router: IRouter = Router();

// ── GET /reports/overview ─────────────────────────────────────────────────────
router.get("/reports/overview", requireAuth, requireRole("doctor"), async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const doctorId = session.doctorDbId!;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const weekStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const [consultations, prescriptions] = await Promise.all([
    db.select().from(consultationsTable)
      .where(eq(consultationsTable.doctorId, doctorId))
      .orderBy(desc(consultationsTable.createdAt)),
    db.select().from(prescriptionsTable)
      .where(eq(prescriptionsTable.doctorId, doctorId))
      .orderBy(desc(prescriptionsTable.issuedAt)),
  ]);

  const consultationIds = consultations.map((c) => c.id);
  const orders = consultationIds.length > 0
    ? await db.select().from(medicalOrdersTable)
        .where(inArray(medicalOrdersTable.consultationId, consultationIds))
        .orderBy(desc(medicalOrdersTable.orderedAt))
    : [];

  const thisMonth = consultations.filter((c) => c.createdAt >= monthStart);
  const lastMonth = consultations.filter(
    (c) => c.createdAt >= lastMonthStart && c.createdAt < monthStart
  );
  const thisWeek = consultations.filter((c) => c.createdAt >= weekStart);

  const completionRate = thisMonth.length > 0
    ? Math.round(thisMonth.filter((c) => c.status === "completed").length / thisMonth.length * 100)
    : 0;

  const byEncounterType = [
    { name: "Initial",   nameAr: "أول زيارة", count: thisMonth.filter((c) => c.encounterType === "initial").length },
    { name: "Follow-up", nameAr: "متابعة",    count: thisMonth.filter((c) => c.encounterType === "follow_up").length },
    { name: "Emergency", nameAr: "طوارئ",     count: thisMonth.filter((c) => c.encounterType === "emergency").length },
  ];

  const byOrderType = [
    { name: "Lab",       nameAr: "تحاليل",   count: orders.filter((o) => o.type === "lab").length },
    { name: "X-Ray",     nameAr: "أشعة",     count: orders.filter((o) => o.type === "xray").length },
    { name: "CT",        nameAr: "مقطعية",   count: orders.filter((o) => o.type === "ct").length },
    { name: "MRI",       nameAr: "رنين",     count: orders.filter((o) => o.type === "mri").length },
    { name: "Ultrasound",nameAr: "موجات",    count: orders.filter((o) => o.type === "ultrasound").length },
    { name: "ECG",       nameAr: "قلب",      count: orders.filter((o) => o.type === "ecg").length },
    { name: "Other",     nameAr: "أخرى",     count: orders.filter((o) => o.type === "other").length },
  ].filter((t) => t.count > 0);

  res.json({
    thisMonth: {
      consultations: thisMonth.length,
      completed: thisMonth.filter((c) => c.status === "completed").length,
      completionRate,
    },
    lastMonth: { consultations: lastMonth.length },
    thisWeek: { consultations: thisWeek.length },
    allTime: { consultations: consultations.length },
    orders: {
      total: orders.length,
      pending: orders.filter((o) => ["ordered", "in_progress"].includes(o.status)).length,
      completed: orders.filter((o) => o.status === "completed").length,
      byType: byOrderType,
    },
    prescriptions: {
      total: prescriptions.length,
      pending: prescriptions.filter((p) => p.status === "pending").length,
      dispensed: prescriptions.filter((p) => p.status === "dispensed").length,
    },
    byEncounterType,
  });
});

// ── GET /reports/orders — all orders for doctor, enriched with patient info ──
router.get("/reports/orders", requireAuth, requireRole("doctor"), async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const doctorId = session.doctorDbId!;

  const { type, status, from, to } = req.query as {
    type?: string; status?: string; from?: string; to?: string;
  };

  const consultations = await db.select().from(consultationsTable)
    .where(eq(consultationsTable.doctorId, doctorId));

  const consultationIds = consultations.map((c) => c.id);
  if (consultationIds.length === 0) { res.json([]); return; }

  let orders = await db.select().from(medicalOrdersTable)
    .where(inArray(medicalOrdersTable.consultationId, consultationIds))
    .orderBy(desc(medicalOrdersTable.orderedAt));

  if (type && type !== "all") orders = orders.filter((o) => o.type === type);
  if (status && status !== "all") orders = orders.filter((o) => o.status === status);
  if (from) { const d = new Date(from); orders = orders.filter((o) => o.orderedAt >= d); }
  if (to) { const d = new Date(to); d.setDate(d.getDate() + 1); orders = orders.filter((o) => o.orderedAt < d); }

  const consultMap = new Map(consultations.map((c) => [c.id, c]));
  const patientIds = [...new Set(consultations.map((c) => c.patientId))];
  const patients = patientIds.length > 0
    ? await db.select().from(patientsTable).where(inArray(patientsTable.id, patientIds))
    : [];
  const patientMap = new Map(patients.map((p) => [p.id, p]));

  const enriched = orders.map((o) => {
    const consult = consultMap.get(o.consultationId);
    const patient = consult ? patientMap.get(consult.patientId) : null;
    return {
      ...o,
      orderedAt: o.orderedAt.toISOString(),
      completedAt: o.completedAt?.toISOString() ?? null,
      patientName: patient
        ? `${patient.firstName} ${patient.lastName}`
        : null,
      patientId: consult?.patientId ?? null,
      diagnosis: consult?.diagnosis ?? null,
      consultationId: o.consultationId,
    };
  });

  res.json(enriched);
});

// ── GET /reports/patient-summary — patients enriched with last visit ──────────
router.get("/reports/patient-summary", requireAuth, requireRole("doctor"), async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const doctorId = session.doctorDbId!;

  const [patients, consultations, prescriptions] = await Promise.all([
    db.select().from(patientsTable).orderBy(desc(patientsTable.createdAt)),
    db.select().from(consultationsTable).where(eq(consultationsTable.doctorId, doctorId)),
    db.select().from(prescriptionsTable).where(eq(prescriptionsTable.doctorId, doctorId)),
  ]);

  const lastVisitMap = new Map<number, string>();
  const visitCountMap = new Map<number, number>();
  const rxCountMap = new Map<number, number>();

  for (const c of consultations) {
    const existing = lastVisitMap.get(c.patientId);
    if (!existing || c.createdAt.toISOString() > existing) {
      lastVisitMap.set(c.patientId, c.createdAt.toISOString());
    }
    visitCountMap.set(c.patientId, (visitCountMap.get(c.patientId) ?? 0) + 1);
  }
  for (const p of prescriptions) {
    if (p.status === "pending") {
      rxCountMap.set(p.patientId, (rxCountMap.get(p.patientId) ?? 0) + 1);
    }
  }

  // Only return patients this doctor has seen
  const seenPatientIds = new Set(consultations.map((c) => c.patientId));
  const filtered = patients.filter((p) => seenPatientIds.has(p.id));

  const enriched = filtered.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    dateOfBirth: p.dateOfBirth,
    gender: p.gender,
    bloodType: p.bloodType,
    allergies: p.allergies,
    medicalNotes: p.medicalNotes,
    phone: p.phone,
    createdAt: p.createdAt.toISOString(),
    lastVisit: lastVisitMap.get(p.id) ?? null,
    visitCount: visitCountMap.get(p.id) ?? 0,
    pendingRx: rxCountMap.get(p.id) ?? 0,
  }));

  res.json(enriched);
});

export default router;
