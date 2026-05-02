import { Router, type IRouter } from "express";
import { gte, lt, and } from "drizzle-orm";
import { db, patientsTable, doctorsTable, appointmentsTable, prescriptionsTable, stockTable, consultationsTable } from "@workspace/db";
import { GetDashboardActivityQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    allPatients,
    allDoctors,
    todayAppointments,
    allPrescriptions,
    allStock,
    monthConsultations,
  ] = await Promise.all([
    db.select().from(patientsTable),
    db.select().from(doctorsTable),
    db.select().from(appointmentsTable).where(
      and(gte(appointmentsTable.scheduledAt, todayStart), lt(appointmentsTable.scheduledAt, todayEnd))
    ),
    db.select().from(prescriptionsTable),
    db.select().from(stockTable),
    db.select().from(consultationsTable).where(gte(consultationsTable.createdAt, monthStart)),
  ]);

  const appointmentsCompleted = todayAppointments.filter((a) => a.status === "completed").length;
  const appointmentsPending = todayAppointments.filter((a) =>
    ["scheduled", "confirmed", "in_progress"].includes(a.status)
  ).length;
  const prescriptionsPending = allPrescriptions.filter((p) => p.status === "pending").length;
  const lowStockAlerts = allStock.filter((s) => s.quantity <= s.minimumQuantity).length;

  const statusCounts = ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"].map(
    (status) => ({
      status,
      count: todayAppointments.filter((a) => a.status === status).length,
    })
  );

  const specializationMap = new Map<string, number>();
  const specializationDoctorMap = new Map<string, Set<number>>();
  for (const doc of allDoctors) {
    const spec = doc.specialization;
    specializationDoctorMap.set(spec, (specializationDoctorMap.get(spec) ?? new Set()).add(doc.id));
  }
  const allAppts = await db.select().from(appointmentsTable);
  for (const appt of allAppts) {
    const doc = allDoctors.find((d) => d.id === appt.doctorId);
    if (doc) {
      specializationMap.set(doc.specialization, (specializationMap.get(doc.specialization) ?? 0) + 1);
    }
  }

  const topSpecializations = Array.from(specializationMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([specialization, count]) => ({
      specialization,
      count,
      doctorCount: specializationDoctorMap.get(specialization)?.size ?? 0,
    }));

  res.json({
    totalPatients: allPatients.length,
    totalDoctors: allDoctors.length,
    appointmentsToday: todayAppointments.length,
    appointmentsCompleted,
    appointmentsPending,
    prescriptionsPending,
    lowStockAlerts,
    totalConsultationsThisMonth: monthConsultations.length,
    appointmentsByStatus: statusCounts,
    topSpecializations,
  });
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const parsed = GetDashboardActivityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const limit = parsed.data.limit ?? 10;

  const [patients, doctors, appointments, prescriptions, consultations] = await Promise.all([
    db.select().from(patientsTable),
    db.select().from(doctorsTable),
    db.select().from(appointmentsTable).orderBy(appointmentsTable.updatedAt),
    db.select().from(prescriptionsTable).orderBy(prescriptionsTable.updatedAt),
    db.select().from(consultationsTable).orderBy(consultationsTable.updatedAt),
  ]);

  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  type ActivityItem = {
    id: string;
    type: string;
    description: string;
    patientName: string | null;
    doctorName: string | null;
    timestamp: Date;
  };

  const activities: ActivityItem[] = [];

  // Recent patients
  for (const p of patients.slice(-5)) {
    activities.push({
      id: `patient-${p.id}`,
      type: "patient_registered",
      description: `New patient registered: ${p.firstName} ${p.lastName}`,
      patientName: `${p.firstName} ${p.lastName}`,
      doctorName: null,
      timestamp: p.createdAt,
    });
  }

  // Recent completed appointments
  for (const a of appointments.filter((a) => a.status === "completed").slice(-5)) {
    activities.push({
      id: `appt-completed-${a.id}`,
      type: "appointment_completed",
      description: `Appointment completed`,
      patientName: patientMap.get(a.patientId) ?? null,
      doctorName: doctorMap.get(a.doctorId) ?? null,
      timestamp: a.updatedAt,
    });
  }

  // Recent prescriptions
  for (const p of prescriptions.slice(-5)) {
    const isDispensed = p.status === "dispensed";
    activities.push({
      id: `rx-${p.id}`,
      type: isDispensed ? "prescription_dispensed" : "prescription_issued",
      description: isDispensed ? "Prescription dispensed" : "Prescription issued",
      patientName: patientMap.get(p.patientId) ?? null,
      doctorName: doctorMap.get(p.doctorId) ?? null,
      timestamp: isDispensed ? (p.dispensedAt ?? p.updatedAt) : p.issuedAt,
    });
  }

  // Recent consultations
  for (const c of consultations.slice(-3)) {
    activities.push({
      id: `consult-${c.id}`,
      type: "consultation_created",
      description: `Consultation ${c.status === "completed" ? "completed" : "started"}`,
      patientName: patientMap.get(c.patientId) ?? null,
      doctorName: doctorMap.get(c.doctorId) ?? null,
      timestamp: c.updatedAt,
    });
  }

  activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const sliced = activities.slice(0, limit);

  res.json(
    sliced.map((a) => ({
      ...a,
      timestamp: a.timestamp.toISOString(),
    }))
  );
});

export default router;
