import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/api/app.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';
import {
  clearTenantData,
  createContentJobForTest,
  createSourceVersionForTest,
  createTestScope,
  repositories
} from '../support/database.js';
import { createCompletedSourceContentJobForPublish } from '../support/publish-jobs.js';

function createRealApp() {
  return createApp({
    sourceVersionRepository: repositories.sourceVersions,
    contentJobRepository: repositories.contentJobs,
    jobEventRepository: repositories.jobEvents,
    publishJobRepository: repositories.publishJobs,
    checkDatabaseHealth: async () => true,
    nodeEnv: 'test'
  });
}

describe.sequential('publish job API integration', () => {
  it('creates publish jobs, redacts sensitive fields, lists events, and cancels queued jobs', async () => {
    const { scope, contentJob } = await createCompletedSourceContentJobForPublish();
    const app = await createRealApp();

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': scope.tenantId,
          'idempotency-key': 'publish-api-1'
        },
        payload: {
          projectId: scope.projectId,
          sourceContentJobId: contentJob.id,
          outputFormat: 'pdf',
          publishMode: 'standard',
          renderOptions: {
            includeToc: true
          },
          publicationMetadata: {
            title: 'API Publish',
            language: 'en'
          }
        }
      });

      expect(created.statusCode).toBe(202);
      const payload = created.json();
      expect(payload.idempotencyKey).toBe('publish-api-1');
      expect(payload.requestFingerprint).toBeUndefined();
      expect(payload.remoteSubmissionIdempotencyKey).toBeUndefined();
      expect(payload.leaseOwner).toBeUndefined();

      const fetched = await app.inject({
        method: 'GET',
        url: `/v1/publish-jobs/${payload.id}`,
        headers: {
          'x-tenant-id': scope.tenantId
        }
      });

      expect(fetched.statusCode).toBe(200);
      expect(fetched.json().id).toBe(payload.id);

      const events = await app.inject({
        method: 'GET',
        url: `/v1/publish-jobs/${payload.id}/events`,
        headers: {
          'x-tenant-id': scope.tenantId
        }
      });

      expect(events.statusCode).toBe(200);
      expect(events.json().events.some((event: { eventType: string }) => event.eventType === 'publish-job-created')).toBe(true);

      const cancelled = await app.inject({
        method: 'POST',
        url: `/v1/publish-jobs/${payload.id}/cancel`,
        headers: {
          'x-tenant-id': scope.tenantId
        }
      });

      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.json().status).toBe('cancelled');
    } finally {
      await app.close();
      await clearTenantData(scope.tenantId);
    }
  });

  it('returns conflict for ineligible source content jobs', async () => {
    const { tenantId, projectId } = createTestScope();
    const source = await createSourceVersionForTest({
      tenantId,
      projectId,
      transcriptText: 'Queued publish source'
    });
    const queued = await createContentJobForTest({
      tenantId,
      projectId,
      sourceVersionId: source.id,
      idempotencyKey: 'publish-api-queued-source',
      jobType: 'transcript-processing',
      requestSchemaVersion: '1.0'
    });
    const app = await createRealApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': tenantId,
          'idempotency-key': 'publish-api-queued'
        },
        payload: {
          projectId,
          sourceContentJobId: queued.id,
          outputFormat: 'pdf',
          publishMode: 'standard'
        }
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe(ErrorCode.PUBLISH_SOURCE_NOT_ELIGIBLE);
    } finally {
      await app.close();
      await clearTenantData(tenantId);
    }
  });

  it('returns idempotency conflict when a key is reused with a different publish request', async () => {
    const { scope, contentJob } = await createCompletedSourceContentJobForPublish();
    const app = await createRealApp();

    try {
      const first = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': scope.tenantId,
          'idempotency-key': 'publish-api-idem-conflict'
        },
        payload: {
          projectId: scope.projectId,
          sourceContentJobId: contentJob.id,
          outputFormat: 'pdf',
          publishMode: 'standard'
        }
      });

      expect(first.statusCode).toBe(202);

      const conflict = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': scope.tenantId,
          'idempotency-key': 'publish-api-idem-conflict'
        },
        payload: {
          projectId: scope.projectId,
          sourceContentJobId: contentJob.id,
          outputFormat: 'epub',
          publishMode: 'standard'
        }
      });

      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().error.code).toBe(ErrorCode.PUBLISH_JOB_IDEMPOTENCY_CONFLICT);
    } finally {
      await app.close();
      await clearTenantData(scope.tenantId);
    }
  });
});