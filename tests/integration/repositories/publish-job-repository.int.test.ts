import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';
import { publishJobs } from '../../../src/db/schema/publish-jobs.js';
import { ConflictError } from '../../../src/platform/shared/errors/index.js';
import { DatabasePublishJobSource } from '../../../src/infrastructure/publish-jobs/index.js';
import {
  clearTenantData,
  integrationDb,
  repositories
} from '../support/database.js';
import {
  buildCreatePublishJobInput,
  createCompletedSourceContentJobForPublish
} from '../support/publish-jobs.js';

describe.sequential('DrizzlePublishJobRepository integration', () => {
  it('creates idempotent publish jobs and rejects conflicting reuse', async () => {
    const { scope, contentJob } = await createCompletedSourceContentJobForPublish();

    try {
      const createInput = buildCreatePublishJobInput({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        contentJob,
        idempotencyKey: 'publish-idem-1'
      });

      const created = await repositories.publishJobs.createOrGetIdempotent(createInput);
      const repeated = await repositories.publishJobs.createOrGetIdempotent(createInput);

      expect(repeated.id).toBe(created.id);
      expect(repeated.requestFingerprint).toBe(created.requestFingerprint);

      await expect(
        repositories.publishJobs.createOrGetIdempotent({
          ...createInput,
          outputFormat: 'epub',
          requestFingerprint: 'different-fingerprint',
          remoteSubmissionIdempotencyKey: 'publish::submit:different-fingerprint'
        })
      ).rejects.toMatchObject({
        code: ErrorCode.PUBLISH_JOB_IDEMPOTENCY_CONFLICT
      } satisfies Partial<ConflictError>);
    } finally {
      await clearTenantData(scope.tenantId);
    }
  });

  it('rejects cancellation after the dedicated publish source has claimed the job', async () => {
    const { scope, contentJob } = await createCompletedSourceContentJobForPublish();

    try {
      const publishJob = await repositories.publishJobs.createOrGetIdempotent(
        buildCreatePublishJobInput({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          contentJob,
          idempotencyKey: 'publish-cancel-claimed'
        })
      );

      const source = new DatabasePublishJobSource(integrationDb);
      const claimed = await source.acquireNext({
        workerId: 'worker_publish_int_1',
        leaseDurationMs: 30_000,
        now: new Date('2026-01-01T00:00:00.000Z')
      });

      expect(claimed?.publishJobId).toBe(publishJob.id);

      await expect(
        repositories.publishJobs.cancel({
          tenantId: scope.tenantId,
          publishJobId: publishJob.id,
          now: new Date('2026-01-01T00:00:01.000Z')
        })
      ).rejects.toMatchObject({
        code: ErrorCode.PUBLISH_JOB_INVALID_STATE
      } satisfies Partial<ConflictError>);
    } finally {
      await clearTenantData(scope.tenantId);
    }
  });

  it('recovers stale claimed publish jobs into retrying state', async () => {
    const { scope, contentJob } = await createCompletedSourceContentJobForPublish();

    try {
      const publishJob = await repositories.publishJobs.createOrGetIdempotent(
        buildCreatePublishJobInput({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          contentJob,
          idempotencyKey: 'publish-stale-recovery'
        })
      );

      const source = new DatabasePublishJobSource(integrationDb);
      const claimTime = new Date('2026-01-01T00:00:00.000Z');
      const claimed = await source.acquireNext({
        workerId: 'worker_publish_int_2',
        leaseDurationMs: 1_000,
        now: claimTime
      });

      expect(claimed?.publishJobId).toBe(publishJob.id);

      const recovered = await repositories.publishJobs.recoverStaleLeases({
        now: new Date('2026-01-01T00:00:05.000Z'),
        maxConsecutiveFailures: 3,
        retryDelayMs: 5_000,
        limit: 10
      });

      expect(recovered).toBe(1);

      const row = await integrationDb.query.publishJobs.findFirst({
        where: and(
          eq(publishJobs.tenantId, scope.tenantId),
          eq(publishJobs.id, publishJob.id)
        )
      });

      expect(row?.status).toBe('retrying');
      expect(row?.leaseOwner).toBeNull();
      expect(row?.remoteErrorCode).toBe(ErrorCode.PUBLISH_JOB_LEASE_MISMATCH);
    } finally {
      await clearTenantData(scope.tenantId);
    }
  });
});