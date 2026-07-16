CREATE TYPE "public"."content_job_stage" AS ENUM('queued', 'normalizing-transcript', 'calculating-statistics', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."content_job_status" AS ENUM('queued', 'processing', 'retrying', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_event_type" AS ENUM('job-created', 'job-claimed', 'job-processing-started', 'job-completed', 'job-retry-scheduled', 'job-failed', 'job-cancelled');--> statement-breakpoint
CREATE TABLE "content_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"source_version_id" text NOT NULL,
	"status" "content_job_status" DEFAULT 'queued' NOT NULL,
	"current_stage" "content_job_stage" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error_code" text,
	"error_message" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_jobs_attempt_count_non_negative_check" CHECK ("content_jobs"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "source_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"content_hash" text NOT NULL,
	"transcript_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_versions_version_number_positive_check" CHECK ("source_versions"."version_number" > 0),
	CONSTRAINT "source_versions_transcript_not_empty_check" CHECK (length(trim("source_versions"."transcript_text")) > 0)
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"job_id" text NOT NULL,
	"event_type" "job_event_type" NOT NULL,
	"prior_status" "content_job_status",
	"new_status" "content_job_status",
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_jobs" ADD CONSTRAINT "content_jobs_source_version_id_source_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_content_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."content_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_jobs_tenant_idempotency_key_unique" ON "content_jobs" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "source_versions_tenant_project_version_unique" ON "source_versions" USING btree ("tenant_id","project_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "source_versions_tenant_project_hash_unique" ON "source_versions" USING btree ("tenant_id","project_id","content_hash");