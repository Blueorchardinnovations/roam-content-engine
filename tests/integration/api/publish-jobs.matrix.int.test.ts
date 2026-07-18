import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/api/app.js';
import { contentJobs } from '../../../src/db/schema/content-jobs.js';
import { publishJobEvents } from '../../../src/db/schema/publish-job-events.js';
import { publishJobs } from '../../../src/db/schema/publish-jobs.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';
import {
  clearTenantData,
  createContentJobForTest,
  createSourceVersionForTest,
  createTestScope,
  integrationDb,
  repositories
} from '../support/database.js';
import {
  buildCreatePublishJobInput,
  buildStyledHtmlRenderArtifact,
  createCompletedSourceContentJobForPublish
} from '../support/publish-jobs.js';

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

async function createQueuedSourceJob() {
  const scope = createTestScope();
  const source = await createSourceVersionForTest({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    transcriptText: 'Queued source transcript'
  });
  const queued = await createContentJobForTest({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    sourceVersionId: source.id,
    idempotencyKey: 'publish-api-queued-source',
    jobType: 'transcript-processing',
    requestSchemaVersion: '1.0'
  });

  return {
    scope,
    queued
  };
}

describe.sequential('publish API matrix integration', () => {
  it('rejects missing or malformed idempotency keys and invalid payloads', async () => {
    const { scope, contentJob } = await createCompletedSourceContentJobForPublish();
    const app = await createRealApp();

    try {
      const missingHeader = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': scope.tenantId
        },
        payload: {
          projectId: scope.projectId,
          sourceContentJobId: contentJob.id,
          outputFormat: 'pdf',
          publishMode: 'standard'
        }
      });
      expect(missingHeader.statusCode).toBe(400);

      const malformedHeader = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': scope.tenantId,
          'idempotency-key': '   '
        },
        payload: {
          projectId: scope.projectId,
          sourceContentJobId: contentJob.id,
          outputFormat: 'pdf',
          publishMode: 'standard'
        }
      });
      expect(malformedHeader.statusCode).toBe(400);

      const invalidBody = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': scope.tenantId,
          'idempotency-key': 'publish-invalid-body'
        },
        payload: {
          projectId: scope.projectId,
          sourceContentJobId: contentJob.id,
          outputFormat: 'docx',
          publishMode: 'standard'
        }
      });
      expect(invalidBody.statusCode).toBe(400);
    } finally {
      await app.close();
      await clearTenantData(scope.tenantId);
    }
  });

  it('handles idempotent replay and idempotency conflict deterministically', async () => {
    const { scope, contentJob } = await createCompletedSourceContentJobForPublish();
    const app = await createRealApp();

    try {
      const first = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': scope.tenantId,
          'idempotency-key': 'publish-api-idempotent-replay'
        },
        payload: {
          projectId: scope.projectId,
          sourceContentJobId: contentJob.id,
          outputFormat: 'pdf',
          publishMode: 'standard'
        }
      });
      expect(first.statusCode).toBe(202);

      const replay = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': scope.tenantId,
          'idempotency-key': 'publish-api-idempotent-replay'
        },
        payload: {
          projectId: scope.projectId,
          sourceContentJobId: contentJob.id,
          outputFormat: 'pdf',
          publishMode: 'standard'
        }
      });
      expect(replay.statusCode).toBe(202);
      expect(replay.json().id).toBe(first.json().id);

      const conflict = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': scope.tenantId,
          'idempotency-key': 'publish-api-idempotent-replay'
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

  it('returns controlled failures for missing source and ineligible source state', async () => {
    const missingScope = createTestScope();
    const ineligible = await createQueuedSourceJob();
    const app = await createRealApp();

    try {
      const missingSource = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': missingScope.tenantId,
          'idempotency-key': 'publish-api-missing-source'
        },
        payload: {
          projectId: missingScope.projectId,
          sourceContentJobId: 'job_01JZZZZZZZZZZZZZZZZZZZZZZZ',
          outputFormat: 'pdf',
          publishMode: 'standard'
        }
      });

      expect(missingSource.statusCode).toBe(404);

      const ineligibleSource = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': ineligible.scope.tenantId,
          'idempotency-key': 'publish-api-ineligible-source'
        },
        payload: {
          projectId: ineligible.scope.projectId,
          sourceContentJobId: ineligible.queued.id,
          outputFormat: 'pdf',
          publishMode: 'standard'
        }
      });

      expect(ineligibleSource.statusCode).toBe(409);
      expect(ineligibleSource.json().error.code).toBe(ErrorCode.PUBLISH_SOURCE_NOT_ELIGIBLE);
    } finally {
      await app.close();
      await clearTenantData(ineligible.scope.tenantId);
      await clearTenantData(missingScope.tenantId);
    }
  });

  it('rejects invalid styled artifact variants and protects cross-tenant visibility', async () => {
    const fixture = await createCompletedSourceContentJobForPublish();
    const otherTenant = createTestScope();
    const app = await createRealApp();

    try {
      const invalidVariants = [
        {
          key: 'invalid-checksum',
          mutator: (artifact: ReturnType<typeof buildStyledHtmlRenderArtifact>) => {
            artifact.metadata.checksumSha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
          },
          expectedCode: ErrorCode.PUBLISH_SOURCE_ARTIFACT_INVALID
        },
        {
          key: 'invalid-byte-size',
          mutator: (artifact: ReturnType<typeof buildStyledHtmlRenderArtifact>) => {
            artifact.metadata.byteSize = 1;
          },
          expectedCode: ErrorCode.PUBLISH_SOURCE_ARTIFACT_INVALID
        },
        {
          key: 'invalid-mime',
          mutator: (artifact: ReturnType<typeof buildStyledHtmlRenderArtifact>) => {
            artifact.metadata.mimeType = 'text/plain' as 'text/html; charset=utf-8';
          },
          expectedCodes: [ErrorCode.VALIDATION_ERROR, ErrorCode.PUBLISH_SOURCE_ARTIFACT_INVALID]
        },
        {
          key: 'invalid-extension',
          mutator: (artifact: ReturnType<typeof buildStyledHtmlRenderArtifact>) => {
            artifact.metadata.fileExtension = '.txt' as '.html';
          },
          expectedCodes: [ErrorCode.VALIDATION_ERROR, ErrorCode.PUBLISH_SOURCE_ARTIFACT_INVALID]
        },
        {
          key: 'invalid-representation',
          mutator: (artifact: ReturnType<typeof buildStyledHtmlRenderArtifact>) => {
            artifact.metadata.payloadRepresentation = 'structured-json' as 'styled-html';
          },
          expectedCodes: [ErrorCode.VALIDATION_ERROR, ErrorCode.PUBLISH_SOURCE_ARTIFACT_INVALID]
        }
      ];

      const normalizeExpectedCodes = (entry: {
        expectedCode?: string;
        expectedCodes?: string[];
      }): string[] => {
        if (entry.expectedCodes) {
          return entry.expectedCodes;
        }

        if (entry.expectedCode) {
          return [entry.expectedCode];
        }

        return [];
      };

      for (const variant of invalidVariants) {
        const artifact = buildStyledHtmlRenderArtifact('<!doctype html><title>Variant</title>');
        variant.mutator(artifact);

        await integrationDb
          .update(contentJobs)
          .set({
            result: {
              schemaVersion: '1.0',
              sourceVersionId: fixture.source.id,
              contentHash: fixture.source.contentHash,
              wordCount: 2,
              characterCount: 20,
              paragraphCount: 1,
              lineCount: 1,
              processedAt: '2026-01-01T00:00:00.000Z',
              renderArtifact: artifact
            }
          })
          .where(and(eq(contentJobs.tenantId, fixture.scope.tenantId), eq(contentJobs.id, fixture.contentJob.id)));

        const response = await app.inject({
          method: 'POST',
          url: '/v1/publish-jobs',
          headers: {
            'x-tenant-id': fixture.scope.tenantId,
            'idempotency-key': `publish-api-${variant.key}`
          },
          payload: {
            projectId: fixture.scope.projectId,
            sourceContentJobId: fixture.contentJob.id,
            outputFormat: 'pdf',
            publishMode: 'standard'
          }
        });

        expect([400, 409]).toContain(response.statusCode);
        expect(normalizeExpectedCodes(variant)).toContain(response.json().error.code);
      }

      const crossTenant = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': otherTenant.tenantId,
          'idempotency-key': 'publish-api-cross-tenant-source'
        },
        payload: {
          projectId: otherTenant.projectId,
          sourceContentJobId: fixture.contentJob.id,
          outputFormat: 'pdf',
          publishMode: 'standard'
        }
      });

      expect(crossTenant.statusCode).toBe(404);
    } finally {
      await app.close();
      await clearTenantData(fixture.scope.tenantId);
      await clearTenantData(otherTenant.tenantId);
    }
  });

  it('enforces tenant-scoped get/events and cancellation state rules', async () => {
    const fixture = await createCompletedSourceContentJobForPublish();
    const app = await createRealApp();

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': fixture.scope.tenantId,
          'idempotency-key': 'publish-api-cancel-rules'
        },
        payload: {
          projectId: fixture.scope.projectId,
          sourceContentJobId: fixture.contentJob.id,
          outputFormat: 'pdf',
          publishMode: 'standard'
        }
      });

      expect(created.statusCode).toBe(202);
      const publishJobId = created.json().id as string;

      const otherTenant = createTestScope();

      const getOtherTenant = await app.inject({
        method: 'GET',
        url: `/v1/publish-jobs/${publishJobId}`,
        headers: {
          'x-tenant-id': otherTenant.tenantId
        }
      });
      expect(getOtherTenant.statusCode).toBe(404);

      const eventsOtherTenant = await app.inject({
        method: 'GET',
        url: `/v1/publish-jobs/${publishJobId}/events`,
        headers: {
          'x-tenant-id': otherTenant.tenantId
        }
      });
      expect(eventsOtherTenant.statusCode).toBe(404);

      await integrationDb
        .update(publishJobs)
        .set({ status: 'waiting', stage: 'waiting-for-remote', nextPollAt: new Date('2026-01-01T00:00:02.000Z') })
        .where(and(eq(publishJobs.tenantId, fixture.scope.tenantId), eq(publishJobs.id, publishJobId)));

      const cancelWaiting = await app.inject({
        method: 'POST',
        url: `/v1/publish-jobs/${publishJobId}/cancel`,
        headers: {
          'x-tenant-id': fixture.scope.tenantId
        }
      });
      expect(cancelWaiting.statusCode).toBe(200);

      await integrationDb
        .update(publishJobs)
        .set({ status: 'processing', stage: 'submitting', leaseOwner: 'worker_cancel_guard', leaseExpiresAt: new Date('2026-01-01T00:10:00.000Z') })
        .where(and(eq(publishJobs.tenantId, fixture.scope.tenantId), eq(publishJobs.id, publishJobId)));

      const cancelProcessing = await app.inject({
        method: 'POST',
        url: `/v1/publish-jobs/${publishJobId}/cancel`,
        headers: {
          'x-tenant-id': fixture.scope.tenantId
        }
      });
      expect(cancelProcessing.statusCode).toBe(409);

      await integrationDb
        .update(publishJobs)
        .set({ status: 'completed', stage: 'completed', completedAt: new Date('2026-01-01T00:10:00.000Z') })
        .where(and(eq(publishJobs.tenantId, fixture.scope.tenantId), eq(publishJobs.id, publishJobId)));

      const cancelCompleted = await app.inject({
        method: 'POST',
        url: `/v1/publish-jobs/${publishJobId}/cancel`,
        headers: {
          'x-tenant-id': fixture.scope.tenantId
        }
      });
      expect(cancelCompleted.statusCode).toBe(409);

      await clearTenantData(otherTenant.tenantId);
    } finally {
      await app.close();
      await clearTenantData(fixture.scope.tenantId);
    }
  });

  it('returns redacted completed metadata with explicit URL-expiry flag', async () => {
    const fixture = await createCompletedSourceContentJobForPublish();
    const app = await createRealApp();

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': fixture.scope.tenantId,
          'idempotency-key': 'publish-api-redaction'
        },
        payload: {
          projectId: fixture.scope.projectId,
          sourceContentJobId: fixture.contentJob.id,
          outputFormat: 'pdf',
          publishMode: 'standard'
        }
      });

      const publishJobId = created.json().id as string;

      await integrationDb
        .update(publishJobs)
        .set({
          status: 'completed',
          stage: 'completed',
          completedAt: new Date('2026-01-01T00:30:00.000Z'),
          downloadMetadata: {
            fileName: 'guide.pdf',
            mimeType: 'application/pdf',
            byteSize: 123,
            checksumSha256: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            downloadUrl: 'https://downloads.example.test/guide.pdf',
            expiresAt: '2000-01-01T00:00:00.000Z'
          },
          remoteErrorCode: 'REMOTE_ERR',
          remoteErrorMessage: 'Remote raw detail should be hidden.'
        })
        .where(and(eq(publishJobs.tenantId, fixture.scope.tenantId), eq(publishJobs.id, publishJobId)));

      const response = await app.inject({
        method: 'GET',
        url: `/v1/publish-jobs/${publishJobId}`,
        headers: {
          'x-tenant-id': fixture.scope.tenantId
        }
      });

      expect(response.statusCode).toBe(200);
      const payload = response.json();

      expect(payload.downloadMetadata).toBeDefined();
      expect(payload.downloadMetadata.downloadUrl).toBeUndefined();
      expect(payload.downloadMetadata.expired).toBe(true);
      expect(payload.sourceArtifactSnapshot).toBeUndefined();
      expect(payload.requestFingerprint).toBeUndefined();
      expect(payload.remoteSubmissionIdempotencyKey).toBeUndefined();
      expect(payload.leaseOwner).toBeUndefined();
      expect(payload.leaseExpiresAt).toBeUndefined();
      expect(payload.remoteErrorCode).toBeUndefined();
      expect(payload.remoteErrorMessage).toBeUndefined();

      await integrationDb
        .update(publishJobs)
        .set({
          downloadMetadata: {
            fileName: 'guide.pdf',
            mimeType: 'application/pdf',
            expiresAt: '2999-01-01T00:00:00.000Z'
          }
        })
        .where(and(eq(publishJobs.tenantId, fixture.scope.tenantId), eq(publishJobs.id, publishJobId)));

      const unexpired = await app.inject({
        method: 'GET',
        url: `/v1/publish-jobs/${publishJobId}`,
        headers: {
          'x-tenant-id': fixture.scope.tenantId
        }
      });

      expect(unexpired.statusCode).toBe(200);
      expect(unexpired.json().downloadMetadata.expired).toBe(false);
    } finally {
      await app.close();
      await clearTenantData(fixture.scope.tenantId);
    }
  });

  it('records a single cancellation event across repeated cancel attempts', async () => {
    const fixture = await createCompletedSourceContentJobForPublish();
    const app = await createRealApp();

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/publish-jobs',
        headers: {
          'x-tenant-id': fixture.scope.tenantId,
          'idempotency-key': 'publish-api-repeat-cancel'
        },
        payload: {
          projectId: fixture.scope.projectId,
          sourceContentJobId: fixture.contentJob.id,
          outputFormat: 'pdf',
          publishMode: 'standard'
        }
      });
      const publishJobId = created.json().id as string;

      const firstCancel = await app.inject({
        method: 'POST',
        url: `/v1/publish-jobs/${publishJobId}/cancel`,
        headers: {
          'x-tenant-id': fixture.scope.tenantId
        }
      });
      expect(firstCancel.statusCode).toBe(200);

      const secondCancel = await app.inject({
        method: 'POST',
        url: `/v1/publish-jobs/${publishJobId}/cancel`,
        headers: {
          'x-tenant-id': fixture.scope.tenantId
        }
      });
      expect(secondCancel.statusCode).toBe(409);

      const cancellationEvents = await integrationDb
        .select()
        .from(publishJobEvents)
        .where(
          and(
            eq(publishJobEvents.tenantId, fixture.scope.tenantId),
            eq(publishJobEvents.publishJobId, publishJobId),
            eq(publishJobEvents.eventType, 'publish-cancelled')
          )
        );

      expect(cancellationEvents).toHaveLength(1);
    } finally {
      await app.close();
      await clearTenantData(fixture.scope.tenantId);
    }
  });
});
