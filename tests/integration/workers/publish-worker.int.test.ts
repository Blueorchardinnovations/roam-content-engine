import { describe, expect, it, vi } from 'vitest';

import { PublishJobExecutor } from '../../../src/application/publish-jobs/publish-job-executor.js';
import { DatabasePublishJobSource } from '../../../src/infrastructure/publish-jobs/index.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';
import {
  clearTenantData,
  integrationDb,
  repositories
} from '../support/database.js';
import {
  buildCreatePublishJobInput,
  createCompletedSourceContentJobForPublish
} from '../support/publish-jobs.js';

describe.sequential('publish worker integration', () => {
  it('submits queued publish jobs through the dedicated source and executor', async () => {
    const { scope, contentJob } = await createCompletedSourceContentJobForPublish();

    try {
      const publishJob = await repositories.publishJobs.createOrGetIdempotent(
        buildCreatePublishJobInput({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          contentJob,
          idempotencyKey: 'publish-worker-submit'
        })
      );

      let currentTime = new Date('2026-01-01T00:00:00.000Z');
      const source = new DatabasePublishJobSource(integrationDb);
      const executor = new PublishJobExecutor({
        source,
        repository: repositories.publishJobs,
        publishEngineClient: {
          submitRender: vi.fn(async () => ({
            jobId: 'remote_job_int_1',
            state: 'accepted',
            outputFormat: 'pdf',
            correlationId: 'remote-corr-int-1'
          })),
          submitCtaRender: vi.fn(async () => ({
            jobId: 'remote_job_int_1',
            state: 'accepted',
            outputFormat: 'pdf',
            correlationId: 'remote-corr-int-1'
          })),
          getJob: vi.fn(async () => ({
            jobId: 'remote_job_int_1',
            state: 'accepted',
            outputFormat: 'pdf'
          })),
          getDownload: vi.fn(async () => ({
            jobId: 'remote_job_int_1',
            fileName: 'guide.pdf',
            mimeType: 'application/pdf'
          })),
          waitForJob: vi.fn()
        },
        now: () => currentTime,
        pollIntervalMs: 1_000,
        leaseDurationMs: 30_000,
        heartbeatIntervalMs: 10_000,
        maxConsecutiveFailures: 3,
        retryPolicy: {
          baseDelayMs: 1_000,
          maxDelayMs: 60_000,
          maxAttempts: 3
        },
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn()
        }
      });

      const claim = await source.acquireNext({
        workerId: 'worker_publish_int_submit',
        leaseDurationMs: 30_000,
        now: currentTime
      });

      expect(claim?.publishJobId).toBe(publishJob.id);

      const outcome = await executor.execute(claim!, new AbortController().signal);

      expect(outcome).toBe('waiting');

      const persisted = await repositories.publishJobs.getById(scope.tenantId, publishJob.id);
      expect(persisted?.status).toBe('waiting');
      expect(persisted?.remoteJobId).toBe('remote_job_int_1');
    } finally {
      await clearTenantData(scope.tenantId);
    }
  });

  it('completes waiting publish jobs on successful remote poll and download', async () => {
    const { scope, contentJob } = await createCompletedSourceContentJobForPublish();

    try {
      const publishJob = await repositories.publishJobs.createOrGetIdempotent(
        buildCreatePublishJobInput({
          tenantId: scope.tenantId,
          projectId: scope.projectId,
          contentJob,
          idempotencyKey: 'publish-worker-complete'
        })
      );

      let currentTime = new Date('2026-01-01T00:00:00.000Z');
      const source = new DatabasePublishJobSource(integrationDb);
      const client = {
        submitRender: vi.fn(async () => ({
          jobId: 'remote_job_int_2',
          state: 'accepted' as const,
          outputFormat: 'pdf' as const,
          correlationId: 'remote-corr-int-2'
        })),
        submitCtaRender: vi.fn(async () => ({
          jobId: 'remote_job_int_2',
          state: 'accepted' as const,
          outputFormat: 'pdf' as const,
          correlationId: 'remote-corr-int-2'
        })),
        getJob: vi.fn(async () => ({
          jobId: 'remote_job_int_2',
          state: 'succeeded' as const,
          outputFormat: 'pdf' as const,
          correlationId: 'remote-corr-int-2'
        })),
        getDownload: vi.fn(async () => ({
          jobId: 'remote_job_int_2',
          fileName: 'guide.pdf',
          mimeType: 'application/pdf',
          checksumSha256: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        })),
        waitForJob: vi.fn()
      };

      const executor = new PublishJobExecutor({
        source,
        repository: repositories.publishJobs,
        publishEngineClient: client,
        now: () => currentTime,
        pollIntervalMs: 1_000,
        leaseDurationMs: 30_000,
        heartbeatIntervalMs: 10_000,
        maxConsecutiveFailures: 3,
        retryPolicy: {
          baseDelayMs: 1_000,
          maxDelayMs: 60_000,
          maxAttempts: 3
        },
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn()
        }
      });

      const submitClaim = await source.acquireNext({
        workerId: 'worker_publish_int_complete',
        leaseDurationMs: 30_000,
        now: currentTime
      });

      expect(await executor.execute(submitClaim!, new AbortController().signal)).toBe('waiting');

      currentTime = new Date('2026-01-01T00:00:02.000Z');

      const pollClaim = await source.acquireNext({
        workerId: 'worker_publish_int_complete',
        leaseDurationMs: 30_000,
        now: currentTime
      });

      expect(pollClaim?.publishJobId).toBe(publishJob.id);
      expect(await executor.execute(pollClaim!, new AbortController().signal)).toBe('completed');

      const persisted = await repositories.publishJobs.getById(scope.tenantId, publishJob.id);
      expect(persisted?.status).toBe('completed');
      expect(persisted?.downloadMetadata?.fileName).toBe('guide.pdf');
      expect(persisted?.remoteState).toBe('succeeded');
      expect(persisted?.remoteErrorCode).toBeNull();
    } finally {
      await clearTenantData(scope.tenantId);
    }
  });
});