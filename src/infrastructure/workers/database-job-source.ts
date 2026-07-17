import {
  and,
  eq,
  gt,
  lte,
  sql
} from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type * as schema from '../../db/schema/index.js';
import { contentJobs } from '../../db/schema/content-jobs.js';
import { jobEvents } from '../../db/schema/job-events.js';
import {
  transcriptProcessingResultSchema,
  type ContentJob,
  type ContentJobId,
  type ContentJobStatus
} from '../../domain/content-jobs/index.js';
import type { WorkerJobSource, WorkerLeasedJob } from '../../domain/workers/worker-types.js';
import { createJobEventId } from '../../platform/identity/ids/index.js';
import { ErrorCode } from '../../platform/shared/errors/codes.js';
import { ConflictError, ValidationError } from '../../platform/shared/errors/index.js';
import { toDatabaseUnavailableError } from '../repositories/error-utils.js';

type Database = NodePgDatabase<typeof schema>;
type ContentJobRow = typeof contentJobs.$inferSelect;

type CandidateRow = {
  id: string;
  status: ContentJobStatus;
};

function mapContentJob(row: ContentJobRow): ContentJob {
  const parsedResult = row.result
    ? transcriptProcessingResultSchema.safeParse(row.result)
    : { success: true as const, data: null };

  if (!parsedResult.success) {
    throw new ValidationError('Stored job result has invalid schema.', {
      jobId: row.id,
      issues: parsedResult.error.issues
    });
  }

  return {
    id: row.id as ContentJobId,
    tenantId: row.tenantId as ContentJob['tenantId'],
    projectId: row.projectId as ContentJob['projectId'],
    sourceVersionId: row.sourceVersionId as ContentJob['sourceVersionId'],
    status: row.status,
    currentStage: row.currentStage,
    idempotencyKey: row.idempotencyKey,
    requestFingerprint: row.requestFingerprint,
    attemptCount: row.attemptCount,
    result: parsedResult.data,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    correlationId: row.correlationId as ContentJob['correlationId'],
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt
  };
}

function mapWorkerLeasedJob(row: ContentJobRow): WorkerLeasedJob {
  if (!row.leaseOwner || !row.leaseExpiresAt || !row.heartbeatAt) {
    throw new ConflictError(
      ErrorCode.INVALID_WORKFLOW_STATE,
      'Leased job row is missing lease metadata.'
    );
  }

  const base = mapContentJob(row);

  return {
    ...base,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    heartbeatAt: row.heartbeatAt,
    nextAttemptAt: row.nextAttemptAt
  };
}

export class DatabaseJobSource implements WorkerJobSource {
  public constructor(
    private readonly database: Database
  ) {}

  public async acquireNext(input: {
    workerId: string;
    leaseDurationMs: number;
    now: Date;
  }): Promise<WorkerLeasedJob | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const candidateQuery = await tx.execute(
          sql<CandidateRow>`
            select id, status
            from content_jobs
            where (
              status = 'queued'
              or (
                status = 'retrying'
                and next_attempt_at is not null
                and next_attempt_at <= ${input.now}
              )
            )
            and (lease_expires_at is null or lease_expires_at <= ${input.now})
            order by created_at asc
            for update skip locked
            limit 1
          `
        );

        const candidate = candidateQuery.rows[0];

        if (!candidate) {
          return null;
        }

        const candidateId = candidate.id as ContentJobId;
        const candidateStatus = candidate.status as ContentJobStatus;

        const updatedRows = await tx
          .update(contentJobs)
          .set({
            status: 'processing',
            currentStage: 'normalizing-transcript',
            attemptCount: sql`${contentJobs.attemptCount} + 1`,
            startedAt: sql`coalesce(${contentJobs.startedAt}, ${input.now})`,
            leaseOwner: input.workerId,
            leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
            heartbeatAt: input.now,
            updatedAt: input.now
          })
          .where(
            and(
              eq(contentJobs.id, candidateId),
              eq(contentJobs.status, candidateStatus)
            )
          )
          .returning();

        const updated = updatedRows[0];

        if (!updated) {
          return null;
        }

        const leaseAcquiredEvent: typeof jobEvents.$inferInsert = {
          id: createJobEventId(),
          tenantId: updated.tenantId,
          jobId: updated.id,
          eventType: 'job-lease-acquired',
          priorStatus: candidateStatus,
          newStatus: 'processing',
          details: {
            workerId: input.workerId,
            attemptCount: updated.attemptCount
          },
          createdAt: input.now
        };

        await tx.insert(jobEvents).values(leaseAcquiredEvent);

