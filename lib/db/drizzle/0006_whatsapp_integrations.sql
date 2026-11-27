-- Global, clinic-scoped service credentials and metadata-only audit trail.
CREATE TABLE IF NOT EXISTS public.whatsapp_integrations (
  id serial PRIMARY KEY NOT NULL,
  medical_center_id integer NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_prefix varchar(16) NOT NULL,
  revoked_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_by_user_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.whatsapp_audit_logs (
  id serial PRIMARY KEY NOT NULL,
  integration_id integer NOT NULL,
  medical_center_id integer NOT NULL,
  action varchar(48) NOT NULL,
  entity_type varchar(48) NOT NULL,
  entity_id integer,
  request_id varchar(255),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS whatsapp_audit_center_created_idx
  ON public.whatsapp_audit_logs USING btree (medical_center_id, created_at);
--> statement-breakpoint

-- Extend the existing conversation table instead of creating a duplicate model.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS channel text DEFAULT 'internal' NOT NULL;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS whatsapp_number text;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS language text;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS intent text;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS stage text;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS state jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS patient_id integer;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS related_appointment_id integer;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_message_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS conversations_whatsapp_number_uq
  ON public.conversations (whatsapp_number)
  WHERE channel = 'whatsapp' AND whatsapp_number IS NOT NULL;
--> statement-breakpoint

-- Tenant-local webhook event IDs make message de-duplication clinic-scoped.
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id serial PRIMARY KEY NOT NULL,
  message_id varchar(255) NOT NULL,
  conversation_id integer NOT NULL,
  received_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_webhook_events_message_id_uq
  ON public.whatsapp_webhook_events USING btree (message_id);
--> statement-breakpoint

-- Upgrade existing tenant schemas in place. Future schemas clone these public tables.
DO $$
DECLARE tenant_schema_name text;
BEGIN
  FOR tenant_schema_name IN
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name ~ '^tenant_clinic_id_[0-9]+$'
  LOOP
    EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS channel text DEFAULT ''internal'' NOT NULL', tenant_schema_name);
    EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS whatsapp_number text', tenant_schema_name);
    EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS language text', tenant_schema_name);
    EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS intent text', tenant_schema_name);
    EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS stage text', tenant_schema_name);
    EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS state jsonb DEFAULT ''{}''::jsonb NOT NULL', tenant_schema_name);
    EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS patient_id integer', tenant_schema_name);
    EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS related_appointment_id integer', tenant_schema_name);
    EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS last_message_at timestamp with time zone', tenant_schema_name);
    EXECUTE format('ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone', tenant_schema_name);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS conversations_whatsapp_number_uq ON %I.conversations (whatsapp_number) WHERE channel = ''whatsapp'' AND whatsapp_number IS NOT NULL', tenant_schema_name);
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.whatsapp_webhook_events (LIKE public.whatsapp_webhook_events INCLUDING ALL)', tenant_schema_name);
  END LOOP;
END $$;
--> statement-breakpoint
