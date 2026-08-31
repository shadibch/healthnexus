ALTER TABLE "medical_centers" ADD COLUMN IF NOT EXISTS "schema_name" text;
--> statement-breakpoint
-- Backfill a deterministic schema name for any pre-existing centers so tenant
-- routing works before their next onboarding. tenant_clinic_id_<id> matches the
-- convention used at signup for new clinics.
UPDATE "medical_centers" SET "schema_name" = 'tenant_clinic_id_' || "id"
	WHERE "schema_name" IS NULL;
