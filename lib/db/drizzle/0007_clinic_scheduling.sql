-- Persist recurring hours, closures, leave, durations, and appointment history.
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS source text DEFAULT 'clinic' NOT NULL;
--> statement-breakpoint
ALTER TABLE public.clinic_settings ADD COLUMN IF NOT EXISTS time_zone text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.doctor_schedules (
  id serial PRIMARY KEY NOT NULL,
  doctor_id integer NOT NULL,
  day_of_week integer NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  slot_duration_minutes integer NOT NULL,
  effective_from text,
  effective_until text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS doctor_schedules_doctor_day_idx
  ON public.doctor_schedules USING btree (doctor_id, day_of_week);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.doctor_unavailable_periods (
  id serial PRIMARY KEY NOT NULL,
  doctor_id integer,
  kind varchar(32) NOT NULL,
  starts_at timestamp with time zone NOT NULL,
  ends_at timestamp with time zone NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS doctor_unavailable_periods_doctor_time_idx
  ON public.doctor_unavailable_periods USING btree (doctor_id, starts_at, ends_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.whatsapp_booking_requests (
  id serial PRIMARY KEY NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  appointment_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_booking_requests_key_uq
  ON public.whatsapp_booking_requests USING btree (idempotency_key);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.appointment_history (
  id serial PRIMARY KEY NOT NULL,
  appointment_id integer NOT NULL,
  action text NOT NULL,
  source text NOT NULL,
  previous_doctor_id integer,
  next_doctor_id integer,
  previous_scheduled_at timestamp with time zone,
  next_scheduled_at timestamp with time zone,
  actor_id integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Existing clinic schemas are upgraded. New schemas clone the current public definitions.
DO $$
DECLARE
  tenant_schema_name text;
  tenant_table_name text;
BEGIN
  FOR tenant_schema_name IN
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name ~ '^tenant_clinic_id_[0-9]+$'
  LOOP
    EXECUTE format('ALTER TABLE %I.appointments ADD COLUMN IF NOT EXISTS duration_minutes integer DEFAULT 30 NOT NULL', tenant_schema_name);
    EXECUTE format('ALTER TABLE %I.appointments ADD COLUMN IF NOT EXISTS source text DEFAULT ''clinic'' NOT NULL', tenant_schema_name);
    EXECUTE format('ALTER TABLE %I.clinic_settings ADD COLUMN IF NOT EXISTS time_zone text', tenant_schema_name);
    FOREACH tenant_table_name IN ARRAY ARRAY[
      'doctor_schedules', 'doctor_unavailable_periods', 'whatsapp_booking_requests', 'appointment_history'
    ] LOOP
      EXECUTE format('CREATE TABLE IF NOT EXISTS %I.%I (LIKE public.%I INCLUDING ALL)', tenant_schema_name, tenant_table_name, tenant_table_name);
    END LOOP;
  END LOOP;
END $$;
--> statement-breakpoint
