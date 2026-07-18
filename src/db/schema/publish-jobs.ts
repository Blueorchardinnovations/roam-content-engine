import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';

import { contentJobs } from './content-jobs.js';

export const publishJobStatusEnum = pgEnum('publish_job_status', [
  'queued',
  'processing',
  'waiting',
  'retrying',
  'completed',
  'failed',
  'cancelled'
]);

export const publishJobStageEnum = pgEnum('publish_job_stage', [
  'queued',
  'validating-source',
  'submitting',
  'waiting-for-remote',
  'checking-remote-status',
  'retrieving-download',
  'completed',
  'failed',
  'cancelled'
]);

export const publishJobModeEnum = pgEnum('publish_job_mode', [
  'standard',
  'cta-guide'
]);

export const publishOutputFormatEnum = pgEnum('publish_output_format', [
  'html',
  'pdf',
  'epub'
]);

export const publishJobs = pgTable(
  'publish_jobs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    sourceContentJobId: text('source_content_job_id')
      .notNull()
      .references(() => contentJobs.id),
    sourceRenderArtifactId: text('source_render_artifact_id').notNull(),

    sourceArtifactChecksumSha256: text('source_artifact_checksum_sha256').notNull(),
    sourceArtifactByteSize: integer('source_artifact_byte_size').notNull(),
    sourceArtifactSnapshot: jsonb('source_artifact_snapshot').notNull(),

    publishMode: publishJobModeEnum('publish_mode').notNull(),
    outputFormat: publishOutputFormatEnum('output_format').notNull(),
    renderOptions: jsonb('render_options'),
    publicationMetadata: jsonb('publication_metadata'),

    status: publishJobStatusEnum('status').notNull().default('queued'),
    stage: publishJobStageEnum('stage').notNull().default('queued'),

    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    remoteSubmissionIdempotencyKey: text('remote_submission_idempotency_key').notNull(),

    remoteJobId: text('remote_job_id'),
    remoteState: text('remote_state'),
    remoteCorrelationId: text('remote_correlation_id'),
    remoteErrorCode: text('remote_error_code'),
    remoteErrorMessage: text('remote_error_message'),

    downloadMetadata: jsonb('download_metadata'),

    attemptCount: integer('attempt_count').notNull().default(0),
    consecutiveFailureCount: integer('consecutive_failure_count').notNull().default(0),
    pollCount: integer('poll_count').notNull().default(0),

    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),

    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    nextPollAt: timestamp('next_poll_at', { withTimezone: true }),

    correlationId: text('correlation_id').notNull(),

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex('publish_jobs_tenant_idempotency_key_unique').on(
      table.tenantId,
      table.idempotencyKey
    ),
    index('publish_jobs_tenant_id_idx').on(table.tenantId),
    index('publish_jobs_source_content_job_id_idx').on(table.sourceContentJobId),
    index('publish_jobs_due_idx').on(table.status, table.nextAttemptAt, table.nextPollAt, table.createdAt),
    index('publish_jobs_status_lease_expires_idx').on(table.status, table.leaseExpiresAt),
    check('publish_jobs_attempt_count_non_negative_check', sql`${table.attemptCount} >= 0`),
    check('publish_jobs_consecutive_failure_count_non_negative_check', sql`${table.consecutiveFailureCount} >= 0`),
    check('publish_jobs_poll_count_non_negative_check', sql`${table.pollCount} >= 0`),
    check('publish_jobs_source_artifact_byte_size_positive_check', sql`${table.sourceArtifactByteSize} > 0`)
  ]
);
