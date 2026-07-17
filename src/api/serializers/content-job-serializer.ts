import type { ContentJob } from '../../domain/content-jobs/types.js';
import type { JobEvent } from '../../domain/job-events/types.js';

export type ContentJobDto = {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly sourceVersionId: string;
  readonly status: string;
  readonly currentStage: string;
  readonly attemptCount: number;
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly updatedAt: string;
};

export type JobEventDto = {
  readonly id: string;
  readonly jobId: string;
  readonly eventType: string;
  readonly priorStatus: string | null;
  readonly newStatus: string | null;
  readonly details: Readonly<Record<string, unknown>> | null;
  readonly createdAt: string;
};

export function toContentJobDto(job: ContentJob): ContentJobDto {
  return {
    id: job.id,
    tenantId: job.tenantId,
    projectId: job.projectId,
    sourceVersionId: job.sourceVersionId,
    status: job.status,
    currentStage: job.currentStage,
    attemptCount: job.attemptCount,
    result: (job.result as Readonly<Record<string, unknown>> | null) ?? null,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    correlationId: job.correlationId,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    updatedAt: job.updatedAt.toISOString()
  };
}

export function toJobEventDto(event: JobEvent): JobEventDto {
  return {
    id: event.id,
    jobId: event.jobId,
    eventType: event.eventType,
    priorStatus: event.priorStatus,
    newStatus: event.newStatus,
    details: event.details,
    createdAt: event.createdAt.toISOString()
  };
}
