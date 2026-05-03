import { Router, type IRouter } from "express";
import type { Request } from "express";

declare module "express-session" {
  interface SessionData {
    userId: string;
    role: "doctor" | "patient" | "pharmacy";
    name: string;
    email: string;
  }
}

const DEMO_USERS: Record<string, {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "doctor" | "patient" | "pharmacy";
  title?: string;
  specialization?: string;
}> = {
  "doctor@clinicflow.ae": {
    id: "demo-doctor-1",
    name: "Dr. Ahmed Al-Rashidi",
    email: "doctor@clinicflow.ae",
    password: "doctor123",
    role: "doctor",
    title: "Senior Cardiologist",
    specialization: "Cardiology",
  },
  "patient@clinicflow.ae": {
    id: "demo-patient-1",
    name: "Mohammed Al-Sayed",
    email: "patient@clinicflow.ae",
    password: "patient123",
    role: "patient",
  },
  "pharmacy@clinicflow.ae": {
    id: "demo-pharmacy-1",
    name: "Pharmacy Staff",
    email: "pharmacy@clinicflow.ae",
    password: "pharmacy123",
    role: "pharmacy",
    title: "Head Pharmacist",
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
  (req as Request & { session: any }).session.userId = user.id;
  (req as Request & { session: any }).session.role = user.role;
  (req as Request & { session: any }).session.name = user.name;
  (req as Request & { session: any }).session.email = user.email;
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    title: user.title ?? null,
    specialization: user.specialization ?? null,
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
  });
});

export default router;
