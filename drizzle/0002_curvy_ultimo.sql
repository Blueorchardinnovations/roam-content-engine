CREATE TYPE "public"."publish_job_mode" AS ENUM('standard', 'cta-guide');--> statement-breakpoint
CREATE TYPE "public"."publish_job_stage" AS ENUM('queued', 'validating-source', 'submitting', 'waiting-for-remote', 'checking-remote-status', 'retrieving-download', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."publish_job_status" AS ENUM('queued', 'processing', 'waiting', 'retrying', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."publish_output_format" AS ENUM('html', 'pdf', 'epub');--> statement-breakpoint
CREATE TYPE "public"."publish_job_event_type" AS ENUM('publish-job-created', 'publish-job-claimed', 'publish-submitted', 'publish-status-polled', 'publish-waiting', 'publish-retry-scheduled', 'publish-completed', 'publish-failed', 'publish-cancelled', 'publish-lease-expired');--> statement-breakpoint
CREATE TABLE "publish_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"source_content_job_id" text NOT NULL,
	"source_render_artifact_id" text NOT NULL,
	"source_artifact_checksum_sha256" text NOT NULL,
	"source_artifact_byte_size" integer NOT NULL,
	"source_artifact_snapshot" jsonb NOT NULL,
	"publish_mode" "publish_job_mode" NOT NULL,
	"output_format" "publish_output_format" NOT NULL,
	"render_options" jsonb,
	"publication_metadata" jsonb,
	"status" "publish_job_status" DEFAULT 'queued' NOT NULL,
	"stage" "publish_job_stage" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"remote_submission_idempotency_key" text NOT NULL,
	"remote_job_id" text,
	"remote_state" text,
	"remote_correlation_id" text,
	"remote_error_code" text,
	"remote_error_message" text,
	"download_metadata" jsonb,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"consecutive_failure_count" integer DEFAULT 0 NOT NULL,
	"poll_count" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"next_poll_at" timestamp with time zone,
	"correlation_id" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publish_jobs_attempt_count_non_negative_check" CHECK ("publish_jobs"."attempt_count" >= 0),
	CONSTRAINT "publish_jobs_consecutive_failure_count_non_negative_check" CHECK ("publish_jobs"."consecutive_failure_count" >= 0),
	CONSTRAINT "publish_jobs_poll_count_non_negative_check" CHECK ("publish_jobs"."poll_count" >= 0),
	CONSTRAINT "publish_jobs_source_artifact_byte_size_positive_check" CHECK ("publish_jobs"."source_artifact_byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "publish_job_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"publish_job_id" text NOT NULL,
	"event_type" "publish_job_event_type" NOT NULL,
	"prior_status" "publish_job_status",
	"new_status" "publish_job_status",
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_source_content_job_id_content_jobs_id_fk" FOREIGN KEY ("source_content_job_id") REFERENCES "public"."content_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_job_events" ADD CONSTRAINT "publish_job_events_publish_job_id_publish_jobs_id_fk" FOREIGN KEY ("publish_job_id") REFERENCES "public"."publish_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "publish_jobs_tenant_idempotency_key_unique" ON "publish_jobs" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "publish_jobs_tenant_id_idx" ON "publish_jobs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "publish_jobs_source_content_job_id_idx" ON "publish_jobs" USING btree ("source_content_job_id");--> statement-breakpoint
CREATE INDEX "publish_jobs_due_idx" ON "publish_jobs" USING btree ("status","next_attempt_at","next_poll_at","created_at");--> statement-breakpoint
CREATE INDEX "publish_jobs_status_lease_expires_idx" ON "publish_jobs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "publish_job_events_lookup_idx" ON "publish_job_events" USING btree ("tenant_id","publish_job_id","created_at");