import { Router, type IRouter } from "express";
import { eq, and, gte, lt } from "drizzle-orm";
import { db, appointmentsTable, patientsTable, doctorsTable } from "@workspace/db";
import {
  ListAppointmentsQueryParams,
  CreateAppointmentBody,
  GetAppointmentParams,
  UpdateAppointmentParams,
  UpdateAppointmentBody,
  DeleteAppointmentParams,
  GetTodayAppointmentsQueryParams,
} from "@workspace/api-zod";
import { requireAuth, getSessionUser } from "../lib/session";

const router: IRouter = Router();

function enrichAppointment(
  a: typeof appointmentsTable.$inferSelect,
  patientMap: Map<number, string>,
  doctorMap: Map<number, string>
) {
  return {
    ...a,
    patientName: patientMap.get(a.patientId) ?? null,
    doctorName: doctorMap.get(a.doctorId) ?? null,
  };
}

async function getMaps() {
  const patients = await db.select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  const doctors = await db.select().from(doctorsTable);
  const doctorMap = new Map(doctors.map((d) => [d.id, `Dr. ${d.firstName} ${d.lastName}`]));
  return { patientMap, doctorMap };
}

router.get("/appointments/today", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const parsed = GetTodayAppointmentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const { patientMap, doctorMap } = await getMaps();

  let all = await db
    .select()
    .from(appointmentsTable)
    .where(and(gte(appointmentsTable.scheduledAt, todayStart), lt(appointmentsTable.scheduledAt, todayEnd)));

  // Role-based filtering
  if (session.role === "doctor" && session.doctorDbId != null) {
    all = all.filter((a) => a.doctorId === session.doctorDbId);
  } else if (session.role === "patient" && session.patientDbId != null) {
    all = all.filter((a) => a.patientId === session.patientDbId);
  }

  const appointments = all.map((a) => enrichAppointment(a, patientMap, doctorMap));

  res.json({
    date: todayStart.toISOString().split("T")[0],
    total: appointments.length,
    scheduled: appointments.filter((a) => a.status === "scheduled").length,
    confirmed: appointments.filter((a) => a.status === "confirmed").length,
    inProgress: appointments.filter((a) => a.status === "in_progress").length,
    completed: appointments.filter((a) => a.status === "completed").length,
    cancelled: appointments.filter((a) => a.status === "cancelled").length,
    noShow: appointments.filter((a) => a.status === "no_show").length,
    appointments,
  });
});

router.get("/appointments", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const parsed = ListAppointmentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { patientMap, doctorMap } = await getMaps();
  let all = await db.select().from(appointmentsTable).orderBy(appointmentsTable.scheduledAt);

  // Role-based isolation first
  if (session.role === "doctor" && session.doctorDbId != null) {
    all = all.filter((a) => a.doctorId === session.doctorDbId);
  } else if (session.role === "patient" && session.patientDbId != null) {
    all = all.filter((a) => a.patientId === session.patientDbId);
  }

  // Then apply query filters
  const { doctorId, patientId, status, date, limit = 50, offset = 0 } = parsed.data;
  if (doctorId && session.role !== "patient") all = all.filter((a) => a.doctorId === doctorId);
  if (patientId && session.role !== "doctor") all = all.filter((a) => a.patientId === patientId);
  if (status) all = all.filter((a) => a.status === status);
  if (date) {
    const d = new Date(date);
    const nextDay = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    all = all.filter((a) => a.scheduledAt >= d && a.scheduledAt < nextDay);
  }

  const sliced = all.slice(offset, offset + limit);
  res.json(sliced.map((a) => enrichAppointment(a, patientMap, doctorMap)));
});

router.post("/appointments", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role === "patient") {
    res.status(403).json({ error: "Patients cannot create appointments directly" });
    return;
  }

  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const scheduledAt = new Date(parsed.data.scheduledAt);

  let queueNumber: number | null = null;
  if (scheduledAt >= todayStart && scheduledAt < todayEnd) {
    const todayAppts = await db
      .select()
      .from(appointmentsTable)
      .where(and(gte(appointmentsTable.scheduledAt, todayStart), lt(appointmentsTable.scheduledAt, todayEnd)));
    queueNumber = todayAppts.length + 1;
  }

  const [appointment] = await db
    .insert(appointmentsTable)
    .values({ ...parsed.data, scheduledAt, queueNumber })
    .returning();

  const { patientMap, doctorMap } = await getMaps();
  res.status(201).json(enrichAppointment(appointment, patientMap, doctorMap));
});

router.get("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const params = GetAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [appointment] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, params.data.id));
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  // Access control
  if (session.role === "doctor" && session.doctorDbId !== appointment.doctorId) {
    res.status(403).json({ error: "Not your appointment" });
    return;
  }
  if (session.role === "patient" && session.patientDbId !== appointment.patientId) {
    res.status(403).json({ error: "Not your appointment" });
    return;
  }

  const { patientMap, doctorMap } = await getMaps();
  res.json(enrichAppointment(appointment, patientMap, doctorMap));
});

router.patch("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role === "patient") {
    res.status(403).json({ error: "Patients cannot modify appointments" });
    return;
  }

  const params = UpdateAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAppointmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof appointmentsTable.$inferInsert> = {};
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.notes != null) updateData.notes = parsed.data.notes;
  if (parsed.data.type != null) updateData.type = parsed.data.type;
  if (parsed.data.queueNumber != null) updateData.queueNumber = parsed.data.queueNumber;
  if (parsed.data.scheduledAt != null) updateData.scheduledAt = new Date(parsed.data.scheduledAt);

  const [appointment] = await db
    .update(appointmentsTable)
    .set(updateData)
    .where(eq(appointmentsTable.id, params.data.id))
    .returning();
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }

  const { patientMap, doctorMap } = await getMaps();
  res.json(enrichAppointment(appointment, patientMap, doctorMap));
});

router.delete("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role === "patient") {
    res.status(403).json({ error: "Patients cannot delete appointments" });
    return;
  }

  const params = DeleteAppointmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [appointment] = await db
    .delete(appointmentsTable)
    .where(eq(appointmentsTable.id, params.data.id))
    .returning();
  if (!appointment) {
    res.status(404).json({ error: "Appointment not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
