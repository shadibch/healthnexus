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

// ── Available slots for a doctor on a date ────────────────────────────────────
// GET /appointments/slots?doctorId=1&date=2026-05-03
router.get("/appointments/slots", requireAuth, async (req, res): Promise<void> => {
  const doctorId = parseInt(req.query.doctorId as string);
  const dateStr = req.query.date as string;

  if (!doctorId || !dateStr) {
    res.status(400).json({ error: "doctorId and date are required" }); return;
  }

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" }); return;
  }

  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, doctorId)).limit(1);
  if (!doctor) { res.status(404).json({ error: "Doctor not found" }); return; }

  // Fetch all non-cancelled appointments for this doctor on this date
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const dayEnd   = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0);

  const booked = await db
    .select({ scheduledAt: appointmentsTable.scheduledAt, status: appointmentsTable.status })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.doctorId, doctorId),
        gte(appointmentsTable.scheduledAt, dayStart),
        lt(appointmentsTable.scheduledAt, dayEnd)
      )
    );

  const bookedMinutes = new Set(
    booked
      .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
      .map((a) => {
        const d = new Date(a.scheduledAt);
        return d.getHours() * 60 + d.getMinutes();
      })
  );

  const now = new Date();
  const isToday = dayStart.toDateString() === now.toDateString();

  // Generate 30-min slots: 08:30–12:30, 14:00–17:00 (lunch break 12:30-14:00)
  const SLOT_PAIRS: [number, number][] = [
    [8, 30], [9, 0], [9, 30], [10, 0], [10, 30], [11, 0], [11, 30], [12, 0], [12, 30],
    [14, 0], [14, 30], [15, 0], [15, 30], [16, 0], [16, 30],
  ];

  const slots = SLOT_PAIRS.map(([h, m]) => {
    const slotMinutes = h * 60 + m;
    const slotTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0);
    const isPast = isToday && slotTime <= now;
    const isBooked = bookedMinutes.has(slotMinutes);
    return {
      time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      available: !isPast && !isBooked,
      booked: isBooked,
      past: isPast,
    };
  });

  res.json({ doctorId, date: dateStr, slots });
});

router.get("/appointments/today", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  const parsed = GetTodayAppointmentsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const { patientMap, doctorMap } = await getMaps();

  let all = await db
    .select()
    .from(appointmentsTable)
    .where(and(gte(appointmentsTable.scheduledAt, todayStart), lt(appointmentsTable.scheduledAt, todayEnd)));

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
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { patientMap, doctorMap } = await getMaps();
  let all = await db.select().from(appointmentsTable).orderBy(appointmentsTable.scheduledAt);

  if (session.role === "doctor" && session.doctorDbId != null) {
    all = all.filter((a) => a.doctorId === session.doctorDbId);
  } else if (session.role === "patient" && session.patientDbId != null) {
    all = all.filter((a) => a.patientId === session.patientDbId);
  }

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

// ── Patient self-book ─────────────────────────────────────────────────────────
// POST /appointments/book  (patient only)
router.post("/appointments/book", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "patient" || !session.patientDbId) {
    res.status(403).json({ error: "Only patients can use self-booking" }); return;
  }

  const { doctorId, scheduledAt, type = "routine", notes } = req.body;
  if (!doctorId || !scheduledAt) {
    res.status(400).json({ error: "doctorId and scheduledAt are required" }); return;
  }

  const slotDate = new Date(scheduledAt);
  if (isNaN(slotDate.getTime())) {
    res.status(400).json({ error: "Invalid scheduledAt" }); return;
  }
  if (slotDate <= new Date()) {
    res.status(400).json({ error: "Cannot book a slot in the past" }); return;
  }

  // Check slot is not already taken
  const slotStart = slotDate;
  const slotEnd = new Date(slotDate.getTime() + 30 * 60 * 1000);
  const conflict = await db
    .select({ id: appointmentsTable.id })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.doctorId, parseInt(doctorId)),
        gte(appointmentsTable.scheduledAt, slotStart),
        lt(appointmentsTable.scheduledAt, slotEnd)
      )
    )
    .limit(1);

  const taken = conflict.filter(() => true); // drizzle returns array
  if (taken.length > 0) {
    res.status(409).json({ error: "This slot has just been booked. Please choose another." }); return;
  }

  // Queue number if today
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  let queueNumber: number | null = null;
  if (slotDate >= todayStart && slotDate < todayEnd) {
    const todayAppts = await db
      .select()
      .from(appointmentsTable)
      .where(and(gte(appointmentsTable.scheduledAt, todayStart), lt(appointmentsTable.scheduledAt, todayEnd)));
    queueNumber = todayAppts.length + 1;
  }

  const [appointment] = await db
    .insert(appointmentsTable)
    .values({
      patientId: session.patientDbId,
      doctorId: parseInt(doctorId),
      scheduledAt: slotDate,
      type,
      status: "scheduled",
      notes: notes ?? null,
      queueNumber,
    })
    .returning();

  const { patientMap, doctorMap } = await getMaps();
  res.status(201).json(enrichAppointment(appointment, patientMap, doctorMap));
});

