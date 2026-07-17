import {
  and,
  eq,
  inArray,
  sql,
  type SQL
} from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type * as schema from '../../db/schema/index.js';
import { contentJobs } from '../../db/schema/content-jobs.js';
import { jobEvents } from '../../db/schema/job-events.js';
import { sourceVersions } from '../../db/schema/source-versions.js';
import {
  assertTransitionAllowed,
  transcriptProcessingResultSchema,
  type ContentJob,
  type ContentJobId,
  type ContentJobStage,
  type ContentJobStatus,
  type CreateContentJobInput,
  type TenantId,
  type TranscriptProcessingResult
} from '../../domain/content-jobs/index.js';
import type { ContentJobRepository } from '../../domain/repositories/content-job-repository.js';
import {
  createContentJobId,
  createCorrelationId,
  createJobEventId,
  isPrefixedId
} from '../../platform/identity/ids/index.js';
import { computeRequestFingerprint } from '../../platform/security/fingerprinting/index.js';
import { ErrorCode } from '../../platform/shared/errors/codes.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from '../../platform/shared/errors/index.js';

import {
  ensureNonEmpty,
  isUniqueViolation,
  toDatabaseUnavailableError
} from './error-utils.js';

type ContentJobRow = typeof contentJobs.$inferSelect;
type Database = NodePgDatabase<typeof schema>;

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

function validateTenantAndJobIds(
  tenantId: TenantId,
  jobId: ContentJobId
): void {
  if (!isPrefixedId(tenantId, 'tenant')) {
    throw new ValidationError('Invalid tenant ID.', {
      tenantId
    });
  }

  if (!isPrefixedId(jobId, 'job')) {
    throw new ValidationError('Invalid content job ID.', {
      jobId
    });
  }
}

