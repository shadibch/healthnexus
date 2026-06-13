import { Router, type IRouter } from "express";
import { eq, and, gte, lt } from "drizzle-orm";
import { db, appointmentsTable, patientsTable, doctorsTable } from "@workspace/db";
import { AdvanceQueueParams } from "@workspace/api-zod";
import { requireAuth, getSessionUser } from "../lib/session";

const router: IRouter = Router();
const STATUS_ORDER = ["scheduled", "confirmed", "in_progress", "completed"];

router.get("/queue", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const patients = await db.select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await db.select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  let appointments = await db
    .select()
    .from(appointmentsTable)
    .where(and(gte(appointmentsTable.scheduledAt, todayStart), lt(appointmentsTable.scheduledAt, todayEnd)));

  // Doctor sees only their own queue; pharmacy/admin sees all
  if (session.roles.includes("doctor") && session.doctorDbId != null) {
    appointments = appointments.filter((a) => a.doctorId === session.doctorDbId);
  } else if (session.roles.includes("patient") && session.patientDbId != null) {
    appointments = appointments.filter((a) => a.patientId === session.patientDbId);
  }

  const active = appointments.filter((a) => !["cancelled", "no_show", "completed"].includes(a.status));
  const waitingCount = active.filter((a) => ["scheduled", "confirmed"].includes(a.status)).length;

  const queue = appointments
    .filter((a) => !["cancelled", "no_show"].includes(a.status))
    .sort((a, b) => (a.queueNumber ?? 999) - (b.queueNumber ?? 999))
    .map((a) => ({
      appointmentId: a.id,
      queueNumber: a.queueNumber ?? 0,
      patientId: a.patientId,
      patientName: patientMap.get(a.patientId) ?? "Unknown",
      doctorId: a.doctorId,
      doctorName: doctorMap.get(a.doctorId) ?? "Unknown",
      status: a.status,
      scheduledAt: a.scheduledAt,
      type: a.type,
      notes: a.notes,
      waitingCount,
    }));

  res.json(queue);
});

router.post("/queue/:appointmentId/advance", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const params = AdvanceQueueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [appointment] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, params.data.appointmentId));
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  // Only the assigned doctor can advance their own queue
  if (session.roles.includes("doctor") && session.doctorDbId !== appointment.doctorId) {
    res.status(403).json({ error: "Not authorized to manage this appointment" });
    return;
  }

  const currentIndex = STATUS_ORDER.indexOf(appointment.status);
  const nextStatus = currentIndex >= 0 && currentIndex < STATUS_ORDER.length - 1
    ? STATUS_ORDER[currentIndex + 1]
    : appointment.status;

  const [updated] = await db
    .update(appointmentsTable)
    .set({ status: nextStatus })
    .where(eq(appointmentsTable.id, params.data.appointmentId))
    .returning();

  const patients = await db.select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await db.select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const todayAppts = await db
    .select()
    .from(appointmentsTable)
    .where(and(gte(appointmentsTable.scheduledAt, todayStart), lt(appointmentsTable.scheduledAt, todayEnd)));
  const waitingCount = todayAppts.filter((a) => ["scheduled", "confirmed"].includes(a.status)).length;

  res.json({
    appointmentId: updated.id,
    queueNumber: updated.queueNumber ?? 0,
    patientId: updated.patientId,
    patientName: patientMap.get(updated.patientId) ?? "Unknown",
    doctorId: updated.doctorId,
    doctorName: doctorMap.get(updated.doctorId) ?? "Unknown",
    status: updated.status,
    scheduledAt: updated.scheduledAt,
    type: updated.type,
    notes: updated.notes,
    waitingCount,
  });
});

export default router;