// ── Patient cancel ────────────────────────────────────────────────────────────
router.patch("/appointments/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "patient" || !session.patientDbId) {
    res.status(403).json({ error: "Only patients can use self-cancel" }); return;
  }

  const apptId = parseInt(req.params.id);
  const [appointment] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, apptId))
    .limit(1);

  if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }
  if (appointment.patientId !== session.patientDbId) {
    res.status(403).json({ error: "Not your appointment" }); return;
  }
  if (["completed", "cancelled", "no_show", "in_progress"].includes(appointment.status)) {
    res.status(400).json({ error: `Cannot cancel an appointment with status: ${appointment.status}` }); return;
  }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ status: "cancelled" })
    .where(eq(appointmentsTable.id, apptId))
    .returning();

  const { patientMap, doctorMap } = await getMaps();
  res.json(enrichAppointment(updated, patientMap, doctorMap));
});

// ── Patient reschedule ────────────────────────────────────────────────────────
router.patch("/appointments/:id/reschedule", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role !== "patient" || !session.patientDbId) {
    res.status(403).json({ error: "Only patients can use self-reschedule" }); return;
  }

  const apptId = parseInt(req.params.id);
  const { scheduledAt, doctorId } = req.body;

  if (!scheduledAt) { res.status(400).json({ error: "scheduledAt is required" }); return; }

  const [appointment] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, apptId))
    .limit(1);

  if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }
  if (appointment.patientId !== session.patientDbId) {
    res.status(403).json({ error: "Not your appointment" }); return;
  }
  if (["completed", "cancelled", "no_show", "in_progress"].includes(appointment.status)) {
    res.status(400).json({ error: `Cannot reschedule an appointment with status: ${appointment.status}` }); return;
  }

  const newDate = new Date(scheduledAt);
  if (isNaN(newDate.getTime())) { res.status(400).json({ error: "Invalid scheduledAt" }); return; }
  if (newDate <= new Date()) { res.status(400).json({ error: "Cannot reschedule to a past slot" }); return; }

  const targetDoctorId = doctorId ? parseInt(doctorId) : appointment.doctorId;

  // Conflict check
  const slotEnd = new Date(newDate.getTime() + 30 * 60 * 1000);
  const conflicts = await db
    .select({ id: appointmentsTable.id })
    .from(appointmentsTable)
    .where(
      and(
        eq(appointmentsTable.doctorId, targetDoctorId),
        gte(appointmentsTable.scheduledAt, newDate),
        lt(appointmentsTable.scheduledAt, slotEnd)
      )
    );

  const hasConflict = conflicts.some((c) => c.id !== apptId);
  if (hasConflict) {
    res.status(409).json({ error: "This slot has just been booked. Please choose another." }); return;
  }

  const [updated] = await db
    .update(appointmentsTable)
    .set({ scheduledAt: newDate, doctorId: targetDoctorId, status: "scheduled" })
    .where(eq(appointmentsTable.id, apptId))
    .returning();

  const { patientMap, doctorMap } = await getMaps();
  res.json(enrichAppointment(updated, patientMap, doctorMap));
});

router.post("/appointments", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role === "patient") {
    res.status(403).json({ error: "Patients must use POST /appointments/book" }); return;
  }

  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
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
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [appointment] = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, params.data.id));

  if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }
  if (session.role === "doctor" && session.doctorDbId !== appointment.doctorId) {
    res.status(403).json({ error: "Not your appointment" }); return;
  }
  if (session.role === "patient" && session.patientDbId !== appointment.patientId) {
    res.status(403).json({ error: "Not your appointment" }); return;
  }

  const { patientMap, doctorMap } = await getMaps();
  res.json(enrichAppointment(appointment, patientMap, doctorMap));
});

router.patch("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role === "patient") {
    res.status(403).json({ error: "Patients must use /cancel or /reschedule endpoints" }); return;
  }

  const params = UpdateAppointmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateAppointmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

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
  if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }

  const { patientMap, doctorMap } = await getMaps();
  res.json(enrichAppointment(appointment, patientMap, doctorMap));
});

router.delete("/appointments/:id", requireAuth, async (req, res): Promise<void> => {
  const session = getSessionUser(req)!;
  if (session.role === "patient") {
    res.status(403).json({ error: "Patients must use the cancel endpoint" }); return;
  }

  const params = DeleteAppointmentParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [appointment] = await db
    .delete(appointmentsTable)
    .where(eq(appointmentsTable.id, params.data.id))
    .returning();
  if (!appointment) { res.status(404).json({ error: "Appointment not found" }); return; }
  res.sendStatus(204);
});

export default router;
