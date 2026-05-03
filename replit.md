# ClinicFlow — Hospital & Clinic Management Platform

## Overview
A full-stack clinic management platform targeting Middle East & Africa markets. Bilingual-ready (Arabic/English with RTL), mobile-friendly, covering three roles: Doctor, Patient, and Pharmacy. All API routes require authentication. Each role sees only their own data (full isolation).

## Architecture

### Monorepo Structure
- `artifacts/clinic-app/` — React + Vite frontend (port via $PORT, preview at `/`)
- `artifacts/api-server/` — Express API server (port 8080, paths at `/api`)
- `lib/api-spec/` — OpenAPI spec + Orval codegen config
- `lib/api-zod/` — Generated Zod schemas and React Query hooks
- `lib/db/` — Drizzle ORM schema + PostgreSQL migrations

### Tech Stack
- **Frontend**: React 18, Vite, Tailwind CSS v4, shadcn/ui, Wouter routing, TanStack Query
- **Backend**: Express, Drizzle ORM, Zod validation, Pino logging
- **Database**: PostgreSQL (via DATABASE_URL)
- **Theme**: Emerald/teal healthcare theme, light + dark mode

## Database Schema
Tables: `patients`, `doctors`, `appointments`, `consultations`, `prescriptions`, `prescription_items`, `medications`, `stock`, `medical_orders`, `encounter_activities`

### Key Schema Details
- `consultations`: includes `parentConsultationId` (for follow-up linking) and `encounterType` (initial | follow_up | emergency)
- `medical_orders`: type (lab|xray|ct|mri|ultrasound|ecg|other), priority (stat|urgent|routine), status (ordered|in_progress|completed|cancelled), resultData, resultNotes
- `encounter_activities`: HAAD/CPT coded activities per encounter — activityCode, description, category, quantity, unitPrice (AED), total

## Authentication & Role Isolation
Session-based auth via `express-session` + `SESSION_SECRET` env var.

### Demo Users (mapped to real DB records)
| Email | Password | Role | DB ID |
|---|---|---|---|
| doctor@clinicflow.ae | doctor123 | doctor | doctorDbId=1 |
| patient@clinicflow.ae | patient123 | patient | patientDbId=1 |
| pharmacy@clinicflow.ae | pharmacy123 | pharmacy | — |

### Auth Middleware
- `artifacts/api-server/src/lib/session.ts` — `getSessionUser()`, `requireAuth()`, `requireRole()`
- All routes require `requireAuth` middleware — unauthenticated → 401
- **Doctor**: sees only their own queue/appointments/consultations/prescriptions (filtered by `doctorDbId`)
- **Patient**: sees only their own data (filtered by `patientDbId`); cannot create appointments or modify records
- **Pharmacy**: sees all prescriptions (pending/dispensed), manages stock

## API Routes (all prefixed `/api`, all require auth)

### Auth
- `POST /auth/login` — returns user + role + doctorDbId/patientDbId
- `POST /auth/logout`
- `GET /auth/me`

### Patients
- `GET/POST /patients` — list (role-filtered) + create
- `GET/PATCH/DELETE /patients/:id`
- `GET /patients/:id/history` — full patient history (appointments, consultations, prescriptions)
- `GET /patients/:id/encounters` — **last 3 encounters with orders** (for encounter history sidebar)

### Doctors
- `GET/POST /doctors` — list + create doctors
- `GET/PATCH/DELETE /doctors/:id`
- `GET /doctors/:id/schedule` — today's schedule

### Appointments
- `GET /appointments/today` — today's summary (role-filtered)
- `GET/POST /appointments` — list + create
- `GET/PATCH/DELETE /appointments/:id`

### Queue
- `GET /queue` — today's live queue (doctor sees only their own)
- `POST /queue/:appointmentId/advance` — advance queue status

### Consultations / Encounters
- `GET/POST /consultations` — list + create (POST auto-detects 7-day follow-up)
- `GET/PATCH /consultations/:id` — includes orders in GET response
- `GET /consultations/:id/orders` — list orders for encounter
- `POST /consultations/:id/orders` — create medical order (doctor only)

### Medical Orders
- `PATCH /orders/:id` — update order (add result data, change status)
- `DELETE /orders/:id` — cancel order (sets status=cancelled)

### HAAD / CPT Activities
- `GET /activities/catalogue` — searchable HAAD/CPT code library (100+ codes, filters by category + keyword)
- `GET /consultations/:id/activities` — list activities for an encounter
- `POST /consultations/:id/activities` — add coded activity (doctor only)
- `PATCH /activities/:id` — update quantity
- `DELETE /activities/:id` — remove activity

Activity catalogue covers 6 categories: `consultation` (E&M codes 99201–99245), `procedure` (ECG, spirometry, IV, wound repair…), `laboratory` (CBC, CMP, HbA1c, lipids, cultures, tumour markers…), `radiology` (X-ray, CT, MRI, ultrasound, duplex…), `nursing`, `physiotherapy`. Prices in AED per HAAD fee schedule.

### Prescriptions
- `GET/POST /prescriptions` — list + create (with items)
- `GET/PATCH /prescriptions/:id` — includes dispense workflow

### Medications & Stock
- `GET/POST /medications`, `GET/PATCH /medications/:id`
- `GET/POST /stock`, `GET /stock/alerts`, `PATCH /stock/:id`

### Dashboard
- `GET /dashboard/stats` — role-filtered KPIs
- `GET /dashboard/activity` — role-filtered recent activity feed

## Frontend Pages
- `/` — Dashboard (role-filtered stats, bar chart, activity feed)
- `/patients` — Patient list + search + registration + history sidebar (doctor only)
- `/queue` — Live queue with advance + **"Open Encounter"** button (doctor only)
- `/encounter/:appointmentId` — **Full encounter workflow page** (doctor only)
  - Vitals, chief complaint, diagnosis, treatment plan, follow-up date
  - Medical orders section (add lab/xray/ct/mri/ultrasound/ecg; enter results)
  - **HAAD/CPT Activities panel** — searchable coded activity catalogue, quantity control, AED pricing, running total claim
  - Patient history panel (last 3 encounters with orders)
  - Create / save / complete encounter
  - 7-day follow-up auto-detection shown as badge
- `/consultations` — Encounter records with encounter type badges + inline orders
- `/prescriptions` — Prescriptions list + pharmacy dispense workflow
- `/stock` — Pharmacy stock management with low-stock alerts
- `/appointments` — Appointment list (patient role view)

## Key Implementation Details
- Role switcher removed from Layout — role is locked to login credentials
- Follow-up detection: POST /consultations checks if patient had a consultation in last 7 days; if yes, sets encounterType="follow_up" and links parentConsultationId automatically
- Encounter page fetches appointment → patient → existing consultation → orders + past encounters all in parallel
- Medical orders auto-timestamp on creation; completion sets completedAt
- `date-fns` used for relative time display
