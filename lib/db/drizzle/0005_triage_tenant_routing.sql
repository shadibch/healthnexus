CREATE TABLE IF NOT EXISTS public.triage_dispatches (
	external_event_id varchar(255) PRIMARY KEY NOT NULL,
	medical_center_id integer NOT NULL,
	requested_by_user_id integer NOT NULL,
	created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
DECLARE tenant_schema_name text;
BEGIN
	FOR tenant_schema_name IN
		SELECT schema_name
		FROM information_schema.schemata
		WHERE schema_name ~ '^tenant_clinic_id_[0-9]+$'
	LOOP
		EXECUTE format(
			'CREATE TABLE IF NOT EXISTS %I.clinic_tasks (LIKE public.clinic_tasks INCLUDING ALL)',
			tenant_schema_name
		);
	END LOOP;
END $$;
