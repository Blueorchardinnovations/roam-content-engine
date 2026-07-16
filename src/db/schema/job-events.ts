import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp
} from 'drizzle-orm/pg-core';

import { contentJobs, contentJobStatusEnum } from './content-jobs.js';

export const jobEventTypeEnum = pgEnum('job_event_type', [
  'job-created',
  'job-claimed',
  'job-processing-started',
  'job-completed',
  'job-retry-scheduled',
  'job-failed',
  'job-cancelled'
]);

export const jobEvents = pgTable('job_events', {
  id: text('id').primaryKey(),

  tenantId: text('tenant_id').notNull(),

  jobId: text('job_id')
    .notNull()
    .references(() => contentJobs.id),

  eventType: jobEventTypeEnum('event_type').notNull(),

  priorStatus: contentJobStatusEnum('prior_status'),

  newStatus: contentJobStatusEnum('new_status'),

  details: jsonb('details'),

  createdAt: timestamp('created_at', {
    withTimezone: true
  })
    .notNull()
    .defaultNow()
});