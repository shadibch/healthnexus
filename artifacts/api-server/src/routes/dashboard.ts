import { Router, type IRouter } from "express";
import { gte, lt, and, eq } from "drizzle-orm";
import { patientsTable, doctorsTable, appointmentsTable, prescriptionsTable, stockTable, consultationsTable } from "@workspace/db";
import { GetDashboardActivityQueryParams } from "@workspace/api-zod";
import { requireAuth, getSessionUser } from "../lib/session";
import { getDb } from "../lib/tenant";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [allPatients, allDoctors, allStock] = await Promise.all([
    getDb().select().from(patientsTable),
    getDb().select().from(doctorsTable),
    getDb().select().from(stockTable),
  ]);

  // Fetch data filtered by role
  let todayAppointments = await getDb().select().from(appointmentsTable).where(
    and(gte(appointmentsTable.scheduledAt, todayStart), lt(appointmentsTable.scheduledAt, todayEnd))
  );
  let allPrescriptions = await getDb().select().from(prescriptionsTable);
  let monthConsultations = await getDb().select().from(consultationsTable).where(gte(consultationsTable.createdAt, monthStart));

  // Role-based isolation
  if (session.roles.includes("doctor") && session.doctorDbId != null) {
    todayAppointments = todayAppointments.filter((a) => a.doctorId === session.doctorDbId);
    allPrescriptions = allPrescriptions.filter((p) => p.doctorId === session.doctorDbId);
    monthConsultations = monthConsultations.filter((c) => c.doctorId === session.doctorDbId);
  } else if (session.roles.includes("patient") && session.patientDbId != null) {
    todayAppointments = todayAppointments.filter((a) => a.patientId === session.patientDbId);
    allPrescriptions = allPrescriptions.filter((p) => p.patientId === session.patientDbId);
    monthConsultations = monthConsultations.filter((c) => c.patientId === session.patientDbId);
  }

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

  // Specialization stats — only relevant for doctor role dashboard
  let topSpecializations: { specialization: string; count: number; doctorCount: number }[] = [];
  if (session.roles.includes("doctor") || session.roles.includes("pharmacy")) {
    const specializationMap = new Map<string, number>();
    const specializationDoctorMap = new Map<string, Set<number>>();
    for (const doc of allDoctors) {
      const spec = doc.specialization;
      specializationDoctorMap.set(spec, (specializationDoctorMap.get(spec) ?? new Set()).add(doc.id));
    }
    const allAppts = await getDb().select().from(appointmentsTable);
    for (const appt of allAppts) {
      const doc = allDoctors.find((d) => d.id === appt.doctorId);
      if (doc) {
        specializationMap.set(doc.specialization, (specializationMap.get(doc.specialization) ?? 0) + 1);
      }
    }
    topSpecializations = Array.from(specializationMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([specialization, count]) => ({
        specialization,
        count,
        doctorCount: specializationDoctorMap.get(specialization)?.size ?? 0,
      }));
  }

  res.json({
    totalPatients: session.roles.includes("patient") ? 1 : allPatients.length,
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

router.get("/dashboard/activity", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const parsed = GetDashboardActivityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const limit = parsed.data.limit ?? 10;

  const [patients, doctors, allAppointments, allPrescriptions, allConsultations] = await Promise.all([
    getDb().select().from(patientsTable),
    getDb().select().from(doctorsTable),
    getDb().select().from(appointmentsTable).orderBy(appointmentsTable.updatedAt),
    getDb().select().from(prescriptionsTable).orderBy(prescriptionsTable.updatedAt),
    getDb().select().from(consultationsTable).orderBy(consultationsTable.updatedAt),
  ]);

  // Role-based filtering
  let appointments = allAppointments;
  let prescriptions = allPrescriptions;
  let consultations = allConsultations;

  if (session.roles.includes("doctor") && session.doctorDbId != null) {
    appointments = appointments.filter((a) => a.doctorId === session.doctorDbId);
    prescriptions = prescriptions.filter((p) => p.doctorId === session.doctorDbId);
    consultations = consultations.filter((c) => c.doctorId === session.doctorDbId);
  } else if (session.roles.includes("patient") && session.patientDbId != null) {
    appointments = appointments.filter((a) => a.patientId === session.patientDbId);
    prescriptions = prescriptions.filter((p) => p.patientId === session.patientDbId);
    consultations = consultations.filter((c) => c.patientId === session.patientDbId);
  }

  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  type ActivityItem = {
    id: string; type: string; description: string;
    patientName: string | null; doctorName: string | null; timestamp: Date;
  };
  const activities: ActivityItem[] = [];

  if (!session.roles.includes("patient")) {
    for (const p of patients.slice(-5)) {
      activities.push({
        id: `patient-${p.id}`, type: "patient_registered",
        description: `New patient: ${p.firstName} ${p.lastName}`,
        patientName: `${p.firstName} ${p.lastName}`, doctorName: null, timestamp: p.createdAt,
      });
    }
  }

  for (const a of appointments.filter((a) => a.status === "completed").slice(-5)) {
    activities.push({
      id: `appt-${a.id}`, type: "appointment_completed",
      description: "Appointment completed",
      patientName: patientMap.get(a.patientId) ?? null,
      doctorName: doctorMap.get(a.doctorId) ?? null, timestamp: a.updatedAt,
    });
  }

  for (const p of prescriptions.slice(-5)) {
    const isDispensed = p.status === "dispensed";
    activities.push({
      id: `rx-${p.id}`, type: isDispensed ? "prescription_dispensed" : "prescription_issued",
      description: isDispensed ? "Prescription dispensed" : "Prescription issued",
      patientName: patientMap.get(p.patientId) ?? null,
      doctorName: doctorMap.get(p.doctorId) ?? null,
      timestamp: isDispensed ? (p.dispensedAt ?? p.updatedAt) : p.issuedAt,
    });
  }

  for (const c of consultations.slice(-3)) {
    activities.push({
      id: `consult-${c.id}`, type: "consultation_created",
      description: `Encounter ${c.status === "completed" ? "completed" : "started"}`,
      patientName: patientMap.get(c.patientId) ?? null,
      doctorName: doctorMap.get(c.doctorId) ?? null, timestamp: c.updatedAt,
    });
  }

  activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  res.json(activities.slice(0, limit).map((a) => ({ ...a, timestamp: a.timestamp.toISOString() })));
});

export default router;
