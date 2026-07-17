import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';
import { ConflictError } from '../../../src/platform/shared/errors/index.js';
import {
  clearTenantData,
  createSourceVersionForTest,
  createTestScope,
  repositories
} from '../support/database.js';

async function createQueuedJob() {
  const scope = createTestScope();

  const source = await createSourceVersionForTest({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    transcriptText: 'Claim test transcript'
  });

  const job = await repositories.contentJobs.createOrGetIdempotent({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    sourceVersionId: source.id,
    idempotencyKey: 'claim-job-idempotency-key',
    jobType: 'transcript-processing',
    requestSchemaVersion: '1.0'
  });

  return {
    scope,
    source,
    job
  };
}

describe.sequential(
  'DrizzleContentJobRepository claim integration',
  () => {
    it(
      'claims queued jobs atomically and allows only one concurrent winner',
      async () => {
        const { scope, job } = await createQueuedJob();

        try {
          const before = await repositories.contentJobs.getById(
            scope.tenantId,
            job.id
          );

          const [first, second] = await Promise.allSettled([
            repositories.contentJobs.claim(
              scope.tenantId,
              job.id
            ),
            repositories.contentJobs.claim(
              scope.tenantId,
              job.id
            )
          ]);

          const fulfilled = [first, second].filter(
            (item) => item.status === 'fulfilled'
          );

          const rejected = [first, second].filter(
            (item) => item.status === 'rejected'
          );

          expect(fulfilled).toHaveLength(1);
          expect(rejected).toHaveLength(1);

          const claimed = (
            fulfilled[0] as PromiseFulfilledResult<typeof job>
          ).value;

          expect(claimed.status).toBe('processing');
          expect(claimed.currentStage).toBe(
            'normalizing-transcript'
          );
          expect(claimed.startedAt).not.toBeNull();
          expect(claimed.attemptCount).toBe(1);
          expect(claimed.updatedAt.getTime()).toBeGreaterThanOrEqual(
            before!.updatedAt.getTime()
          );

          const events =
            await repositories.jobEvents.listByJob(
              scope.tenantId,
              job.id
            );

          const claimEvents = events.filter(
            (event) => event.eventType === 'job-claimed'
          );

          expect(claimEvents).toHaveLength(1);

          const claimEvent = claimEvents[0];

          expect(claimEvent).toMatchObject({
            priorStatus: 'queued',
            newStatus: 'processing'
          });

          expect(claimEvent?.details).toMatchObject({
            stage: 'normalizing-transcript'
          });

          const rejectedReason = (
            rejected[0] as PromiseRejectedResult
          ).reason as ConflictError;

          expect(rejectedReason.code).toBe(
            ErrorCode.JOB_NOT_CLAIMABLE
          );
        } finally {
          await clearTenantData(scope.tenantId);
        }
      }
    );

    it(
      'prevents claiming processing, completed, cancelled, and wrong-tenant jobs',
      async () => {
        const { scope, job } = await createQueuedJob();

        try {
          await repositories.contentJobs.claim(
            scope.tenantId,
            job.id
          );

          await expect(
            repositories.contentJobs.claim(
              scope.tenantId,
              job.id
            )
          ).rejects.toMatchObject({
            code: ErrorCode.JOB_NOT_CLAIMABLE
          } satisfies Partial<ConflictError>);

          await repositories.contentJobs.fail(
            scope.tenantId,
            job.id,
            'E_FAIL',
            'failed'
          );

          await expect(
            repositories.contentJobs.claim(
              scope.tenantId,
              job.id
            )
          ).rejects.toMatchObject({
            code: ErrorCode.JOB_NOT_CLAIMABLE
          } satisfies Partial<ConflictError>);

          const wrongTenant = createTestScope();

          await expect(
            repositories.contentJobs.claim(
              wrongTenant.tenantId,
              job.id
            )
          ).rejects.toMatchObject({
            code: ErrorCode.JOB_NOT_CLAIMABLE
          } satisfies Partial<ConflictError>);
        } finally {
          await clearTenantData(scope.tenantId);
        }
      }
    );
  }
);