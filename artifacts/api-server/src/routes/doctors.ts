import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, doctorsTable, appointmentsTable, patientsTable } from "@workspace/db";
import {
  ListDoctorsQueryParams,
  CreateDoctorBody,
  GetDoctorParams,
  UpdateDoctorParams,
  UpdateDoctorBody,
  DeleteDoctorParams,
  GetDoctorScheduleParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/doctors", async (req, res): Promise<void> => {
  const parsed = ListDoctorsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { specialization } = parsed.data;

  let doctors;
  if (specialization) {
    doctors = await db
      .select()
      .from(doctorsTable)
      .where(ilike(doctorsTable.specialization, `%${specialization}%`));
  } else {
    doctors = await db.select().from(doctorsTable);
  }
  res.json(doctors);
});

router.post("/doctors", async (req, res): Promise<void> => {
  const parsed = CreateDoctorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [doctor] = await db.insert(doctorsTable).values(parsed.data as any).returning();
  res.status(201).json(doctor);
});

router.get("/doctors/:id", async (req, res): Promise<void> => {
  const params = GetDoctorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, params.data.id));
  if (!doctor) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }
  res.json(doctor);
});

router.patch("/doctors/:id", async (req, res): Promise<void> => {
  const params = UpdateDoctorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDoctorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [doctor] = await db
    .update(doctorsTable)
    .set(parsed.data as any)
    .where(eq(doctorsTable.id, params.data.id))
    .returning();
  if (!doctor) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }
  res.json(doctor);
});

router.delete("/doctors/:id", async (req, res): Promise<void> => {
  const params = DeleteDoctorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [doctor] = await db.delete(doctorsTable).where(eq(doctorsTable.id, params.data.id)).returning();
  if (!doctor) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/doctors/:id/schedule", async (req, res): Promise<void> => {
  const params = GetDoctorScheduleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const doctorId = params.data.id;
  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, doctorId));
  if (!doctor) {
    res.status(404).json({ error: "Doctor not found" });
    return;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const patients = await db.select().from(patientsTable);
  const patientMap = new Map(patients.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));

  const todayAppointments = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.doctorId, doctorId));

  const todayFiltered = todayAppointments.filter(
    (a) => a.scheduledAt >= todayStart && a.scheduledAt < todayEnd
  );

  const todayTotal = todayFiltered.length;
  const todayCompleted = todayFiltered.filter((a) => a.status === "completed").length;
  const todayPending = todayFiltered.filter((a) =>
    ["scheduled", "confirmed", "in_progress"].includes(a.status)
  ).length;

  const upcoming = todayFiltered
    .filter((a) => ["scheduled", "confirmed"].includes(a.status))
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    .slice(0, 10)
    .map((a) => ({
      ...a,
      patientName: patientMap.get(a.patientId) ?? null,
      doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
    }));

  res.json({
    doctor,
    todayTotal,
    todayCompleted,
    todayPending,
    upcomingAppointments: upcoming,
  });
});

export default router;
