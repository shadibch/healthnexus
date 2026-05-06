import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, consultationsTable, patientsTable, doctorsTable, encounterActivitiesTable } from "@workspace/db";
import { requireAuth, getSessionUser } from "../lib/session";

const router: IRouter = Router();

// GET /billing/claims?from=YYYY-MM-DD&to=YYYY-MM-DD&status=partial
// Returns encounters with partial or unpaid payment for insurance billing
router.get("/billing/claims", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "receptionist" && session.role !== "doctor") {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const fromRaw = req.query.from as string | undefined;
  const toRaw = req.query.to as string | undefined;
  const statusFilter = (req.query.status as string) ?? "partial";

  const patients = await db.select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, p]));
  const doctors = await db.select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  let consultations = await db
    .select()
    .from(consultationsTable)
    .where(eq(consultationsTable.paymentStatus, statusFilter))
    .orderBy(desc(consultationsTable.createdAt));

  if (fromRaw) {
    const from = new Date(fromRaw);
    if (!isNaN(from.getTime())) {
      consultations = consultations.filter((c) => new Date(c.createdAt) >= from);
    }
  }
  if (toRaw) {
    const to = new Date(toRaw + "T23:59:59");
    if (!isNaN(to.getTime())) {
      consultations = consultations.filter((c) => new Date(c.createdAt) <= to);
    }
  }

  const enriched = await Promise.all(
    consultations.map(async (c) => {
      const activities = await db
        .select()
        .from(encounterActivitiesTable)
        .where(eq(encounterActivitiesTable.consultationId, c.id));

      const activityTotal = activities.reduce((sum, a) => sum + parseFloat(a.total ?? "0"), 0);
      const patient = patientMap.get(c.patientId);

      return {
        ...c,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : null,
        patientNationalId: patient?.nationalId ?? null,
        patientPhone: patient?.phone ?? null,
        doctorName: doctorMap.get(c.doctorId) ?? null,
        activities,
        activityTotal: activityTotal.toFixed(2),
      };
    })
  );

  res.json(enriched);
});

// PATCH /consultations/:id/payment — receptionist/doctor can record payment
router.patch("/consultations/:id/payment", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "receptionist" && session.role !== "doctor") {
    res.status(403).json({ error: "Only receptionist or doctor can record payment" });
    return;
  }

  const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(idParam);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { paymentStatus, paymentMethod, paidAmount, insuranceCompany, insuranceAmount } = req.body;

  if (!paymentStatus) {
    res.status(400).json({ error: "paymentStatus is required" });
    return;
  }

  const allowed = ["unpaid", "paid", "exempted", "partial"];
  if (!allowed.includes(paymentStatus)) {
    res.status(400).json({ error: `paymentStatus must be one of: ${allowed.join(", ")}` });
    return;
  }

  const updateData: Record<string, unknown> = { paymentStatus };
  if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
  if (paidAmount !== undefined) updateData.paidAmount = paidAmount;
  if (insuranceCompany !== undefined) updateData.insuranceCompany = insuranceCompany;
  if (insuranceAmount !== undefined) updateData.insuranceAmount = insuranceAmount;

  const [updated] = await db
    .update(consultationsTable)
    .set(updateData as any)
    .where(eq(consultationsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Consultation not found" });
    return;
  }

  res.json(updated);
});

export default router;
