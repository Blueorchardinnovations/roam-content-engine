import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';
import {
  ConflictError,
  ValidationError
} from '../../../src/platform/shared/errors/index.js';
import {
  clearTenantData,
  createSourceVersionForTest,
  createTestScope,
  repositories
} from '../support/database.js';

async function createClaimedJob() {
  const scope = createTestScope();
  const source = await createSourceVersionForTest({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    transcriptText: 'Lifecycle transcript'
  });

  const queued = await repositories.contentJobs.createOrGetIdempotent({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    sourceVersionId: source.id,
    idempotencyKey: 'lifecycle-idem-key',
    jobType: 'transcript-processing',
    requestSchemaVersion: '1.0'
  });

  const claimed = await repositories.contentJobs.claim(scope.tenantId, queued.id);

  return {
    scope,
    source,
    claimed
  };
}

describe.sequential('DrizzleContentJobRepository lifecycle integration', () => {
  it('completes processing jobs with validated result and writes completion event', async () => {
    const { scope, source, claimed } = await createClaimedJob();

    try {
      const completed = await repositories.contentJobs.complete(scope.tenantId, claimed.id, {
        schemaVersion: '1.0',
        sourceVersionId: source.id,
        contentHash: source.contentHash,
        wordCount: 3,
        characterCount: 25,
        paragraphCount: 1,
        lineCount: 1,
        processedAt: new Date().toISOString()
      });

      expect(completed.status).toBe('completed');
      expect(completed.currentStage).toBe('completed');
      expect(completed.completedAt).not.toBeNull();
      expect(completed.result?.schemaVersion).toBe('1.0');

      const events = await repositories.jobEvents.listByJob(scope.tenantId, claimed.id);
      expect(events.some((event) => event.eventType === 'job-completed')).toBe(true);

      await expect(
        repositories.contentJobs.complete(scope.tenantId, claimed.id, {
          schemaVersion: '1.0',
          sourceVersionId: source.id,
          contentHash: source.contentHash,
          wordCount: 3,
          characterCount: 25,
          paragraphCount: 1,
          lineCount: 1,
          processedAt: new Date().toISOString()
        })
      ).rejects.toMatchObject({
        code: ErrorCode.JOB_ALREADY_COMPLETED
      } satisfies Partial<ConflictError>);

      await expect(
        repositories.contentJobs.fail(scope.tenantId, claimed.id, 'E_FAIL', 'already complete')
      ).rejects.toMatchObject({
        code: ErrorCode.JOB_ALREADY_COMPLETED
      } satisfies Partial<ConflictError>);

      await expect(
        repositories.contentJobs.scheduleRetry(scope.tenantId, claimed.id, 'E_RETRY', 'already complete')
      ).rejects.toMatchObject({
        code: ErrorCode.JOB_ALREADY_COMPLETED
      } satisfies Partial<ConflictError>);
    } finally {
      await clearTenantData(scope.tenantId);
    }
  });

  it('rejects invalid completion result or source-version mismatch', async () => {
    const { scope, source, claimed } = await createClaimedJob();

    try {
      await expect(
        repositories.contentJobs.complete(scope.tenantId, claimed.id, {
          schemaVersion: '1.0',
          sourceVersionId: source.id,
          contentHash: source.contentHash,
          wordCount: -1,
          characterCount: 25,
          paragraphCount: 1,
          lineCount: 1,
          processedAt: new Date().toISOString()
        })
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        repositories.contentJobs.complete(scope.tenantId, claimed.id, {
          schemaVersion: '1.0',
          sourceVersionId: 'srcver_01JXYZ12345678901234567890',
          contentHash: source.contentHash,
          wordCount: 1,
          characterCount: 1,
          paragraphCount: 1,
          lineCount: 1,
          processedAt: new Date().toISOString()
        })
      ).rejects.toMatchObject({
        code: ErrorCode.TRANSCRIPT_HASH_MISMATCH
      } satisfies Partial<ConflictError>);
    } finally {
      await clearTenantData(scope.tenantId);
    }
  });

  it('supports retry, re-claim, fail, and cancel with tenant isolation', async () => {
    const { scope, claimed } = await createClaimedJob();

    try {
      const retrying = await repositories.contentJobs.scheduleRetry(
        scope.tenantId,
        claimed.id,
        'E_RETRY',
        'temporary issue'
      );

      expect(retrying.status).toBe('retrying');
      expect(retrying.currentStage).toBe('failed');
      expect(retrying.errorCode).toBe('E_RETRY');

      const reclaimed = await repositories.contentJobs.claim(scope.tenantId, claimed.id);
      expect(reclaimed.status).toBe('processing');
      expect(reclaimed.attemptCount).toBe(2);

      const failed = await repositories.contentJobs.fail(
        scope.tenantId,
        claimed.id,
        'E_FATAL',
        'fatal issue'
      );

      expect(failed.status).toBe('failed');
      expect(failed.currentStage).toBe('failed');

      await expect(
        repositories.contentJobs.claim(scope.tenantId, claimed.id)
      ).rejects.toMatchObject({
        code: ErrorCode.JOB_NOT_CLAIMABLE
      } satisfies Partial<ConflictError>);

      const wrongTenant = createTestScope();

      await expect(
        repositories.contentJobs.cancel(wrongTenant.tenantId, claimed.id)
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND
      });

      const queueScope = createTestScope();
      const queueSource = await createSourceVersionForTest({
        tenantId: queueScope.tenantId,
        projectId: queueScope.projectId,
        transcriptText: 'queue cancel transcript'
      });

      const queueJob = await repositories.contentJobs.createOrGetIdempotent({
        tenantId: queueScope.tenantId,
        projectId: queueScope.projectId,
        sourceVersionId: queueSource.id,
        idempotencyKey: 'cancel-queued',
        jobType: 'transcript-processing',
        requestSchemaVersion: '1.0'
      });

      const cancelled = await repositories.contentJobs.cancel(queueScope.tenantId, queueJob.id);
      expect(cancelled.status).toBe('cancelled');

      await expect(
        repositories.contentJobs.claim(queueScope.tenantId, queueJob.id)
      ).rejects.toMatchObject({
        code: ErrorCode.JOB_NOT_CLAIMABLE
      } satisfies Partial<ConflictError>);

      await clearTenantData(queueScope.tenantId);
    } finally {
      await clearTenantData(scope.tenantId);
    }
  });
});
