import { describe, expect, it } from 'vitest';

import { computeTranscriptHash, normalizeTranscript } from '../../../src/platform/security/hashing/index.js';
import { ValidationError } from '../../../src/platform/shared/errors/index.js';
import {
  clearTenantData,
  createTestScope,
  repositories
} from '../support/database.js';

describe.sequential('DrizzleSourceVersionRepository integration', () => {
  it('creates, deduplicates, lists, and enforces tenant boundaries', async () => {
    const scope = createTestScope();

    try {
      const created = await repositories.sourceVersions.create({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        transcriptText: 'Line 1\r\n\r\n\r\nLine 2'
      });

      expect(created.versionNumber).toBe(1);
      expect(created.transcriptText).toBe(normalizeTranscript('Line 1\r\n\r\n\r\nLine 2'));
      expect(created.contentHash).toBe(computeTranscriptHash('Line 1\r\n\r\n\r\nLine 2'));

      await expect(
        repositories.sourceVersions.create({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          transcriptText: '   \n\n   '
        })
      ).rejects.toBeInstanceOf(ValidationError);

      const duplicate = await repositories.sourceVersions.create({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        transcriptText: 'Line 1\n\nLine 2'
      });

      expect(duplicate.id).toBe(created.id);

      const changed = await repositories.sourceVersions.create({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        transcriptText: 'Line 1\n\nLine 3'
      });

      expect(changed.versionNumber).toBe(2);

      const byProject = await repositories.sourceVersions.listByProject(
        scope.tenantId,
        scope.projectId
      );

      expect(byProject.map((item) => item.versionNumber)).toEqual([1, 2]);

      const otherProjectScope = createTestScope();
      const otherProject = await repositories.sourceVersions.create({
        tenantId: scope.tenantId,
        projectId: otherProjectScope.projectId,
        transcriptText: 'Line 1\n\nLine 2'
      });
      expect(otherProject.id).not.toBe(created.id);

      const otherTenantScope = createTestScope();
      const otherTenant = await repositories.sourceVersions.create({
        tenantId: otherTenantScope.tenantId,
        projectId: scope.projectId,
        transcriptText: 'Line 1\n\nLine 2'
      });
      expect(otherTenant.id).not.toBe(created.id);

      const crossTenantRead = await repositories.sourceVersions.getById(
        otherTenantScope.tenantId,
        created.id
      );
      expect(crossTenantRead).toBeNull();

      await clearTenantData(otherTenantScope.tenantId);
    } finally {
      await clearTenantData(scope.tenantId);
    }
  });

  it('is concurrency-safe for version numbers and identical transcript deduplication', async () => {
    const scope = createTestScope();

    try {
      const firstBatch = await Promise.all([
        repositories.sourceVersions.create({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          transcriptText: 'Concurrent transcript A'
        }),
        repositories.sourceVersions.create({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          transcriptText: 'Concurrent transcript B'
        })
      ]);

      const versions = firstBatch.map((item) => item.versionNumber).sort((a, b) => a - b);
      expect(versions).toEqual([1, 2]);

      const dedupeBatch = await Promise.all([
        repositories.sourceVersions.create({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          transcriptText: 'Concurrent transcript A'
        }),
        repositories.sourceVersions.create({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          transcriptText: 'Concurrent transcript A'
        }),
        repositories.sourceVersions.create({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          transcriptText: 'Concurrent transcript A'
        })
      ]);

      const uniqueIds = new Set(dedupeBatch.map((item) => item.id));
      expect(uniqueIds.size).toBe(1);

      const listed = await repositories.sourceVersions.listByProject(
        scope.tenantId,
        scope.projectId
      );

      expect(listed.length).toBe(2);
    } finally {
      await clearTenantData(scope.tenantId);
    }
  });
});
