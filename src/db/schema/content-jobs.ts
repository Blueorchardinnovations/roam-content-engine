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

import { sourceVersions } from './source-versions.js';

export const contentJobStatusEnum = pgEnum('content_job_status', [
  'queued',
  'processing',
  'retrying',
  'completed',
  'failed',
  'cancelled'
]);

export const contentJobStageEnum = pgEnum('content_job_stage', [
  'queued',
  'normalizing-transcript',
  'calculating-statistics',
  'completed',
  'failed'
]);

export const contentJobs = pgTable(
  'content_jobs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    sourceVersionId: text('source_version_id')
      .notNull()
      .references(() => sourceVersions.id),
    status: contentJobStatusEnum('status').notNull().default('queued'),
    currentStage: contentJobStageEnum('current_stage')
      .notNull()
      .default('queued'),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    result: jsonb('result'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    correlationId: text('correlation_id').notNull(),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', {
      withTimezone: true
    }),
    heartbeatAt: timestamp('heartbeat_at', {
      withTimezone: true
    }),
    nextAttemptAt: timestamp('next_attempt_at', {
      withTimezone: true
    }),
    createdAt: timestamp('created_at', {
      withTimezone: true
    })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', {
      withTimezone: true
    }),
    completedAt: timestamp('completed_at', {
      withTimezone: true
    }),
    updatedAt: timestamp('updated_at', {
      withTimezone: true
    })
      .notNull()
      .defaultNow()
  },
  (table) => [
    uniqueIndex('content_jobs_tenant_idempotency_key_unique').on(
      table.tenantId,
      table.idempotencyKey
    ),
    index('content_jobs_status_next_attempt_created_idx').on(
      table.status,
      table.nextAttemptAt,
      table.createdAt
    ),
    index('content_jobs_status_lease_expires_idx').on(
      table.status,
      table.leaseExpiresAt
    ),
    check(
      'content_jobs_attempt_count_non_negative_check',
      sql`${table.attemptCount} >= 0`
    )
  ]
);