        return mapWorkerLeasedJob(updated);
      });
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to acquire next job.');
    }
  }

  public async renewLease(input: {
    tenantId: ContentJob['tenantId'];
    jobId: ContentJob['id'];
    workerId: string;
    leaseDurationMs: number;
    now: Date;
  }): Promise<WorkerLeasedJob | null> {
    try {
      const rows = await this.database
        .update(contentJobs)
        .set({
          leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
          heartbeatAt: input.now,
          updatedAt: input.now
        })
        .where(
          and(
            eq(contentJobs.id, input.jobId),
            eq(contentJobs.tenantId, input.tenantId),
            eq(contentJobs.status, 'processing'),
            eq(contentJobs.leaseOwner, input.workerId),
            gt(contentJobs.leaseExpiresAt, input.now)
          )
        )
        .returning();

      const renewed = rows[0];
      return renewed ? mapWorkerLeasedJob(renewed) : null;
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to renew job lease.');
    }
  }

  public async markStage(input: {
    tenantId: ContentJob['tenantId'];
    jobId: ContentJob['id'];
    workerId: string;
    stage: ContentJob['currentStage'];
    now: Date;
  }): Promise<WorkerLeasedJob | null> {
    try {
      const rows = await this.database
        .update(contentJobs)
        .set({
          currentStage: input.stage,
          updatedAt: input.now
        })
        .where(
          and(
            eq(contentJobs.id, input.jobId),
            eq(contentJobs.tenantId, input.tenantId),
            eq(contentJobs.status, 'processing'),
            eq(contentJobs.leaseOwner, input.workerId),
            gt(contentJobs.leaseExpiresAt, input.now)
          )
        )
        .returning();

      const updated = rows[0];
      return updated ? mapWorkerLeasedJob(updated) : null;
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to update job stage.');
    }
  }

  public async markCompleted(input: {
    tenantId: ContentJob['tenantId'];
    jobId: ContentJob['id'];
    workerId: string;
    result: ContentJob['result'];
    now: Date;
  }): Promise<ContentJob | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const updatedRows = await tx
          .update(contentJobs)
          .set({
            status: 'completed',
            currentStage: 'completed',
            result: input.result,
            completedAt: input.now,
            errorCode: null,
            errorMessage: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            nextAttemptAt: null,
            updatedAt: input.now
          })
          .where(
            and(
              eq(contentJobs.id, input.jobId),
              eq(contentJobs.tenantId, input.tenantId),
              eq(contentJobs.status, 'processing'),
              eq(contentJobs.leaseOwner, input.workerId),
              gt(contentJobs.leaseExpiresAt, input.now)
            )
          )
          .returning();

        const updated = updatedRows[0];

        if (!updated) {
          return null;
        }

        await tx.insert(jobEvents).values({
          id: createJobEventId(),
          tenantId: input.tenantId,
          jobId: input.jobId,
          eventType: 'job-completed',
          priorStatus: 'processing',
          newStatus: 'completed',
          details: {
            workerId: input.workerId,
            attemptCount: updated.attemptCount
          },
          createdAt: input.now
        });

        return mapContentJob(updated);
      });
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to mark job completed.');
    }
  }

  public async scheduleRetry(input: {
    tenantId: ContentJob['tenantId'];
    jobId: ContentJob['id'];
    workerId: string;
    errorCode: string;
    errorMessage: string;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<ContentJob | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const updatedRows = await tx
          .update(contentJobs)
          .set({
            status: 'retrying',
            currentStage: 'failed',
            errorCode: input.errorCode,
            errorMessage: input.errorMessage,
            result: null,
            completedAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            nextAttemptAt: input.nextAttemptAt,
            updatedAt: input.now
          })
          .where(
            and(
              eq(contentJobs.id, input.jobId),
              eq(contentJobs.tenantId, input.tenantId),
              eq(contentJobs.status, 'processing'),
              eq(contentJobs.leaseOwner, input.workerId),
              gt(contentJobs.leaseExpiresAt, input.now)
            )
          )
          .returning();

        const updated = updatedRows[0];

        if (!updated) {
          return null;
        }

        await tx.insert(jobEvents).values({
          id: createJobEventId(),
          tenantId: input.tenantId,
          jobId: input.jobId,
          eventType: 'job-retry-scheduled',
          priorStatus: 'processing',
          newStatus: 'retrying',
          details: {
            workerId: input.workerId,
            attemptCount: updated.attemptCount,
            errorCode: input.errorCode,
            nextAttemptAt: input.nextAttemptAt.toISOString()
          },
          createdAt: input.now
        });

        return mapContentJob(updated);
      });
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to schedule job retry.');
    }
  }

  public async markFailed(input: {
    tenantId: ContentJob['tenantId'];
    jobId: ContentJob['id'];
    workerId: string;
    errorCode: string;
    errorMessage: string;
    now: Date;
  }): Promise<ContentJob | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const updatedRows = await tx
          .update(contentJobs)
          .set({
            status: 'failed',
            currentStage: 'failed',
            errorCode: input.errorCode,
            errorMessage: input.errorMessage,
            result: null,
            completedAt: input.now,
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            nextAttemptAt: null,
            updatedAt: input.now
          })
          .where(
            and(
              eq(contentJobs.id, input.jobId),
              eq(contentJobs.tenantId, input.tenantId),
              eq(contentJobs.status, 'processing'),
              eq(contentJobs.leaseOwner, input.workerId),
              gt(contentJobs.leaseExpiresAt, input.now)
            )
          )
          .returning();

        const updated = updatedRows[0];

        if (!updated) {
          return null;
        }

        await tx.insert(jobEvents).values({
          id: createJobEventId(),
          tenantId: input.tenantId,
          jobId: input.jobId,
          eventType: 'job-failed',
          priorStatus: 'processing',
          newStatus: 'failed',
          details: {
            workerId: input.workerId,
            attemptCount: updated.attemptCount,
            errorCode: input.errorCode
          },
          createdAt: input.now
        });

        return mapContentJob(updated);
      });
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to mark job failed.');
    }
  }

  public async listStaleProcessingJobs(input: {
    now: Date;
    limit: number;
  }): Promise<readonly WorkerLeasedJob[]> {
    try {
      const rows = await this.database
        .select()
        .from(contentJobs)
        .where(
          and(
            eq(contentJobs.status, 'processing'),
            lte(contentJobs.leaseExpiresAt, input.now)
          )
        )
        .orderBy(contentJobs.leaseExpiresAt)
        .limit(input.limit);

      return rows
        .filter((row): row is ContentJobRow => row.leaseExpiresAt !== null)
        .map(mapWorkerLeasedJob);
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to list stale processing jobs.');
    }
  }

  public async recoverStaleJob(input: {
    tenantId: ContentJob['tenantId'];
    jobId: ContentJob['id'];
    maxAttempts: number;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<ContentJob | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const staleRows = await tx
          .select()
          .from(contentJobs)
          .where(
            and(
              eq(contentJobs.id, input.jobId),
              eq(contentJobs.tenantId, input.tenantId),
              eq(contentJobs.status, 'processing'),
              lte(contentJobs.leaseExpiresAt, input.now)
            )
          )
          .limit(1);

        const stale = staleRows[0];

        if (!stale) {
          return null;
        }

        const exhausted = stale.attemptCount >= input.maxAttempts;

        const updatedRows = await tx
          .update(contentJobs)
          .set(
            exhausted
              ? {
                  status: 'failed',
                  currentStage: 'failed',
                  errorCode: ErrorCode.WORKER_MAX_ATTEMPTS_EXCEEDED,
                  errorMessage: 'Job exceeded max worker attempts after lease expiration.',
                  completedAt: input.now,
                  leaseOwner: null,
                  leaseExpiresAt: null,
                  heartbeatAt: null,
                  nextAttemptAt: null,
                  updatedAt: input.now
                }
              : {
                  status: 'retrying',
                  currentStage: 'failed',
                  errorCode: ErrorCode.WORKER_LEASE_EXPIRED,
                  errorMessage: 'Job lease expired while processing.',
                  completedAt: null,
                  leaseOwner: null,
                  leaseExpiresAt: null,
                  heartbeatAt: null,
                  nextAttemptAt: input.nextAttemptAt,
                  updatedAt: input.now
                }
          )
          .where(
            and(
              eq(contentJobs.id, input.jobId),
              eq(contentJobs.tenantId, input.tenantId),
              eq(contentJobs.status, 'processing'),
              lte(contentJobs.leaseExpiresAt, input.now)
            )
          )
          .returning();

        const updated = updatedRows[0];

        if (!updated) {
          return null;
        }

        await tx.insert(jobEvents).values({
          id: createJobEventId(),
          tenantId: input.tenantId,
          jobId: input.jobId,
          eventType: 'job-lease-expired',
          priorStatus: 'processing',
          newStatus: exhausted ? 'failed' : 'retrying',
          details: {
            attemptCount: updated.attemptCount,
            nextAttemptAt: exhausted ? null : input.nextAttemptAt.toISOString()
          },
          createdAt: input.now
        });

        return mapContentJob(updated);
      });
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to recover stale processing job.');
    }
  }
}
