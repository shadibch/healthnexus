import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { consultationsTable, patientsTable, doctorsTable, encounterActivitiesTable, doctorCategoriesTable } from "@workspace/db";
import { requireAuth, getSessionUser } from "../lib/session";
import { getDb } from "../lib/tenant";

const router: IRouter = Router();

// GET /billing/claims?from=YYYY-MM-DD&to=YYYY-MM-DD&status=partial
router.get("/billing/claims", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (!session.roles.includes("receptionist") && !session.roles.includes("doctor")) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const fromRaw = req.query.from as string | undefined;
  const toRaw = req.query.to as string | undefined;
  const statusFilter = (req.query.status as string) ?? "partial";

  const patients = await getDb().select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, p]));

  const doctors = await getDb().select().from(doctorsTable);
  const categories = await getDb().select().from(doctorCategoriesTable);
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const doctorMap = new Map(
    doctors.map((d) => [
      d.id,
      {
        name: `Dr. ${d.firstName} ${d.lastName}`,
        category: d.categoryId != null ? (categoryMap.get(d.categoryId) ?? null) : null,
      },
    ])
  );

  let consultations = await getDb().select()
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
      const activities = await getDb().select()
        .from(encounterActivitiesTable)
        .where(eq(encounterActivitiesTable.consultationId, c.id));

      const activityTotal = activities.reduce((sum, a) => sum + parseFloat(a.total ?? "0"), 0);
      const patient = patientMap.get(c.patientId);
      const doctor = doctorMap.get(c.doctorId);

      // Use snapshotted category on consultation; fall back to live doctor category for older records
      const effectiveDoctorCategory = c.doctorCategory ?? doctor?.category ?? null;

      return {
        ...c,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : null,
        patientNationalId: patient?.nationalId ?? null,
        patientPhone: patient?.phone ?? null,
        doctorName: doctor?.name ?? null,
        doctorCategory: effectiveDoctorCategory,
        consultationFeeApplied: c.consultationFeeApplied ?? null,
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
  if (!session.roles.includes("receptionist") && !session.roles.includes("doctor")) {
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

  const [updated] = await getDb().update(consultationsTable)
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
