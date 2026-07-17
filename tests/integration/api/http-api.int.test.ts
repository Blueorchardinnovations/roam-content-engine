import { describe, expect, it } from 'vitest';

import { createApp } from '../../../src/api/app.js';
import type { ContentJobRepository } from '../../../src/domain/repositories/content-job-repository.js';
import type { JobEventRepository } from '../../../src/domain/repositories/job-event-repository.js';
import type { SourceVersionRepository } from '../../../src/domain/repositories/source-version-repository.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';
import { PlatformError } from '../../../src/platform/shared/errors/index.js';
import { createCorrelationId } from '../../../src/platform/identity/ids/index.js';
import {
  clearTenantData,
  createSourceVersionForTest,
  createTestScope,
  repositories
} from '../support/database.js';
import { API_BODY_LIMIT_BYTES } from '../../../src/api/app.js';

const nodeEnv = 'test' as const;

function createRealApp(overrides?: {
  checkDatabaseHealth?: () => Promise<boolean>;
  bodyLimitBytes?: number;
}) {
  return createApp({
    sourceVersionRepository: repositories.sourceVersions,
    contentJobRepository: repositories.contentJobs,
    jobEventRepository: repositories.jobEvents,
    checkDatabaseHealth: overrides?.checkDatabaseHealth ?? (async () => true),
    nodeEnv,
    bodyLimitBytes: overrides?.bodyLimitBytes
  });
}

