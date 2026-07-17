import type { PrefixedId } from '../../platform/identity/ids/index.js';

import type { ContentJobStatus } from '../content-jobs/types.js';

export const jobEventTypes = [
  'job-created',
  'job-claimed',
  'job-processing-started',
  'job-completed',
  'job-retry-scheduled',
  'job-failed',
  'job-cancelled'
] as const;

export type JobEventType = (typeof jobEventTypes)[number];

export type JobEvent = {
  readonly id: PrefixedId<'evt'>;
  readonly tenantId: PrefixedId<'tenant'>;
  readonly jobId: PrefixedId<'job'>;
  readonly eventType: JobEventType;
  readonly priorStatus: ContentJobStatus | null;
  readonly newStatus: ContentJobStatus | null;
  readonly details: Readonly<Record<string, unknown>> | null;
  readonly createdAt: Date;
};

export type CreateJobEventInput = {
  readonly id: PrefixedId<'evt'>;
  readonly tenantId: PrefixedId<'tenant'>;
  readonly jobId: PrefixedId<'job'>;
  readonly eventType: JobEventType;
  readonly priorStatus: ContentJobStatus | null;
  readonly newStatus: ContentJobStatus | null;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly createdAt?: Date;
};
