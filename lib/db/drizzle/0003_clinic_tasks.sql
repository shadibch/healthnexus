CREATE TABLE IF NOT EXISTS "clinic_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_event_id" varchar(255) NOT NULL,
	"task_title" text NOT NULL,
	"requestor_role" varchar(32) NOT NULL,
	"department" varchar(32) NOT NULL,
	"priority" varchar(32) NOT NULL,
	"status" varchar(48) DEFAULT 'Open' NOT NULL,
	"patient_identifier" varchar(64),
	"assigned_person" varchar(255),
	"original_message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_tasks_external_event_id_unique" UNIQUE("external_event_id")
);
