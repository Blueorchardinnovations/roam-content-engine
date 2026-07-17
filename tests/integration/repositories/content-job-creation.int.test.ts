import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';
import {
  ConflictError,
  NotFoundError
} from '../../../src/platform/shared/errors/index.js';
import { createCorrelationId } from '../../../src/platform/identity/ids/index.js';
import {
  clearTenantData,
  createSourceVersionForTest,
  createTestScope,
  repositories
} from '../support/database.js';

describe.sequential('DrizzleContentJobRepository createOrGetIdempotent integration', () => {
  it('creates idempotent jobs and handles key conflicts correctly', async () => {
    const scope = createTestScope();

    try {
      const source = await createSourceVersionForTest({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        transcriptText: 'Job creation source transcript'
      });

      const created = await repositories.contentJobs.createOrGetIdempotent({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        sourceVersionId: source.id,
        idempotencyKey: 'idem-key-1',
        jobType: 'transcript-processing',
        requestSchemaVersion: '1.0'
      });

      expect(created.status).toBe('queued');
      expect(created.currentStage).toBe('queued');
      expect(created.correlationId.startsWith('corr_')).toBe(true);

      const events = await repositories.jobEvents.listByJob(scope.tenantId, created.id);
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe('job-created');

      const sameRequest = await repositories.contentJobs.createOrGetIdempotent({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        sourceVersionId: source.id,
        idempotencyKey: 'idem-key-1',
        correlationId: createCorrelationId(),
        jobType: 'transcript-processing',
        requestSchemaVersion: '1.0'
      });

      expect(sameRequest.id).toBe(created.id);

      const eventsAfterRepeat = await repositories.jobEvents.listByJob(scope.tenantId, created.id);
      expect(eventsAfterRepeat).toHaveLength(1);

      const anotherSource = await createSourceVersionForTest({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        transcriptText: 'Different source transcript'
      });

      await expect(
        repositories.contentJobs.createOrGetIdempotent({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          sourceVersionId: anotherSource.id,
          idempotencyKey: 'idem-key-1',
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        })
      ).rejects.toMatchObject({
        code: ErrorCode.IDEMPOTENCY_KEY_REUSED
      } satisfies Partial<ConflictError>);

      const otherTenant = createTestScope();
      const otherSource = await createSourceVersionForTest({
        tenantId: otherTenant.tenantId,
        projectId: otherTenant.projectId,
        transcriptText: 'Other tenant source'
      });

      const sameKeyOtherTenant = await repositories.contentJobs.createOrGetIdempotent({
        tenantId: otherTenant.tenantId,
        projectId: otherTenant.projectId,
        sourceVersionId: otherSource.id,
        idempotencyKey: 'idem-key-1',
        jobType: 'transcript-processing',
        requestSchemaVersion: '1.0'
      });

      expect(sameKeyOtherTenant.id).not.toBe(created.id);

      await clearTenantData(otherTenant.tenantId);
    } finally {
      await clearTenantData(scope.tenantId);
    }
  });

  it('enforces source ownership and handles concurrent identical submissions', async () => {
    const scope = createTestScope();

    try {
      const source = await createSourceVersionForTest({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        transcriptText: 'Source ownership transcript'
      });

      const missingSourceId = 'srcver_01JXYZ12345678901234567890' as const;
      await expect(
        repositories.contentJobs.createOrGetIdempotent({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          sourceVersionId: missingSourceId,
          idempotencyKey: 'idem-missing-source',
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        })
      ).rejects.toBeInstanceOf(NotFoundError);

      const otherTenant = createTestScope();
      const otherSource = await createSourceVersionForTest({
        tenantId: otherTenant.tenantId,
        projectId: otherTenant.projectId,
        transcriptText: 'Cross tenant source'
      });

      await expect(
        repositories.contentJobs.createOrGetIdempotent({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          sourceVersionId: otherSource.id,
          idempotencyKey: 'idem-cross-tenant',
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        })
      ).rejects.toBeInstanceOf(NotFoundError);

      const concurrent = await Promise.all([
        repositories.contentJobs.createOrGetIdempotent({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          sourceVersionId: source.id,
          idempotencyKey: 'idem-concurrent',
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        }),
        repositories.contentJobs.createOrGetIdempotent({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          sourceVersionId: source.id,
          idempotencyKey: 'idem-concurrent',
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        })
      ]);

      expect(new Set(concurrent.map((job) => job.id)).size).toBe(1);

      const events = await repositories.jobEvents.listByJob(
        scope.tenantId,
        concurrent[0]!.id
      );

      expect(events.filter((event) => event.eventType === 'job-created')).toHaveLength(1);

      await clearTenantData(otherTenant.tenantId);
    } finally {
      await clearTenantData(scope.tenantId);
    }
  });
});
