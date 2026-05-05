import { Router, type IRouter } from "express";
import type { Request } from "express";

declare module "express-session" {
  interface SessionData {
    userId: string;
    role: "doctor" | "patient" | "pharmacy" | "receptionist";
    name: string;
    email: string;
    doctorDbId: number | null;
    patientDbId: number | null;
  }
}

// Demo users mapped to real DB records (seed data: doctor ID=1, patient ID=1)
const DEMO_USERS: Record<string, {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "doctor" | "patient" | "pharmacy" | "receptionist";
  title?: string;
  specialization?: string;
  doctorDbId: number | null;
  patientDbId: number | null;
}> = {
  "doctor@clinicflow.ae": {
    id: "demo-doctor-1",
    name: "Dr. Ahmed Al-Rashidi",
    email: "doctor@clinicflow.ae",
    password: "doctor123",
    role: "doctor",
    title: "Senior Cardiologist",
    specialization: "Cardiology",
    doctorDbId: 1,
    patientDbId: null,
  },
  "patient@clinicflow.ae": {
    id: "demo-patient-1",
    name: "Mohammed Al-Sayed",
    email: "patient@clinicflow.ae",
    password: "patient123",
    role: "patient",
    doctorDbId: null,
    patientDbId: 1,
  },
  "pharmacy@clinicflow.ae": {
    id: "demo-pharmacy-1",
    name: "Pharmacy Staff",
    email: "pharmacy@clinicflow.ae",
    password: "pharmacy123",
    role: "pharmacy",
    title: "Head Pharmacist",
    doctorDbId: null,
    patientDbId: null,
  },
  "reception@clinicflow.ae": {
    id: "demo-receptionist-1",
    name: "Sara Al-Mansouri",
    email: "reception@clinicflow.ae",
    password: "reception123",
    role: "receptionist",
    title: "Head Receptionist",
    doctorDbId: null,
    patientDbId: null,
  },
};

const router: IRouter = Router();

router.post("/auth/login", (req, res): void => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const user = DEMO_USERS[email.toLowerCase().trim()];
  if (!user || user.password !== password) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const sess = (req as Request & { session: any }).session;
  sess.userId = user.id;
  sess.role = user.role;
  sess.name = user.name;
  sess.email = user.email;
  sess.doctorDbId = user.doctorDbId;
  sess.patientDbId = user.patientDbId;
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    title: user.title ?? null,
    specialization: user.specialization ?? null,
    doctorDbId: user.doctorDbId,
    patientDbId: user.patientDbId,
  });
});

router.post("/auth/logout", (req, res): void => {
  (req as any).session.destroy(() => {
    res.sendStatus(204);
  });
});

router.get("/auth/me", (req, res): void => {
  const session = (req as any).session;
  if (!session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = Object.values(DEMO_USERS).find((u) => u.id === session.userId);
  if (!user) {
    res.status(401).json({ error: "Session invalid" });
    return;
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    title: user.title ?? null,
    specialization: user.specialization ?? null,
    doctorDbId: user.doctorDbId,
    patientDbId: user.patientDbId,
  });
});

export default router;