describe.sequential('HTTP API integration', () => {
  it('returns request and correlation headers for success, validation errors, and unknown errors', async () => {
    const scope = createTestScope();

    const app = await createRealApp();

    try {
      const success = await app.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(success.statusCode).toBe(200);
      expect(success.headers['x-request-id']).toBeDefined();
      expect(success.headers['x-correlation-id']).toBeDefined();

      const validation = await app.inject({
        method: 'GET',
        url: '/v1/source-versions/srcver_01JZZZZZZZZZZZZZZZZZZZZZZZ'
      });

      expect(validation.statusCode).toBe(400);
      expect(validation.headers['x-request-id']).toBeDefined();
      expect(validation.headers['x-correlation-id']).toBeDefined();
      expect(validation.json().error.correlationId).toBe(
        validation.headers['x-correlation-id']
      );

      const incomingCorrelationId = createCorrelationId();

      const source = await createSourceVersionForTest({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        transcriptText: 'header-assertion source'
      });

      const withIncomingCorrelation = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs',
        headers: {
          'x-tenant-id': scope.tenantId,
          'idempotency-key': 'header-assertion-job',
          'x-correlation-id': incomingCorrelationId
        },
        payload: {
          projectId: scope.projectId,
          sourceVersionId: source.id,
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        }
      });

      expect(withIncomingCorrelation.statusCode).toBe(202);
      expect(withIncomingCorrelation.headers['x-correlation-id']).toBe(
        incomingCorrelationId
      );

      const failingSourceRepository: SourceVersionRepository = {
        createImmutable: async () => {
          throw new Error('unexpected');
        },
        create: async () => {
          throw new Error('unexpected');
        },
        getById: async () => {
          throw new Error('unexpected');
        },
        findByHash: async () => null,
        listByProject: async () => []
      };

      const unknownApp = await createApp({
        sourceVersionRepository: failingSourceRepository,
        contentJobRepository: repositories.contentJobs,
        jobEventRepository: repositories.jobEvents,
        checkDatabaseHealth: async () => true,
        nodeEnv
      });

      try {
        const unknown = await unknownApp.inject({
          method: 'GET',
          url: '/v1/source-versions/srcver_01JZZZZZZZZZZZZZZZZZZZZZZZ',
          headers: {
            'x-tenant-id': scope.tenantId
          }
        });

        expect(unknown.statusCode).toBe(500);
        expect(unknown.headers['x-request-id']).toBeDefined();
        expect(unknown.headers['x-correlation-id']).toBeDefined();
        expect(unknown.json().error.correlationId).toBe(
          unknown.headers['x-correlation-id']
        );
      } finally {
        await unknownApp.close();
      }
    } finally {
      await app.close();
      await clearTenantData(scope.tenantId);
    }
  });

  it('health live returns 200 without touching database readiness dependency', async () => {
    let readinessChecks = 0;

    const app = await createRealApp({
      checkDatabaseHealth: async () => {
        readinessChecks += 1;
        return true;
      }
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'ok',
        service: 'roam-content-engine'
      });
      expect(readinessChecks).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('health ready returns 200 when database is available', async () => {
    const app = await createRealApp({
      checkDatabaseHealth: async () => true
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'ready',
        service: 'roam-content-engine',
        database: 'available'
      });
    } finally {
      await app.close();
    }
  });

  it('health ready returns 503 when database is unavailable', async () => {
    const app = await createRealApp({
      checkDatabaseHealth: async () => false
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready'
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        status: 'not-ready',
        service: 'roam-content-engine',
        database: 'unavailable'
      });
    } finally {
      await app.close();
    }
  });

  it('health endpoints do not require tenant header', async () => {
    const app = await createRealApp();

    try {
      const live = await app.inject({ method: 'GET', url: '/health/live' });
      const ready = await app.inject({ method: 'GET', url: '/health/ready' });

      expect(live.statusCode).toBe(200);
      expect(ready.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('missing tenant header returns documented validation response', async () => {
    const app = await createRealApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/source-versions/srcver_01JZZZZZZZZZZZZZZZZZZZZZZZ'
      });

      const payload = response.json();

      expect(response.statusCode).toBe(400);
      expect(payload.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(payload.error.message).toContain('x-tenant-id header is required');
      expect(payload.error.requestId.length).toBeGreaterThan(0);
      expect(payload.error.correlationId.startsWith('corr_')).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('invalid tenant header returns 400', async () => {
    const app = await createRealApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/source-versions/srcver_01JZZZZZZZZZZZZZZZZZZZZZZZ',
        headers: {
          'x-tenant-id': 'bad-tenant'
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe(ErrorCode.VALIDATION_ERROR);
    } finally {
      await app.close();
    }
  });

  it('source version lifecycle validates input, enforces schema strictness, and serializes dates', async () => {
    const scope = createTestScope();
    const app = await createRealApp();

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/v1/source-versions',
        headers: {
          'x-tenant-id': scope.tenantId
        },
        payload: {
          projectId: scope.projectId,
          transcriptText: 'Transcript body for source version API test',
          sourceType: 'transcript'
        }
      });

      expect(created.statusCode).toBe(201);
      expect(created.json().id.startsWith('srcver_')).toBe(true);
      expect(created.json().tenantId).toBe(scope.tenantId);
      expect(created.json().transcriptText).toBeUndefined();
      expect(new Date(created.json().createdAt).toString()).not.toBe('Invalid Date');

      const sourceVersionId = created.json().id as string;

      const fetched = await app.inject({
        method: 'GET',
        url: `/v1/source-versions/${sourceVersionId}`,
        headers: {
          'x-tenant-id': scope.tenantId
        }
      });

      expect(fetched.statusCode).toBe(200);
      expect(fetched.json().id).toBe(sourceVersionId);
      expect(new Date(fetched.json().createdAt).toString()).not.toBe('Invalid Date');

      const emptyTranscript = await app.inject({
        method: 'POST',
        url: '/v1/source-versions',
        headers: {
          'x-tenant-id': scope.tenantId
        },
        payload: {
          projectId: scope.projectId,
          transcriptText: '  '
        }
      });

      expect(emptyTranscript.statusCode).toBe(400);

      const badProject = await app.inject({
        method: 'POST',
        url: '/v1/source-versions',
        headers: {
          'x-tenant-id': scope.tenantId
        },
        payload: {
          projectId: 'project-invalid',
          transcriptText: 'ok'
        }
      });

      expect(badProject.statusCode).toBe(400);

      const unknownField = await app.inject({
        method: 'POST',
        url: '/v1/source-versions',
        headers: {
          'x-tenant-id': scope.tenantId
        },
        payload: {
          projectId: scope.projectId,
          transcriptText: 'ok',
          tenantId: 'tenant_override_attempt'
        }
      });

      expect(unknownField.statusCode).toBe(400);
      expect(unknownField.json().error.details.issues).toBeDefined();
    } finally {
      await app.close();
      await clearTenantData(scope.tenantId);
    }
  });

  it('returns 400 for invalid source-version route ID format', async () => {
    const scope = createTestScope();
    const app = await createRealApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/source-versions/not-a-source-version-id',
        headers: {
          'x-tenant-id': scope.tenantId
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe(ErrorCode.VALIDATION_ERROR);
    } finally {
      await app.close();
      await clearTenantData(scope.tenantId);
    }
  });

  it('oversized source version payload returns 413', async () => {
    const scope = createTestScope();
    const app = await createRealApp({ bodyLimitBytes: 256 });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/source-versions',
        headers: {
          'x-tenant-id': scope.tenantId
        },
        payload: {
          projectId: scope.projectId,
          transcriptText: 'x'.repeat(10_000)
        }
      });

      expect(response.statusCode).toBe(413);
      expect(response.json().error.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
    } finally {
      await app.close();
      await clearTenantData(scope.tenantId);
    }
  });

  it('default payload limit rejects request body over 1 MiB with unified error response', async () => {
    const scope = createTestScope();
    const app = await createRealApp();

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/source-versions',
        headers: {
          'x-tenant-id': scope.tenantId
        },
        payload: {
          projectId: scope.projectId,
          transcriptText: 'x'.repeat(API_BODY_LIMIT_BYTES + 1)
        }
      });

      expect(response.statusCode).toBe(413);
      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.json()).toMatchObject({
        error: {
          code: ErrorCode.PAYLOAD_TOO_LARGE,
          message: expect.any(String),
          requestId: expect.any(String),
          correlationId: expect.any(String)
        }
      });
    } finally {
      await app.close();
      await clearTenantData(scope.tenantId);
    }
  });

  it('content job lifecycle handles idempotency, correlation IDs, retrieval, events, and cancellation', async () => {
    const tenantA = createTestScope();
    const tenantB = createTestScope();
    const app = await createRealApp();

    try {
      const sourceA = await createSourceVersionForTest({
        tenantId: tenantA.tenantId,
        projectId: tenantA.projectId,
        transcriptText: 'Tenant A source transcript'
      });

      const createWithoutKey = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs',
        headers: {
          'x-tenant-id': tenantA.tenantId
        },
        payload: {
          projectId: tenantA.projectId,
          sourceVersionId: sourceA.id,
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        }
      });
      expect(createWithoutKey.statusCode).toBe(400);

      const createBlankKey = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs',
        headers: {
          'x-tenant-id': tenantA.tenantId,
          'idempotency-key': '   '
        },
        payload: {
          projectId: tenantA.projectId,
          sourceVersionId: sourceA.id,
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        }
      });
      expect(createBlankKey.statusCode).toBe(400);

      const createInvalidSourceVersion = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs',
        headers: {
          'x-tenant-id': tenantA.tenantId,
          'idempotency-key': 'idem-invalid-source-version'
        },
        payload: {
          projectId: tenantA.projectId,
          sourceVersionId: 'invalid-source-version-id',
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        }
      });
      expect(createInvalidSourceVersion.statusCode).toBe(400);

      const sourceB = await createSourceVersionForTest({
        tenantId: tenantB.tenantId,
        projectId: tenantB.projectId,
        transcriptText: 'Tenant B source transcript'
      });

      const createCrossTenant = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs',
        headers: {
          'x-tenant-id': tenantA.tenantId,
          'idempotency-key': 'idem-cross-tenant-source'
        },
        payload: {
          projectId: tenantA.projectId,
          sourceVersionId: sourceB.id,
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        }
      });
      expect(createCrossTenant.statusCode).toBe(404);

      const generatedCorrelationCreate = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs',
        headers: {
          'x-tenant-id': tenantA.tenantId,
          'idempotency-key': 'idem-generated-correlation'
        },
        payload: {
          projectId: tenantA.projectId,
          sourceVersionId: sourceA.id,
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        }
      });

      expect(generatedCorrelationCreate.statusCode).toBe(202);
      expect(generatedCorrelationCreate.headers['x-correlation-id']).toBeDefined();
      expect(String(generatedCorrelationCreate.headers['x-correlation-id']).startsWith('corr_')).toBe(true);

      const providedCorrelationId = createCorrelationId();
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs',
        headers: {
          'x-tenant-id': tenantA.tenantId,
          'idempotency-key': 'idem-main',
          'x-correlation-id': providedCorrelationId
        },
        payload: {
          projectId: tenantA.projectId,
          sourceVersionId: sourceA.id,
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        }
      });

      expect(createResponse.statusCode).toBe(202);
      expect(createResponse.headers['x-correlation-id']).toBe(providedCorrelationId);
      expect(createResponse.json().correlationId).toBe(providedCorrelationId);

      const jobId = createResponse.json().id as string;

      const replayResponse = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs',
        headers: {
          'x-tenant-id': tenantA.tenantId,
          'idempotency-key': 'idem-main',
          'x-correlation-id': providedCorrelationId
        },
        payload: {
          projectId: tenantA.projectId,
          sourceVersionId: sourceA.id,
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        }
      });

      expect(replayResponse.statusCode).toBe(202);
      expect(replayResponse.json().id).toBe(jobId);

      const sourceForConflict = await createSourceVersionForTest({
        tenantId: tenantA.tenantId,
        projectId: tenantA.projectId,
        transcriptText: 'source-for-idempotency-conflict'
      });

      const reusedKeyResponse = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs',
        headers: {
          'x-tenant-id': tenantA.tenantId,
          'idempotency-key': 'idem-main',
          'x-correlation-id': providedCorrelationId
        },
        payload: {
          projectId: tenantA.projectId,
          sourceVersionId: sourceForConflict.id,
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        }
      });

      expect(reusedKeyResponse.statusCode).toBe(409);
      expect(reusedKeyResponse.json().error.code).toBe(ErrorCode.IDEMPOTENCY_KEY_REUSED);

      const invalidCorrelationHeader = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs',
        headers: {
          'x-tenant-id': tenantA.tenantId,
          'idempotency-key': 'idem-invalid-correlation',
          'x-correlation-id': 'bad-correlation'
        },
        payload: {
          projectId: tenantA.projectId,
          sourceVersionId: sourceA.id,
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        }
      });
      expect(invalidCorrelationHeader.statusCode).toBe(400);

      const bodyCorrelationRejected = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs',
        headers: {
          'x-tenant-id': tenantA.tenantId,
          'idempotency-key': 'idem-body-correlation'
        },
        payload: {
          projectId: tenantA.projectId,
          sourceVersionId: sourceA.id,
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0',
          correlationId: createCorrelationId()
        }
      });
      expect(bodyCorrelationRejected.statusCode).toBe(400);

      const getResponse = await app.inject({
        method: 'GET',
        url: `/v1/content-jobs/${jobId}`,
        headers: {
          'x-tenant-id': tenantA.tenantId
        }
      });

      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.json().id).toBe(jobId);
      expect(getResponse.json().requestFingerprint).toBeUndefined();
      expect(new Date(getResponse.json().createdAt).toString()).not.toBe('Invalid Date');
      expect(new Date(getResponse.json().updatedAt).toString()).not.toBe('Invalid Date');

      const missingJob = await app.inject({
        method: 'GET',
        url: '/v1/content-jobs/job_01JZZZZZZZZZZZZZZZZZZZZZZZ',
        headers: {
          'x-tenant-id': tenantA.tenantId
        }
      });
      expect(missingJob.statusCode).toBe(404);

      const invalidJobGet = await app.inject({
        method: 'GET',
        url: '/v1/content-jobs/not-a-job-id',
        headers: {
          'x-tenant-id': tenantA.tenantId
        }
      });
      expect(invalidJobGet.statusCode).toBe(400);
      expect(invalidJobGet.json().error.code).toBe(ErrorCode.VALIDATION_ERROR);

      const invalidJobEvents = await app.inject({
        method: 'GET',
        url: '/v1/content-jobs/not-a-job-id/events',
        headers: {
          'x-tenant-id': tenantA.tenantId
        }
      });
      expect(invalidJobEvents.statusCode).toBe(400);
      expect(invalidJobEvents.json().error.code).toBe(ErrorCode.VALIDATION_ERROR);

      const invalidJobCancel = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs/not-a-job-id/cancel',
        headers: {
          'x-tenant-id': tenantA.tenantId
        }
      });
      expect(invalidJobCancel.statusCode).toBe(400);
      expect(invalidJobCancel.json().error.code).toBe(ErrorCode.VALIDATION_ERROR);

      const crossTenantJobRead = await app.inject({
        method: 'GET',
        url: `/v1/content-jobs/${jobId}`,
        headers: {
          'x-tenant-id': tenantB.tenantId
        }
      });
      expect(crossTenantJobRead.statusCode).toBe(404);

      const cancelled = await app.inject({
        method: 'POST',
        url: `/v1/content-jobs/${jobId}/cancel`,
        headers: {
          'x-tenant-id': tenantA.tenantId
        }
      });

      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.json().status).toBe('cancelled');

      const crossTenantCancel = await app.inject({
        method: 'POST',
        url: `/v1/content-jobs/${jobId}/cancel`,
        headers: {
          'x-tenant-id': tenantB.tenantId
        }
      });
      expect(crossTenantCancel.statusCode).toBe(404);

      const eventsResponse = await app.inject({
        method: 'GET',
        url: `/v1/content-jobs/${jobId}/events`,
        headers: {
          'x-tenant-id': tenantA.tenantId
        }
      });

      expect(eventsResponse.statusCode).toBe(200);
      expect(eventsResponse.json().jobId).toBe(jobId);
      expect(Array.isArray(eventsResponse.json().events)).toBe(true);
      expect(eventsResponse.json().events.length).toBeGreaterThanOrEqual(2);
      expect(eventsResponse.json().events[0].eventType).toBe('job-created');
      expect(eventsResponse.json().events[1].eventType).toBe('job-cancelled');
      expect(eventsResponse.json().events[1].priorStatus).toBe('queued');
      expect(eventsResponse.json().events[1].newStatus).toBe('cancelled');
      expect(new Date(eventsResponse.json().events[0].createdAt).toString()).not.toBe('Invalid Date');

      const crossTenantEvents = await app.inject({
        method: 'GET',
        url: `/v1/content-jobs/${jobId}/events`,
        headers: {
          'x-tenant-id': tenantB.tenantId
        }
      });
      expect(crossTenantEvents.statusCode).toBe(404);

      const sourceCrossTenantGet = await app.inject({
        method: 'GET',
        url: `/v1/source-versions/${sourceA.id}`,
        headers: {
          'x-tenant-id': tenantB.tenantId
        }
      });
      expect(sourceCrossTenantGet.statusCode).toBe(404);

      const malformedJson = await app.inject({
        method: 'POST',
        url: '/v1/source-versions',
        headers: {
          'x-tenant-id': tenantA.tenantId,
          'content-type': 'application/json'
        },
        payload: '{"projectId":'
      });

      expect(malformedJson.statusCode).toBe(400);
      expect(malformedJson.json().error.code).toBe(ErrorCode.INVALID_JSON);
    } finally {
      await app.close();
      await clearTenantData(tenantA.tenantId);
      await clearTenantData(tenantB.tenantId);
    }
  });

  it('cancellation invalid state returns 409 and records cancellation event for cancellable job', async () => {
    const scope = createTestScope();
    const app = await createRealApp();

    try {
      const source = await createSourceVersionForTest({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        transcriptText: 'cancellation-path source'
      });

      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/content-jobs',
        headers: {
          'x-tenant-id': scope.tenantId,
          'idempotency-key': 'cancel-state-main'
        },
        payload: {
          projectId: scope.projectId,
          sourceVersionId: source.id,
          jobType: 'transcript-processing',
          requestSchemaVersion: '1.0'
        }
      });

      expect(createResponse.statusCode).toBe(202);
      const jobId = createResponse.json().id as string;

      const cancelled = await app.inject({
        method: 'POST',
        url: `/v1/content-jobs/${jobId}/cancel`,
        headers: {
          'x-tenant-id': scope.tenantId
        }
      });

      expect(cancelled.statusCode).toBe(200);

      const eventsAfterCancel = await app.inject({
        method: 'GET',
        url: `/v1/content-jobs/${jobId}/events`,
        headers: {
          'x-tenant-id': scope.tenantId
        }
      });

      expect(
        eventsAfterCancel
          .json()
          .events.some((event: { eventType: string }) => event.eventType === 'job-cancelled')
      ).toBe(true);

      const sourceForCompleted = await createSourceVersionForTest({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        transcriptText: 'cancellation-invalid-state source'
      });

      const completedJob = await repositories.contentJobs.createOrGetIdempotent({
        tenantId: scope.tenantId,
        projectId: scope.projectId,
        sourceVersionId: sourceForCompleted.id,
        idempotencyKey: 'cancel-state-completed',
        jobType: 'transcript-processing',
        requestSchemaVersion: '1.0'
      });

      await repositories.contentJobs.claim(scope.tenantId, completedJob.id);

      await repositories.contentJobs.complete(scope.tenantId, completedJob.id, {
        schemaVersion: '1.0',
        sourceVersionId: sourceForCompleted.id,
        contentHash: sourceForCompleted.contentHash,
        wordCount: 2,
        characterCount: 8,
        paragraphCount: 1,
        lineCount: 1,
        processedAt: new Date().toISOString()
      });

      const cancelCompleted = await app.inject({
        method: 'POST',
        url: `/v1/content-jobs/${completedJob.id}/cancel`,
        headers: {
          'x-tenant-id': scope.tenantId
        }
      });

      expect(cancelCompleted.statusCode).toBe(409);
      expect(cancelCompleted.json().error.code).toBe(ErrorCode.JOB_ALREADY_COMPLETED);
    } finally {
      await app.close();
      await clearTenantData(scope.tenantId);
    }
  });

  it('maps unknown errors to 500 without stack traces and maps database unavailable to 503', async () => {
    const throwingSourceRepository: SourceVersionRepository = {
      createImmutable: async () => {
        throw new PlatformError(
          ErrorCode.DATABASE_UNAVAILABLE,
          'database down'
        );
      },
      create: async () => {
        throw new PlatformError(
          ErrorCode.DATABASE_UNAVAILABLE,
          'database down'
        );
      },
      getById: async () => {
        throw new Error('unexpected throw');
      },
      findByHash: async () => null,
      listByProject: async () => []
    };

    const passthroughContentJobRepository: ContentJobRepository = repositories.contentJobs;
    const passthroughJobEventRepository: JobEventRepository = repositories.jobEvents;

    const app = await createApp({
      sourceVersionRepository: throwingSourceRepository,
      contentJobRepository: passthroughContentJobRepository,
      jobEventRepository: passthroughJobEventRepository,
      checkDatabaseHealth: async () => true,
      nodeEnv
    });

    const scope = createTestScope();

    try {
      const createSourceVersion = await app.inject({
        method: 'POST',
        url: '/v1/source-versions',
        headers: {
          'x-tenant-id': scope.tenantId
        },
        payload: {
          projectId: scope.projectId,
          transcriptText: 'database unavailable path'
        }
      });

      expect(createSourceVersion.statusCode).toBe(503);
      expect(createSourceVersion.json().error.code).toBe(ErrorCode.DATABASE_UNAVAILABLE);

      const unknownFailure = await app.inject({
        method: 'GET',
        url: '/v1/source-versions/srcver_01JZZZZZZZZZZZZZZZZZZZZZZZ',
        headers: {
          'x-tenant-id': scope.tenantId
        }
      });

      expect(unknownFailure.statusCode).toBe(500);
      expect(unknownFailure.json().error.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      expect(JSON.stringify(unknownFailure.json())).not.toContain('stack');
    } finally {
      await app.close();
      await clearTenantData(scope.tenantId);
    }
  });
});
