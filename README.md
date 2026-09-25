# HealthNexus (ClinicFlow) — Hospital & Clinic Management Platform

A full-stack clinic management platform targeting Middle East & Africa markets.
Bilingual-ready (Arabic/English with RTL) and mobile-friendly. It covers four
roles — **Doctor, Patient, Pharmacy, Receptionist** — with session-based auth and
full per-role data isolation.

**Live on Azure:** `https://waf2name-evhwdnc6hyh5a9f6.z03.azurefd.net`

---

## What's in this repo

| Path | What it is |
|---|---|
| `artifacts/clinic-app/` | React + Vite frontend (served from the API at `/`) |
| `artifacts/api-server/` | Express API server (routes at `/api`, serves the built client) |
| `lib/db/` | Drizzle ORM schema + `drizzle-kit push` config |
| `lib/api-*` | Shared OpenAPI/Zod schemas and React query hooks |
| `docker/` | Production Dockerfiles + boot script (`start-api.sh`) |
| `infra/` | Azure Bicep IaC + PowerShell deploy scripts |
| `infra/README.md` | **Azure deployment guide (Bicep, ACR, Container Apps, Front Door)** |
| `replit.md` | Full app reference: DB schema, API routes, demo users, frontend pages |

---

## Quick start (local development)

Requires **pnpm** (v10) and Node 22+. The `preinstall` script enforces pnpm.

```bash
pnpm install
```

### Option A — everything via Docker Compose (recommended)

```bash
# Copy the example env (never commit real secrets)
cp .env.example .env
# boot Postgres + apply schema + start the API (serves the compiled client too)
docker compose up --build
```

- API / app: `http://localhost:8080` (health check `/api/healthz`)
- Postgres exposed on `localhost:5433` (container port 5432)

`docker/start-api.sh` runs `drizzle-kit push` (idempotent schema sync) before
starting the server, so the schema shape comes from `lib/db` — the committed
`drizzle/` delta migrations are **not** re-run on a fresh database.

### Option B — run pieces natively

```bash
# terminal 1 — Postgres you already have running, then:
pnpm --filter @workspace/db push          # create/update schema
pnpm --filter @workspace/api-server dev   # API + compiled client on :8080

# terminal 2 — frontend hot-reload (optional dev server)
pnpm --filter @workspace/clinic-app dev   # Vite on :5173
```

---

## Environment variables

Copy `.env.example` → `.env` and fill in what you need. Most are optional.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `SESSION_SECRET` | production | Express session signing key |
| `API_PORT` / `PORT` | no | HTTP port (default 8080) |
| `APP_BASE_URL` | yes* | Public URL used in email verification / password-reset links |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | no | SMTP email sending |
| `RESEND_API_KEY` / `RESEND_FROM` | no | Resend HTTP email API (takes precedence over SMTP) |
| `HOSTINGER_MAIL_API_TOKEN` / `HOSTINGER_MAILBOX_ID` | no | Hostinger Mail API (takes precedence over Resend & SMTP) |
| `FEEDBACK_EMAIL` | no | Where customer feedback submissions go |
| `OPENAI_API_KEY` | no | Only needed for the AI Assistant feature (server starts without it) |

> **Security:** never commit real credentials. `.env` and `.env.bak` are
> git-ignored. Email provider values (`SMTP_PASS`, `RESEND_API_KEY`,
> `HOSTINGER_MAIL_API_TOKEN`, `HOSTINGER_MAILBOX_ID`) are blank in the committed
> `.env.example` — set them in your host's secret store (Render dashboard vars,
> Azure Container App env vars, etc.) instead.

---

## Demo users

| Email | Password | Role |
|---|---|---|
| doctor@clinicflow.ae | doctor123 | doctor |
| patient@clinicflow.ae | patient123 | patient |
| pharmacy@clinicflow.ae | pharmacy123 | pharmacy |
| reception@clinicflow.ae | reception123 | receptionist |

---

## Deploying to production

Three supported targets:

1. **Azure (current production)** — see **`infra/README.md`**. Bicep modules for
   a private Postgres Flexible Server (no public access), VNet + private
   endpoints, ACR, and Container Apps + Front Door/WAF. Deploy with
   `infra/scripts/deploy-infra.ps1` and `build-and-push.ps1`.
2. **Render** — `render.yaml` blueprint + the container Dockerfile. Push to
   GitHub, then in Render: *New + → Blueprint → pick this repo → Apply*. Set the
   `sync: false` env vars in the dashboard.
3. **GitHub Actions CI/CD (Azure)** — `.github/workflows/deploy-azure.yml` builds
   and pushes the Docker image to ACR and updates the Container App on every push
   to `main` (requires `AZURE_CREDENTIALS` + `ACR_NAME` + `RESOURCE_GROUP` +
   `CONTAINER_APP_NAME` secrets).

### The image boot sequence (applies everywhere)

```
pnpm --filter @workspace/db push   # idempotent schema sync
node dist/index.mjs                # Express server serving /api + the compiled client
```

---

## Documentation

- **App reference** (DB schema, API routes, frontend pages, auth):
  [`replit.md`](./replit.md)
- **Azure infrastructure & deployment (Bicep, ACR, Container Apps, Front Door):**
  [`infra/README.md`](./infra/README.md)