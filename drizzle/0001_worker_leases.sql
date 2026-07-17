ALTER TYPE "public"."job_event_type" ADD VALUE IF NOT EXISTS 'job-lease-acquired';--> statement-breakpoint
ALTER TYPE "public"."job_event_type" ADD VALUE IF NOT EXISTS 'job-lease-expired';--> statement-breakpoint

ALTER TABLE "content_jobs"
ADD COLUMN IF NOT EXISTS "lease_owner" text;--> statement-breakpoint
ALTER TABLE "content_jobs"
ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_jobs"
ADD COLUMN IF NOT EXISTS "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_jobs"
ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "content_jobs_status_next_attempt_created_idx"
ON "content_jobs" USING btree ("status", "next_attempt_at", "created_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "content_jobs_status_lease_expires_idx"
ON "content_jobs" USING btree ("status", "lease_expires_at");
