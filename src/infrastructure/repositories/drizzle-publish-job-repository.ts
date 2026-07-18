import { and, asc, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type * as schema from '../../db/schema/index.js';
import { contentJobs } from '../../db/schema/content-jobs.js';
import { publishJobEvents } from '../../db/schema/publish-job-events.js';
import {
  publishJobs,
  publishJobStatusEnum,
  publishJobStageEnum,
  publishJobModeEnum,
  publishOutputFormatEnum
} from '../../db/schema/publish-jobs.js';
import type {
  CreatePublishJobInput,
  PublishJob,
  PublishJobEvent,
  PublishJobId,
  PublishJobStatus,
  PublishJobStage,
  TenantId
} from '../../domain/publish-jobs/types.js';
import type { PublishJobRepository } from '../../domain/repositories/publish-job-repository.js';
import {
  createPublishJobEventId,
  createPublishJobId,
  isPrefixedId
} from '../../platform/identity/ids/index.js';
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

type Database = NodePgDatabase<typeof schema>;
type PublishJobRow = typeof publishJobs.$inferSelect;
type PublishJobEventRow = typeof publishJobEvents.$inferSelect;

function assertKnownStatus(value: string): PublishJobStatus {
  if ((publishJobStatusEnum.enumValues as readonly string[]).includes(value)) {
    return value as PublishJobStatus;
  }

  throw new ValidationError('Stored publish job status is invalid.', { value });
}

function assertKnownStage(value: string): PublishJobStage {
  if ((publishJobStageEnum.enumValues as readonly string[]).includes(value)) {
    return value as PublishJobStage;
  }

  throw new ValidationError('Stored publish job stage is invalid.', { value });
}

function mapPublishJob(row: PublishJobRow): PublishJob {
  return {
    id: row.id as PublishJobId,
    tenantId: row.tenantId as TenantId,
    projectId: row.projectId as PublishJob['projectId'],
    sourceContentJobId: row.sourceContentJobId as PublishJob['sourceContentJobId'],
    sourceRenderArtifactId: row.sourceRenderArtifactId,
    sourceArtifactChecksumSha256: row.sourceArtifactChecksumSha256,
    sourceArtifactByteSize: row.sourceArtifactByteSize,
    sourceArtifactSnapshot: row.sourceArtifactSnapshot as PublishJob['sourceArtifactSnapshot'],
    publishMode: row.publishMode,
    outputFormat: row.outputFormat,
    renderOptions: (row.renderOptions ?? null) as PublishJob['renderOptions'],
    publicationMetadata: (row.publicationMetadata ?? null) as PublishJob['publicationMetadata'],
    status: assertKnownStatus(row.status),
    stage: assertKnownStage(row.stage),
    idempotencyKey: row.idempotencyKey,
    requestFingerprint: row.requestFingerprint,
    remoteSubmissionIdempotencyKey: row.remoteSubmissionIdempotencyKey,
    remoteJobId: row.remoteJobId,
    remoteState: row.remoteState,
    remoteCorrelationId: row.remoteCorrelationId,
    remoteErrorCode: row.remoteErrorCode,
    remoteErrorMessage: row.remoteErrorMessage,
    downloadMetadata: (row.downloadMetadata ?? null) as PublishJob['downloadMetadata'],
    attemptCount: row.attemptCount,
    consecutiveFailureCount: row.consecutiveFailureCount,
    pollCount: row.pollCount,
    correlationId: row.correlationId as PublishJob['correlationId'],
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    heartbeatAt: row.heartbeatAt,
    nextAttemptAt: row.nextAttemptAt,
    nextPollAt: row.nextPollAt,
    submittedAt: row.submittedAt,
    lastPolledAt: row.lastPolledAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapPublishJobEvent(row: PublishJobEventRow): PublishJobEvent {
  return {
    id: row.id as PublishJobEvent['id'],
    tenantId: row.tenantId as TenantId,
    publishJobId: row.publishJobId as PublishJobId,
    eventType: row.eventType,
    priorStatus: row.priorStatus,
    newStatus: row.newStatus,
    details: (row.details as Readonly<Record<string, unknown>> | null) ?? null,
    createdAt: row.createdAt
  };
}

function validateTenantId(tenantId: TenantId): void {
  if (!isPrefixedId(tenantId, 'tenant')) {
    throw new ValidationError('Invalid tenant ID.');
  }
}

export class DrizzlePublishJobRepository implements PublishJobRepository {
  public constructor(private readonly database: Database) {}

  public async createOrGetIdempotent(input: CreatePublishJobInput): Promise<PublishJob> {
    validateTenantId(input.tenantId);

    const idempotencyKey = ensureNonEmpty(input.idempotencyKey, 'idempotencyKey');
    const requestFingerprint = ensureNonEmpty(input.requestFingerprint, 'requestFingerprint');

    try {
      return await this.database.transaction(async (tx) => {
        const sourceJob = await tx.query.contentJobs.findFirst({
          where: and(
            eq(contentJobs.id, input.sourceContentJobId),
            eq(contentJobs.tenantId, input.tenantId),
            eq(contentJobs.projectId, input.projectId)
          )
        });

        if (!sourceJob) {
          throw new NotFoundError('Source content job', input.sourceContentJobId);
        }

        const existing = await tx.query.publishJobs.findFirst({
          where: and(
            eq(publishJobs.tenantId, input.tenantId),
            eq(publishJobs.idempotencyKey, idempotencyKey)
          )
        });

        if (existing) {
          if (existing.requestFingerprint !== requestFingerprint) {
            throw new ConflictError(
              ErrorCode.PUBLISH_JOB_IDEMPOTENCY_CONFLICT,
              'Idempotency key was reused with a different publish request.',
              {
                idempotencyKey
              }
            );
          }

          return mapPublishJob(existing);
        }

        const now = new Date();
        const createdRows = await tx
          .insert(publishJobs)
          .values({
            id: createPublishJobId(),
            tenantId: input.tenantId,
            projectId: input.projectId,
            sourceContentJobId: input.sourceContentJobId,
            sourceRenderArtifactId: input.sourceRenderArtifactId,
            sourceArtifactChecksumSha256: input.sourceArtifactSnapshot.checksumSha256,
            sourceArtifactByteSize: input.sourceArtifactSnapshot.byteSize,
            sourceArtifactSnapshot: input.sourceArtifactSnapshot,
            publishMode: input.publishMode,
            outputFormat: input.outputFormat,
            renderOptions: input.renderOptions,
            publicationMetadata: input.publicationMetadata,
            status: 'queued',
            stage: 'queued',
            idempotencyKey,
            requestFingerprint,
            remoteSubmissionIdempotencyKey: ensureNonEmpty(
              input.remoteSubmissionIdempotencyKey,
              'remoteSubmissionIdempotencyKey'
            ),
            remoteJobId: null,
            remoteState: null,
            remoteCorrelationId: null,
            remoteErrorCode: null,
            remoteErrorMessage: null,
            downloadMetadata: null,
            attemptCount: 0,
            consecutiveFailureCount: 0,
            pollCount: 0,
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            nextAttemptAt: now,
            nextPollAt: now,
            correlationId: input.correlationId,
            submittedAt: null,
            lastPolledAt: null,
            completedAt: null,
            cancelledAt: null,
            createdAt: now,
            updatedAt: now
          })
          .returning();

        const created = createdRows[0]!;

        await tx.insert(publishJobEvents).values({
          id: createPublishJobEventId(),
          tenantId: created.tenantId,
          publishJobId: created.id,
          eventType: 'publish-job-created',
          priorStatus: null,
          newStatus: created.status,
          details: {
            sourceContentJobId: created.sourceContentJobId,
            sourceRenderArtifactId: created.sourceRenderArtifactId,
            outputFormat: created.outputFormat,
            publishMode: created.publishMode
          },
          createdAt: now
        });

        return mapPublishJob(created);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.database.query.publishJobs.findFirst({
          where: and(
            eq(publishJobs.tenantId, input.tenantId),
            eq(publishJobs.idempotencyKey, idempotencyKey)
          )
        });

        if (existing) {
          if (existing.requestFingerprint !== requestFingerprint) {
            throw new ConflictError(
              ErrorCode.PUBLISH_JOB_IDEMPOTENCY_CONFLICT,
              'Idempotency key was reused with a different publish request.',
              { idempotencyKey }
            );
          }

          return mapPublishJob(existing);
        }
      }

      throw toDatabaseUnavailableError(error, 'Unable to create or read idempotent publish job.');
    }
  }

  public async getById(tenantId: TenantId, publishJobId: PublishJobId): Promise<PublishJob | null> {
    validateTenantId(tenantId);

    try {
      const row = await this.database.query.publishJobs.findFirst({
        where: and(
          eq(publishJobs.tenantId, tenantId),
          eq(publishJobs.id, publishJobId)
        )
      });

      return row ? mapPublishJob(row) : null;
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to fetch publish job by ID.');
    }
  }

  public async listEvents(
    tenantId: TenantId,
    publishJobId: PublishJobId
  ): Promise<readonly PublishJobEvent[]> {
    validateTenantId(tenantId);

    try {
      const rows = await this.database
        .select()
        .from(publishJobEvents)
        .where(
          and(
            eq(publishJobEvents.tenantId, tenantId),
            eq(publishJobEvents.publishJobId, publishJobId)
          )
        )
        .orderBy(asc(publishJobEvents.createdAt));

      return rows.map(mapPublishJobEvent);
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to list publish job events.');
    }
  }

  public async claimNextDue(input: {
    workerId: string;
    leaseDurationMs: number;
    now: Date;
  }): Promise<PublishJob | null> {
    const workerId = ensureNonEmpty(input.workerId, 'workerId');
    const leaseExpiresAt = new Date(input.now.getTime() + input.leaseDurationMs);

    try {
      return await this.database.transaction(async (tx) => {
        const candidate = await tx.query.publishJobs.findFirst({
          where: and(
            inArray(publishJobs.status, ['queued', 'retrying', 'waiting']),
            isNull(publishJobs.cancelledAt),
            isNull(publishJobs.completedAt),
            or(
              lte(publishJobs.nextAttemptAt, input.now),
              and(isNull(publishJobs.nextAttemptAt), lte(publishJobs.nextPollAt, input.now))
            ),
            or(
              isNull(publishJobs.leaseExpiresAt),
              lte(publishJobs.leaseExpiresAt, input.now)
            )
          ),
          orderBy: [asc(publishJobs.nextAttemptAt), asc(publishJobs.nextPollAt), asc(publishJobs.createdAt)]
        });

        if (!candidate) {
          return null;
        }

        const updatedRows = await tx
          .update(publishJobs)
          .set({
            status: 'processing',
            leaseOwner: workerId,
            leaseExpiresAt,
            heartbeatAt: input.now,
            attemptCount: sql`${publishJobs.attemptCount} + 1`,
            updatedAt: input.now
          })
          .where(
            and(
              eq(publishJobs.id, candidate.id),
              eq(publishJobs.status, candidate.status),
              or(isNull(publishJobs.leaseExpiresAt), lte(publishJobs.leaseExpiresAt, input.now))
            )
          )
          .returning();

        const claimed = updatedRows[0];
        if (!claimed) {
          return null;
        }

        await tx.insert(publishJobEvents).values({
          id: createPublishJobEventId(),
          tenantId: claimed.tenantId,
          publishJobId: claimed.id,
          eventType: 'publish-job-claimed',
          priorStatus: candidate.status,
          newStatus: claimed.status,
          details: {
            workerId,
            leaseExpiresAt: leaseExpiresAt.toISOString()
          },
          createdAt: input.now
        });

        return mapPublishJob(claimed);
      });
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to claim next publish job.');
    }
  }

  public async heartbeat(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    leaseDurationMs: number;
    now: Date;
  }): Promise<PublishJob | null> {
    const workerId = ensureNonEmpty(input.workerId, 'workerId');

    try {
      const updatedRows = await this.database
        .update(publishJobs)
        .set({
          heartbeatAt: input.now,
          leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
          updatedAt: input.now
        })
        .where(
          and(
            eq(publishJobs.tenantId, input.tenantId),
            eq(publishJobs.id, input.publishJobId),
            eq(publishJobs.status, 'processing'),
            eq(publishJobs.leaseOwner, workerId),
            or(isNull(publishJobs.leaseExpiresAt), gte(publishJobs.leaseExpiresAt, input.now))
          )
        )
        .returning();

      return updatedRows[0] ? mapPublishJob(updatedRows[0]) : null;
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to heartbeat publish job lease.');
    }
  }

  public async setStage(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    stage: PublishJobStage;
    now: Date;
  }): Promise<PublishJob | null> {
    const workerId = ensureNonEmpty(input.workerId, 'workerId');

    try {
      return await this.database.transaction(async (tx) => {
        const current = await tx.query.publishJobs.findFirst({
          where: and(
            eq(publishJobs.tenantId, input.tenantId),
            eq(publishJobs.id, input.publishJobId),
            eq(publishJobs.status, 'processing'),
            eq(publishJobs.leaseOwner, workerId)
          )
        });

        if (!current) {
          return null;
        }

        const updatedRows = await tx
          .update(publishJobs)
          .set({
            stage: input.stage,
            updatedAt: input.now
          })
          .where(
            and(
              eq(publishJobs.id, current.id),
              eq(publishJobs.tenantId, current.tenantId),
              eq(publishJobs.status, 'processing'),
              eq(publishJobs.leaseOwner, workerId)
            )
          )
          .returning();

        const updated = updatedRows[0];
        if (!updated) {
          return null;
        }

        await tx.insert(publishJobEvents).values({
          id: createPublishJobEventId(),
          tenantId: updated.tenantId,
          publishJobId: updated.id,
          eventType: 'publish-status-polled',
          priorStatus: current.status,
          newStatus: updated.status,
          details: {
            priorStage: current.stage,
            newStage: updated.stage
          },
          createdAt: input.now
        });

        return mapPublishJob(updated);
      });
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to update publish job stage.');
    }
  }

  public async recordSubmission(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    remoteJobId: string;
    remoteState: string;
    remoteCorrelationId: string | null;
    submittedAt: Date;
    nextPollAt: Date;
    now: Date;
  }): Promise<PublishJob | null> {
    const workerId = ensureNonEmpty(input.workerId, 'workerId');

    try {
      const updatedRows = await this.database
        .update(publishJobs)
        .set({
          status: 'waiting',
          stage: 'waiting-for-remote',
          remoteJobId: ensureNonEmpty(input.remoteJobId, 'remoteJobId'),
          remoteState: ensureNonEmpty(input.remoteState, 'remoteState'),
          remoteCorrelationId: input.remoteCorrelationId,
          submittedAt: input.submittedAt,
          nextPollAt: input.nextPollAt,
          nextAttemptAt: null,
          consecutiveFailureCount: 0,
          lastPolledAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          updatedAt: input.now
        })
        .where(
          and(
            eq(publishJobs.tenantId, input.tenantId),
            eq(publishJobs.id, input.publishJobId),
            eq(publishJobs.status, 'processing'),
            eq(publishJobs.leaseOwner, workerId),
            gt(publishJobs.leaseExpiresAt, input.now)
          )
        )
        .returning();

      const updated = updatedRows[0];
      if (!updated) {
        return null;
      }

      await this.database.insert(publishJobEvents).values({
        id: createPublishJobEventId(),
        tenantId: updated.tenantId,
        publishJobId: updated.id,
        eventType: 'publish-submitted',
        priorStatus: 'processing',
        newStatus: 'waiting',
        details: {
          remoteJobId: updated.remoteJobId,
          remoteState: updated.remoteState,
          remoteCorrelationId: updated.remoteCorrelationId
        },
        createdAt: input.now
      });

      await this.database.insert(publishJobEvents).values({
        id: createPublishJobEventId(),
        tenantId: updated.tenantId,
        publishJobId: updated.id,
        eventType: 'publish-waiting',
        priorStatus: 'waiting',
        newStatus: 'waiting',
        details: {
          remoteState: updated.remoteState,
          nextPollAt: updated.nextPollAt?.toISOString() ?? null
        },
        createdAt: input.now
      });

      return mapPublishJob(updated);
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to record publish submission.');
    }
  }

  public async recordRemoteWaiting(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    remoteState: string;
    remoteCorrelationId: string | null;
    lastPolledAt: Date;
    nextPollAt: Date;
    now: Date;
  }): Promise<PublishJob | null> {
    const workerId = ensureNonEmpty(input.workerId, 'workerId');

    try {
      const updatedRows = await this.database
        .update(publishJobs)
        .set({
          status: 'waiting',
          stage: 'waiting-for-remote',
          remoteState: ensureNonEmpty(input.remoteState, 'remoteState'),
          remoteCorrelationId: input.remoteCorrelationId,
          lastPolledAt: input.lastPolledAt,
          nextPollAt: input.nextPollAt,
          nextAttemptAt: null,
          consecutiveFailureCount: 0,
          pollCount: sql`${publishJobs.pollCount} + 1`,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          updatedAt: input.now
        })
        .where(
          and(
            eq(publishJobs.tenantId, input.tenantId),
            eq(publishJobs.id, input.publishJobId),
            eq(publishJobs.status, 'processing'),
            eq(publishJobs.leaseOwner, workerId),
            gt(publishJobs.leaseExpiresAt, input.now)
          )
        )
        .returning();

      const updated = updatedRows[0];
      if (!updated) {
        return null;
      }

      await this.database.insert(publishJobEvents).values({
        id: createPublishJobEventId(),
        tenantId: updated.tenantId,
        publishJobId: updated.id,
        eventType: 'publish-waiting',
        priorStatus: 'processing',
        newStatus: 'waiting',
        details: {
          remoteState: updated.remoteState,
          nextPollAt: updated.nextPollAt?.toISOString() ?? null
        },
        createdAt: input.now
      });

      return mapPublishJob(updated);
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to record waiting publish status.');
    }
  }

  public async recordRetry(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    errorCode: string;
    errorMessage: string;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<PublishJob | null> {
    const workerId = ensureNonEmpty(input.workerId, 'workerId');

    try {
      const updatedRows = await this.database
        .update(publishJobs)
        .set({
          status: 'retrying',
          stage: 'failed',
          remoteErrorCode: ensureNonEmpty(input.errorCode, 'errorCode'),
          remoteErrorMessage: ensureNonEmpty(input.errorMessage, 'errorMessage'),
          nextAttemptAt: input.nextAttemptAt,
          nextPollAt: null,
          consecutiveFailureCount: sql`${publishJobs.consecutiveFailureCount} + 1`,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          updatedAt: input.now
        })
        .where(
          and(
            eq(publishJobs.tenantId, input.tenantId),
            eq(publishJobs.id, input.publishJobId),
            eq(publishJobs.status, 'processing'),
            eq(publishJobs.leaseOwner, workerId),
            gt(publishJobs.leaseExpiresAt, input.now)
          )
        )
        .returning();

      const updated = updatedRows[0];
      if (!updated) {
        return null;
      }

      await this.database.insert(publishJobEvents).values({
        id: createPublishJobEventId(),
        tenantId: updated.tenantId,
        publishJobId: updated.id,
        eventType: 'publish-retry-scheduled',
        priorStatus: 'processing',
        newStatus: 'retrying',
        details: {
          errorCode: updated.remoteErrorCode,
          errorMessage: updated.remoteErrorMessage,
          nextAttemptAt: updated.nextAttemptAt?.toISOString() ?? null
        },
        createdAt: input.now
      });

      return mapPublishJob(updated);
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to schedule publish retry.');
    }
  }

  public async complete(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    remoteState: string;
    remoteCorrelationId: string | null;
    lastPolledAt?: Date;
    downloadMetadata: {
      fileName: string;
      mimeType: string;
      byteSize?: number;
      checksumSha256?: string;
      downloadUrl?: string;
      expiresAt?: string;
    };
    now: Date;
  }): Promise<PublishJob | null> {
    const workerId = ensureNonEmpty(input.workerId, 'workerId');

    try {
      const updatedRows = await this.database
        .update(publishJobs)
        .set({
          status: 'completed',
          stage: 'completed',
          remoteState: ensureNonEmpty(input.remoteState, 'remoteState'),
          remoteCorrelationId: input.remoteCorrelationId,
          downloadMetadata: input.downloadMetadata,
          consecutiveFailureCount: 0,
          pollCount: input.lastPolledAt
            ? sql`${publishJobs.pollCount} + 1`
            : publishJobs.pollCount,
          lastPolledAt: input.lastPolledAt ?? publishJobs.lastPolledAt,
          completedAt: input.now,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          nextPollAt: null,
          nextAttemptAt: null,
          updatedAt: input.now
        })
        .where(
          and(
            eq(publishJobs.tenantId, input.tenantId),
            eq(publishJobs.id, input.publishJobId),
            eq(publishJobs.status, 'processing'),
            eq(publishJobs.leaseOwner, workerId),
            gt(publishJobs.leaseExpiresAt, input.now)
          )
        )
        .returning();

      const updated = updatedRows[0];
      if (!updated) {
        return null;
      }

      await this.database.insert(publishJobEvents).values({
        id: createPublishJobEventId(),
        tenantId: updated.tenantId,
        publishJobId: updated.id,
        eventType: 'publish-completed',
        priorStatus: 'processing',
        newStatus: 'completed',
        details: {
          remoteState: updated.remoteState,
          remoteCorrelationId: updated.remoteCorrelationId
        },
        createdAt: input.now
      });

      return mapPublishJob(updated);
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to complete publish job.');
    }
  }

  public async fail(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    errorCode: string;
    errorMessage: string;
    remoteState?: string;
    remoteCorrelationId?: string;
    lastPolledAt?: Date;
    now: Date;
  }): Promise<PublishJob | null> {
    const workerId = ensureNonEmpty(input.workerId, 'workerId');

    try {
      const updatedRows = await this.database
        .update(publishJobs)
        .set({
          status: 'failed',
          stage: 'failed',
          remoteState: input.remoteState ?? null,
          remoteCorrelationId: input.remoteCorrelationId ?? null,
          remoteErrorCode: ensureNonEmpty(input.errorCode, 'errorCode'),
          remoteErrorMessage: ensureNonEmpty(input.errorMessage, 'errorMessage'),
          pollCount: input.lastPolledAt
            ? sql`${publishJobs.pollCount} + 1`
            : publishJobs.pollCount,
          lastPolledAt: input.lastPolledAt ?? publishJobs.lastPolledAt,
          completedAt: input.now,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          nextPollAt: null,
          nextAttemptAt: null,
          updatedAt: input.now
        })
        .where(
          and(
            eq(publishJobs.tenantId, input.tenantId),
            eq(publishJobs.id, input.publishJobId),
            eq(publishJobs.status, 'processing'),
            eq(publishJobs.leaseOwner, workerId),
            gt(publishJobs.leaseExpiresAt, input.now)
          )
        )
        .returning();

      const updated = updatedRows[0];
      if (!updated) {
        return null;
      }

      await this.database.insert(publishJobEvents).values({
        id: createPublishJobEventId(),
        tenantId: updated.tenantId,
        publishJobId: updated.id,
        eventType: 'publish-failed',
        priorStatus: 'processing',
        newStatus: 'failed',
        details: {
          errorCode: updated.remoteErrorCode,
          errorMessage: updated.remoteErrorMessage,
          remoteState: updated.remoteState
        },
        createdAt: input.now
      });

      return mapPublishJob(updated);
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to fail publish job.');
    }
  }

  public async markRemoteCancelled(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    remoteState: string;
    remoteCorrelationId?: string;
    lastPolledAt?: Date;
    now: Date;
  }): Promise<PublishJob | null> {
    const workerId = ensureNonEmpty(input.workerId, 'workerId');

    try {
      const updatedRows = await this.database
        .update(publishJobs)
        .set({
          status: 'cancelled',
          stage: 'cancelled',
          remoteState: ensureNonEmpty(input.remoteState, 'remoteState'),
          remoteCorrelationId: input.remoteCorrelationId ?? null,
          pollCount: input.lastPolledAt
            ? sql`${publishJobs.pollCount} + 1`
            : publishJobs.pollCount,
          lastPolledAt: input.lastPolledAt ?? publishJobs.lastPolledAt,
          cancelledAt: input.now,
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
          nextPollAt: null,
          nextAttemptAt: null,
          updatedAt: input.now
        })
        .where(
          and(
            eq(publishJobs.tenantId, input.tenantId),
            eq(publishJobs.id, input.publishJobId),
            eq(publishJobs.status, 'processing'),
            eq(publishJobs.leaseOwner, workerId),
            gt(publishJobs.leaseExpiresAt, input.now)
          )
        )
        .returning();

      const updated = updatedRows[0];
      if (!updated) {
        return null;
      }

      await this.database.insert(publishJobEvents).values({
        id: createPublishJobEventId(),
        tenantId: updated.tenantId,
        publishJobId: updated.id,
        eventType: 'publish-cancelled',
        priorStatus: 'processing',
        newStatus: 'cancelled',
        details: {
          remoteState: updated.remoteState,
          remoteCorrelationId: updated.remoteCorrelationId
        },
        createdAt: input.now
      });

      return mapPublishJob(updated);
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to mark publish job cancelled from remote state.');
    }
  }

  public async cancel(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    now: Date;
  }): Promise<PublishJob> {
    validateTenantId(input.tenantId);

    try {
      return await this.database.transaction(async (tx) => {
        const current = await tx.query.publishJobs.findFirst({
          where: and(
            eq(publishJobs.tenantId, input.tenantId),
            eq(publishJobs.id, input.publishJobId)
          )
        });

        if (!current) {
          throw new NotFoundError('Publish job', input.publishJobId);
        }

        if (!(['queued', 'waiting', 'retrying'] as readonly string[]).includes(current.status)) {
          throw new ConflictError(
            ErrorCode.PUBLISH_JOB_INVALID_STATE,
            'Publish job can only be cancelled from queued, waiting, or retrying states.'
          );
        }

        const updatedRows = await tx
          .update(publishJobs)
          .set({
            status: 'cancelled',
            stage: 'cancelled',
            cancelledAt: input.now,
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            nextAttemptAt: null,
            nextPollAt: null,
            updatedAt: input.now
          })
          .where(
            and(
              eq(publishJobs.tenantId, input.tenantId),
              eq(publishJobs.id, input.publishJobId),
              eq(publishJobs.status, current.status)
            )
          )
          .returning();

        const updated = updatedRows[0];
        if (!updated) {
          throw new ConflictError(
            ErrorCode.PUBLISH_JOB_INVALID_STATE,
            'Publish job state changed concurrently and can no longer be cancelled.'
          );
        }

        await tx.insert(publishJobEvents).values({
          id: createPublishJobEventId(),
          tenantId: updated.tenantId,
          publishJobId: updated.id,
          eventType: 'publish-cancelled',
          priorStatus: current.status,
          newStatus: 'cancelled',
          details: null,
          createdAt: input.now
        });

        return mapPublishJob(updated);
      });
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to cancel publish job.');
    }
  }

  public async recoverStaleLeases(input: {
    now: Date;
    maxConsecutiveFailures: number;
    retryDelayMs: number;
    limit: number;
  }): Promise<number> {
    try {
      return await this.database.transaction(async (tx) => {
        const staleRows = await tx
          .select()
          .from(publishJobs)
          .where(
            and(
              eq(publishJobs.status, 'processing'),
              lte(publishJobs.leaseExpiresAt, input.now)
            )
          )
          .orderBy(asc(publishJobs.leaseExpiresAt), asc(publishJobs.createdAt))
          .limit(input.limit);

        if (staleRows.length === 0) {
          return 0;
        }

        let recoveredCount = 0;

        for (const stale of staleRows) {
          const nextFailureCount = stale.consecutiveFailureCount + 1;
          const shouldFail = nextFailureCount >= input.maxConsecutiveFailures;
          const nextAttemptAt = new Date(input.now.getTime() + input.retryDelayMs);

          const updatedRows = await tx
            .update(publishJobs)
            .set(
              shouldFail
                ? {
                    status: 'failed',
                    stage: 'failed',
                    remoteErrorCode: ErrorCode.PUBLISH_JOB_RETRY_EXHAUSTED,
                    remoteErrorMessage: 'Publish job lease expired repeatedly and exceeded recovery threshold.',
                    completedAt: input.now,
                    consecutiveFailureCount: nextFailureCount,
                    leaseOwner: null,
                    leaseExpiresAt: null,
                    heartbeatAt: null,
                    nextPollAt: null,
                    nextAttemptAt: null,
                    updatedAt: input.now
                  }
                : {
                    status: stale.remoteJobId ? 'waiting' : 'retrying',
                    stage: stale.remoteJobId ? 'waiting-for-remote' : 'failed',
                    remoteErrorCode: ErrorCode.PUBLISH_JOB_LEASE_MISMATCH,
                    remoteErrorMessage: 'Publish job lease expired and was recovered.',
                    nextAttemptAt: stale.remoteJobId ? null : nextAttemptAt,
                    nextPollAt: stale.remoteJobId ? nextAttemptAt : null,
                    consecutiveFailureCount: nextFailureCount,
                    leaseOwner: null,
                    leaseExpiresAt: null,
                    heartbeatAt: null,
                    updatedAt: input.now
                  }
            )
            .where(
              and(
                eq(publishJobs.id, stale.id),
                eq(publishJobs.status, 'processing'),
                lte(publishJobs.leaseExpiresAt, input.now)
              )
            )
            .returning();

          const updated = updatedRows[0];
          if (!updated) {
            continue;
          }

          await tx.insert(publishJobEvents).values({
            id: createPublishJobEventId(),
            tenantId: updated.tenantId,
            publishJobId: updated.id,
            eventType: 'publish-lease-expired',
            priorStatus: 'processing',
            newStatus: updated.status,
            details: {
              recoveredAt: input.now.toISOString(),
              nextAttemptAt: shouldFail || updated.status === 'waiting'
                ? null
                : nextAttemptAt.toISOString(),
              nextPollAt: updated.status === 'waiting'
                ? nextAttemptAt.toISOString()
                : null,
              consecutiveFailureCount: nextFailureCount,
              terminalFailure: shouldFail,
              preservedRemoteJobId: stale.remoteJobId
            },
            createdAt: input.now
          });

          recoveredCount += 1;
        }

        return recoveredCount;
      });
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to recover stale publish job leases.');
    }
  }
}
