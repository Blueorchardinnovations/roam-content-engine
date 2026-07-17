import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';
import {
  clearTenantData,
  createSourceVersionForTest,
  createTestScope,
  repositories
} from '../support/database.js';

describe.sequential('tenant isolation integration', () => {
  it('prevents cross-tenant reads and mutations for source versions, jobs, and events', async () => {
    const tenantA = createTestScope();
    const tenantB = createTestScope();

    try {
      const sourceA = await createSourceVersionForTest({
        tenantId: tenantA.tenantId,
        projectId: tenantA.projectId,
        transcriptText: 'Tenant A transcript'
      });

      const sourceAReadByB = await repositories.sourceVersions.getById(
        tenantB.tenantId,
        sourceA.id
      );
      expect(sourceAReadByB).toBeNull();

      const sourceListByB = await repositories.sourceVersions.listByProject(
        tenantB.tenantId,
        tenantA.projectId
      );
      expect(sourceListByB).toHaveLength(0);

      const jobA = await repositories.contentJobs.createOrGetIdempotent({
        tenantId: tenantA.tenantId,
        projectId: tenantA.projectId,
        sourceVersionId: sourceA.id,
        idempotencyKey: 'tenant-a-job',
        jobType: 'transcript-processing',
        requestSchemaVersion: '1.0'
      });

      expect(await repositories.contentJobs.getById(tenantB.tenantId, jobA.id)).toBeNull();
      expect(await repositories.contentJobs.getByIdempotencyKey(tenantB.tenantId, 'tenant-a-job')).toBeNull();

      await expect(
        repositories.contentJobs.claim(tenantB.tenantId, jobA.id)
      ).rejects.toMatchObject({ code: ErrorCode.JOB_NOT_CLAIMABLE });

      await expect(
        repositories.contentJobs.complete(tenantB.tenantId, jobA.id, {
          schemaVersion: '1.0',
          sourceVersionId: sourceA.id,
          contentHash: sourceA.contentHash,
          wordCount: 1,
          characterCount: 1,
          paragraphCount: 1,
          lineCount: 1,
          processedAt: new Date().toISOString()
        })
      ).rejects.toMatchObject({ code: ErrorCode.RESOURCE_NOT_FOUND });

      await expect(
        repositories.contentJobs.scheduleRetry(tenantB.tenantId, jobA.id, 'E_RETRY', 'temp')
      ).rejects.toMatchObject({ code: ErrorCode.RESOURCE_NOT_FOUND });

      await expect(
        repositories.contentJobs.fail(tenantB.tenantId, jobA.id, 'E_FAIL', 'fail')
      ).rejects.toMatchObject({ code: ErrorCode.RESOURCE_NOT_FOUND });

      await expect(
        repositories.contentJobs.cancel(tenantB.tenantId, jobA.id)
      ).rejects.toMatchObject({ code: ErrorCode.RESOURCE_NOT_FOUND });

      const eventsFromB = await repositories.jobEvents.listByJob(tenantB.tenantId, jobA.id);
      expect(eventsFromB).toHaveLength(0);
    } finally {
      await clearTenantData(tenantA.tenantId);
      await clearTenantData(tenantB.tenantId);
    }
  });
});