export class DrizzleContentJobRepository
  implements ContentJobRepository {
  public constructor(
    private readonly database: Database
  ) {}

  public async createOrGetIdempotent(
    input: CreateContentJobInput
  ): Promise<ContentJob> {
    if (!isPrefixedId(input.tenantId, 'tenant')) {
      throw new ValidationError('Invalid tenant ID.');
    }

    if (!isPrefixedId(input.projectId, 'project')) {
      throw new ValidationError('Invalid project ID.');
    }

    if (!isPrefixedId(input.sourceVersionId, 'srcver')) {
      throw new ValidationError('Invalid source version ID.');
    }

    if (
      input.correlationId !== undefined &&
      !isPrefixedId(input.correlationId, 'corr')
    ) {
      throw new ValidationError('Invalid correlation ID.');
    }

    const idempotencyKey = ensureNonEmpty(
      input.idempotencyKey,
      'idempotencyKey'
    );

    const requestFingerprint = computeRequestFingerprint({
      tenantId: input.tenantId,
      projectId: input.projectId,
      sourceVersionId: input.sourceVersionId,
      jobType: input.jobType,
      requestSchemaVersion: input.requestSchemaVersion
    });

    try {
      return await this.database.transaction(async (tx) => {
        const sourceVersion = await tx.query.sourceVersions.findFirst({
          where: and(
            eq(sourceVersions.id, input.sourceVersionId),
            eq(sourceVersions.tenantId, input.tenantId),
            eq(sourceVersions.projectId, input.projectId)
          )
        });

        if (!sourceVersion) {
          throw new NotFoundError(
            'Source version',
            input.sourceVersionId
          );
        }

        const existing = await tx.query.contentJobs.findFirst({
          where: and(
            eq(contentJobs.tenantId, input.tenantId),
            eq(contentJobs.idempotencyKey, idempotencyKey)
          )
        });

        if (existing) {
          if (existing.requestFingerprint !== requestFingerprint) {
            throw new ConflictError(
              ErrorCode.IDEMPOTENCY_KEY_REUSED,
              'Idempotency key was reused with a different request payload.',
              {
                idempotencyKey
              }
            );
          }

          return mapContentJob(existing);
        }

        const now = new Date();

        const inserted = await tx
          .insert(contentJobs)
          .values({
            id: createContentJobId(),
            tenantId: input.tenantId,
            projectId: input.projectId,
            sourceVersionId: input.sourceVersionId,
            status: 'queued',
            currentStage: 'queued',
            idempotencyKey,
            requestFingerprint,
            attemptCount: 0,
            result: null,
            errorCode: null,
            errorMessage: null,
            correlationId:
              input.correlationId ?? createCorrelationId(),
            createdAt: now,
            startedAt: null,
            completedAt: null,
            updatedAt: now
          })
          .returning();

        const created = inserted[0]!;

        await tx.insert(jobEvents).values({
          id: createJobEventId(),
          tenantId: input.tenantId,
          jobId: created.id,
          eventType: 'job-created',
          priorStatus: null,
          newStatus: created.status,
          details: {
            requestFingerprint,
            idempotencyKey
          },
          createdAt: now
        });

        return mapContentJob(created);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.getByIdempotencyKey(
          input.tenantId,
          idempotencyKey
        );

        if (existing) {
          if (existing.requestFingerprint !== requestFingerprint) {
            throw new ConflictError(
              ErrorCode.IDEMPOTENCY_KEY_REUSED,
              'Idempotency key was reused with a different request payload.',
              {
                idempotencyKey
              }
            );
          }

          return existing;
        }
      }

      throw toDatabaseUnavailableError(
        error,
        'Unable to create or read idempotent content job.'
      );
    }
  }

  public async getById(
    tenantId: TenantId,
    jobId: ContentJobId
  ): Promise<ContentJob | null> {
    validateTenantAndJobIds(tenantId, jobId);

    try {
      const row = await this.database.query.contentJobs.findFirst({
        where: and(
          eq(contentJobs.tenantId, tenantId),
          eq(contentJobs.id, jobId)
        )
      });

      return row ? mapContentJob(row) : null;
    } catch (error) {
      throw toDatabaseUnavailableError(
        error,
        'Unable to fetch content job by ID.'
      );
    }
  }

  public async getByIdempotencyKey(
    tenantId: TenantId,
    idempotencyKey: string
  ): Promise<ContentJob | null> {
    if (!isPrefixedId(tenantId, 'tenant')) {
      throw new ValidationError('Invalid tenant ID.', {
        tenantId
      });
    }

    const normalizedKey = ensureNonEmpty(
      idempotencyKey,
      'idempotencyKey'
    );

    try {
      const row = await this.database.query.contentJobs.findFirst({
        where: and(
          eq(contentJobs.tenantId, tenantId),
          eq(contentJobs.idempotencyKey, normalizedKey)
        )
      });

      return row ? mapContentJob(row) : null;
    } catch (error) {
      throw toDatabaseUnavailableError(
        error,
        'Unable to fetch content job by idempotency key.'
      );
    }
  }

  public async claim(
    tenantId: TenantId,
    jobId: ContentJobId
  ): Promise<ContentJob> {
    validateTenantAndJobIds(tenantId, jobId);

    try {
      return await this.database.transaction(async (tx) => {
        const currentRow = await tx.query.contentJobs.findFirst({
          where: and(
            eq(contentJobs.id, jobId),
            eq(contentJobs.tenantId, tenantId),
            inArray(contentJobs.status, ['queued', 'retrying'])
          )
        });

        if (!currentRow) {
          throw new ConflictError(
            ErrorCode.JOB_NOT_CLAIMABLE,
            'Job is not claimable.'
          );
        }

        const priorStatus = currentRow.status;

        const updated = await tx
          .update(contentJobs)
          .set({
            status: 'processing',
            currentStage: 'normalizing-transcript',
            startedAt:
              sql`coalesce(${contentJobs.startedAt}, now())` as SQL,
            attemptCount:
              sql`${contentJobs.attemptCount} + 1` as SQL,
            updatedAt: sql`now()` as SQL
          })
          .where(
            and(
              eq(contentJobs.id, jobId),
              eq(contentJobs.tenantId, tenantId),
              eq(contentJobs.status, priorStatus)
            )
          )
          .returning();

        if (updated.length === 0) {
          throw new ConflictError(
            ErrorCode.JOB_NOT_CLAIMABLE,
            'Job is not claimable.'
          );
        }

        const claimed = updated[0]!;

        await tx.insert(jobEvents).values({
          id: createJobEventId(),
          tenantId,
          jobId,
          eventType: 'job-claimed',
          priorStatus,
          newStatus: 'processing',
          details: {
            stage: 'normalizing-transcript'
          },
          createdAt: new Date()
        });

        return mapContentJob(claimed);
      });
    } catch (error) {
      throw toDatabaseUnavailableError(
        error,
        'Unable to claim content job.'
      );
    }
  }

  public async markStage(
    tenantId: TenantId,
    jobId: ContentJobId,
    stage: ContentJobStage
  ): Promise<ContentJob> {
    validateTenantAndJobIds(tenantId, jobId);

    try {
      const updated = await this.database
        .update(contentJobs)
        .set({
          currentStage: stage,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(contentJobs.id, jobId),
            eq(contentJobs.tenantId, tenantId),
            eq(contentJobs.status, 'processing')
          )
        )
        .returning();

      if (updated.length === 0) {
        throw new ConflictError(
          ErrorCode.INVALID_WORKFLOW_STATE,
          'Only processing jobs can update stage.'
        );
      }

      return mapContentJob(updated[0]!);
    } catch (error) {
      throw toDatabaseUnavailableError(
        error,
        'Unable to update content job stage.'
      );
    }
  }

  public async complete(
    tenantId: TenantId,
    jobId: ContentJobId,
    result: TranscriptProcessingResult
  ): Promise<ContentJob> {
    const parsed =
      transcriptProcessingResultSchema.safeParse(result);

    if (!parsed.success) {
      throw new ValidationError(
        'Invalid transcript processing result.',
        {
          issues: parsed.error.issues
        }
      );
    }

    return this.transitionWithEvent({
      tenantId,
      jobId,
      targetStatus: 'completed',
      targetStage: 'completed',
      eventType: 'job-completed',
      details: parsed.data,
      beforeUpdate: (job) => {
        if (job.sourceVersionId !== parsed.data.sourceVersionId) {
          throw new ConflictError(
            ErrorCode.TRANSCRIPT_HASH_MISMATCH,
            'Result source version does not match job source version.'
          );
        }
      },
      setValues: {
        result: parsed.data,
        completedAt: new Date(),
        errorCode: null,
        errorMessage: null
      }
    });
  }

  public async scheduleRetry(
    tenantId: TenantId,
    jobId: ContentJobId,
    errorCode: string,
    errorMessage: string
  ): Promise<ContentJob> {
    const safeCode = ensureNonEmpty(errorCode, 'errorCode');
    const safeMessage = ensureNonEmpty(
      errorMessage,
      'errorMessage'
    );

    return this.transitionWithEvent({
      tenantId,
      jobId,
      targetStatus: 'retrying',
      targetStage: 'failed',
      eventType: 'job-retry-scheduled',
      details: {
        errorCode: safeCode,
        errorMessage: safeMessage
      },
      setValues: {
        errorCode: safeCode,
        errorMessage: safeMessage,
        result: null,
        completedAt: null
      }
    });
  }

  public async fail(
    tenantId: TenantId,
    jobId: ContentJobId,
    errorCode: string,
    errorMessage: string
  ): Promise<ContentJob> {
    const safeCode = ensureNonEmpty(errorCode, 'errorCode');
    const safeMessage = ensureNonEmpty(
      errorMessage,
      'errorMessage'
    );

    return this.transitionWithEvent({
      tenantId,
      jobId,
      targetStatus: 'failed',
      targetStage: 'failed',
      eventType: 'job-failed',
      details: {
        errorCode: safeCode,
        errorMessage: safeMessage
      },
      setValues: {
        errorCode: safeCode,
        errorMessage: safeMessage,
        completedAt: new Date(),
        result: null
      }
    });
  }

  public async cancel(
    tenantId: TenantId,
    jobId: ContentJobId
  ): Promise<ContentJob> {
    return this.transitionWithEvent({
      tenantId,
      jobId,
      targetStatus: 'cancelled',
      targetStage: 'failed',
      eventType: 'job-cancelled',
      details: null,
      setValues: {
        completedAt: new Date(),
        result: null
      }
    });
  }

  private async transitionWithEvent(params: {
    readonly tenantId: TenantId;
    readonly jobId: ContentJobId;
    readonly targetStatus: ContentJobStatus;
    readonly targetStage: ContentJobStage;
    readonly eventType:
      typeof jobEvents.$inferInsert.eventType;
    readonly details:
      Readonly<Record<string, unknown>> | null;
    readonly setValues:
      Partial<typeof contentJobs.$inferInsert>;
    readonly beforeUpdate?: (job: ContentJob) => void;
  }): Promise<ContentJob> {
    validateTenantAndJobIds(
      params.tenantId,
      params.jobId
    );

    try {
      return await this.database.transaction(async (tx) => {
        const row = await tx.query.contentJobs.findFirst({
          where: and(
            eq(contentJobs.id, params.jobId),
            eq(contentJobs.tenantId, params.tenantId)
          )
        });

        if (!row) {
          throw new NotFoundError(
            'Content job',
            params.jobId
          );
        }

        const current = mapContentJob(row);

        params.beforeUpdate?.(current);
        assertTransitionAllowed(
          current.status,
          params.targetStatus
        );

        const updatedRows = await tx
          .update(contentJobs)
          .set({
            ...params.setValues,
            status: params.targetStatus,
            currentStage: params.targetStage,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(contentJobs.id, params.jobId),
              eq(contentJobs.tenantId, params.tenantId),
              eq(contentJobs.status, current.status)
            )
          )
          .returning();

        if (updatedRows.length === 0) {
          throw new ConflictError(
            ErrorCode.INVALID_WORKFLOW_STATE,
            'Job state changed concurrently; transition aborted.'
          );
        }

        const updated = updatedRows[0]!;

        await tx.insert(jobEvents).values({
          id: createJobEventId(),
          tenantId: params.tenantId,
          jobId: params.jobId,
          eventType: params.eventType,
          priorStatus: current.status,
          newStatus: params.targetStatus,
          details: params.details,
          createdAt: new Date()
        });

        return mapContentJob(updated);
      });
    } catch (error) {
      throw toDatabaseUnavailableError(
        error,
        'Unable to transition content job.'
      );
    }
  }
}