import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp
} from 'drizzle-orm/pg-core';

import { publishJobs, publishJobStatusEnum } from './publish-jobs.js';

export const publishJobEventTypeEnum = pgEnum('publish_job_event_type', [
  'publish-job-created',
  'publish-job-claimed',
  'publish-submitted',
  'publish-status-polled',
  'publish-waiting',
  'publish-retry-scheduled',
  'publish-completed',
  'publish-failed',
  'publish-cancelled',
  'publish-lease-expired'
]);

export const publishJobEvents = pgTable(
  'publish_job_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    publishJobId: text('publish_job_id')
      .notNull()
      .references(() => publishJobs.id),
    eventType: publishJobEventTypeEnum('event_type').notNull(),
    priorStatus: publishJobStatusEnum('prior_status'),
    newStatus: publishJobStatusEnum('new_status'),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index('publish_job_events_lookup_idx').on(table.tenantId, table.publishJobId, table.createdAt)
  ]
);
