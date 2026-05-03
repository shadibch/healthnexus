# ClinicFlow — Hospital & Clinic Management Platform

## Overview
A full-stack clinic management platform targeting Middle East & Africa markets. Bilingual-ready (Arabic/English), mobile-friendly, covering three roles: Doctor, Patient, and Pharmacy.

## Architecture

### Monorepo Structure
- `artifacts/clinic-app/` — React + Vite frontend (port via $PORT, preview at `/`)
- `artifacts/api-server/` — Express API server (port 8080, paths at `/api`)
- `lib/api-spec/` — OpenAPI spec + Orval codegen config
- `lib/api-zod/` — Generated Zod schemas and React Query hooks
- `lib/api-client-react/` — Generated React Query client hooks
- `lib/db/` — Drizzle ORM schema + PostgreSQL migrations

### Tech Stack
- **Frontend**: React 18, Vite, Tailwind CSS v4, shadcn/ui, Wouter routing, TanStack Query, Recharts
- **Backend**: Express, Drizzle ORM, Zod validation, Pino logging
- **Database**: PostgreSQL (via DATABASE_URL)
- **Theme**: Emerald/teal healthcare theme, light + dark mode

## Database Schema
Tables: `patients`, `doctors`, `appointments`, `consultations`, `prescriptions`, `prescription_items`, `medications`, `stock`

## API Routes (all prefixed `/api`)
- `GET/POST /patients` — list + create patients
- `GET/PATCH/DELETE /patients/:id` — patient CRUD
- `GET /patients/:id/history` — full patient history
- `GET/POST /doctors` — list + create doctors
- `GET/PATCH/DELETE /doctors/:id` — doctor CRUD
- `GET /doctors/:id/schedule` — today's schedule
- `GET /appointments/today` — today's appointments summary
- `GET/POST /appointments` — list + create appointments
- `GET/PATCH/DELETE /appointments/:id`
- `GET /queue` — today's live queue
- `POST /queue/:appointmentId/advance` — advance queue status
- `GET/POST /consultations` — list + create
- `GET/PATCH /consultations/:id`
- `GET/POST /prescriptions` — list + create (with items)
- `GET/PATCH /prescriptions/:id` — includes dispense workflow
- `GET/POST /medications` — medication catalog
- `GET/PATCH /medications/:id`
- `GET/POST /stock` — pharmacy stock
- `GET /stock/alerts` — low stock + expiring soon
- `PATCH /stock/:id`
- `GET /dashboard/stats` — summary KPIs
- `GET /dashboard/activity` — recent activity feed

## Frontend Pages
- `/` — Dashboard (stats, bar chart, activity feed — changes by role)
- `/patients` — Patient list + search + registration + history sidebar
- `/queue` — Live queue with advance/complete actions (auto-refreshes 15s)
- `/consultations` — Consultation records with diagnosis/treatment
- `/prescriptions` — Prescriptions list + pharmacy dispense workflow
- `/stock` — Pharmacy stock management with low-stock alerts
- `/appointments` — Appointment list (patient role view)

## Authentication
Session-based auth via `express-session` + `SESSION_SECRET` env var.

Demo accounts (auto-populate from login page):
- `doctor@clinicflow.ae` / `doctor123` → Doctor View
- `patient@clinicflow.ae` / `patient123` → Patient View
- `pharmacy@clinicflow.ae` / `pharmacy123` → Pharmacy View

API routes: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
Frontend: `AuthProvider` + `useAuth` in `artifacts/clinic-app/src/lib/auth.tsx`

## Internationalization (i18n)
Full EN/AR bilingual support with RTL layout.
- `artifacts/clinic-app/src/lib/i18n.tsx` — I18nProvider, useI18n hook, full translations
- Language toggle on login page and in sidebar footer
- RTL applied via `document.dir` + `dir` prop on Layout wrapper
- Language preference persisted in `localStorage` key `cf-lang`

## Role System
Three roles — set automatically from login, switchable via sidebar dropdown:
- **Doctor** — Full access: dashboard, patients, queue, consultations, prescriptions
- **Patient** — Limited: dashboard, appointments, prescriptions
- **Pharmacy** — Focused: dashboard (Rx/stock KPIs), pending Rx, stock

## Seed Data
Realistic UAE/MEA clinic data:
- 5 doctors (Cardiology, General Medicine, Orthopedics, Pediatrics, Dermatology)
- 6 patients with medical histories
- 8 medications (Panadol, Augmentin, Amlodipine, Metformin, etc.)
- 8 appointments for today (various statuses)
- 3 consultations with vitals and treatment plans
- 3 prescriptions with items
- 8 stock entries (4 low stock alerts)

## Codegen
```bash
pnpm --filter @workspace/api-spec run codegen
```
Generates Zod schemas into `lib/api-zod/src/generated/api.ts`.
`lib/api-zod/src/index.ts` must only contain: `export * from './generated/api';`

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (set by Replit)
- `SESSION_SECRET` — Session signing secret
- `PORT` — Assigned per artifact by Replit workflows
