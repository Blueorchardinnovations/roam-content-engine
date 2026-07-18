import { describe, expect, it, vi } from 'vitest';

import { PublishJobExecutor } from '../../../src/application/publish-jobs/publish-job-executor.js';
import type { ClaimedPublishJob, PublishJob } from '../../../src/domain/publish-jobs/index.js';
import type { PublishJobRepository } from '../../../src/domain/repositories/publish-job-repository.js';
import type { PublishEngineClient } from '../../../src/infrastructure/publish-engine/publish-engine-client.js';
import { PublishEngineTransportError } from '../../../src/infrastructure/publish-engine/publish-engine-errors.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';

const now = new Date('2026-01-01T00:00:00.000Z');

function buildPublishJob(overrides?: Partial<PublishJob>): PublishJob {
  return {
    id: 'pjob_01TEST00000000000000000000',
    tenantId: 'tenant_01TEST000000000000000000' as const,
    projectId: 'project_01TEST0000000000000000' as const,
    sourceContentJobId: 'job_01TEST00000000000000000000' as const,
    sourceRenderArtifactId: 'artifact_styled_1',
    sourceArtifactChecksumSha256: 'd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2',
    sourceArtifactByteSize: 38,
    sourceArtifactSnapshot: {
      artifactId: 'artifact_styled_1',
      payloadRepresentation: 'styled-html',
      mimeType: 'text/html; charset=utf-8',
      fileExtension: '.html',
      payload: '<!doctype html><title>Styled</title>',
      byteSize: 36,
      checksumSha256: '51b724303381af22019511dc65b2857e1ff72ab00f2da4322562df5b4b8a9976'
    },
    publishMode: 'standard',
    outputFormat: 'pdf',
    renderOptions: {
      densityId: 'compact',
      includeToc: true
    },
    publicationMetadata: {
      title: 'Test Publication',
      language: 'en'
    },
    status: 'processing',
    stage: 'submitting',
    idempotencyKey: 'publish-idem-1',
    requestFingerprint: 'fingerprint-1',
    remoteSubmissionIdempotencyKey: 'publish::submit:fingerprint-1',
    remoteJobId: null,
    remoteState: null,
    remoteCorrelationId: null,
    remoteErrorCode: null,
    remoteErrorMessage: null,
    downloadMetadata: null,
    attemptCount: 1,
    consecutiveFailureCount: 0,
    pollCount: 0,
    correlationId: 'corr_01TEST0000000000000000000' as const,
    leaseOwner: 'worker_publish_test_1',
    leaseExpiresAt: new Date(now.getTime() + 30_000),
    heartbeatAt: now,
    nextAttemptAt: now,
    nextPollAt: null,
    submittedAt: null,
    lastPolledAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function buildClaim(job: PublishJob): ClaimedPublishJob {
  return {
    tenantId: job.tenantId,
    publishJobId: job.id,
    workerId: job.leaseOwner ?? 'worker_publish_test_1',
    leaseExpiresAt: job.leaseExpiresAt ?? new Date(now.getTime() + 30_000)
  };
}

function createRepository(job: PublishJob) {
  const repository = {
    createOrGetIdempotent: vi.fn(),
    getById: vi.fn(async () => job),
    listEvents: vi.fn(async () => []),
    claimNextDue: vi.fn(),
    heartbeat: vi.fn(),
    setStage: vi.fn(async () => job),
    recordSubmission: vi.fn(async () => ({
      ...job,
      status: 'waiting' as const,
      stage: 'waiting-for-remote' as const,
      remoteJobId: 'remote_job_1',
      remoteState: 'accepted',
      remoteCorrelationId: 'remote-corr-1',
      nextAttemptAt: null,
      nextPollAt: new Date(now.getTime() + 2_000),
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      submittedAt: now
    })),
    recordRemoteWaiting: vi.fn(async () => ({
      ...job,
      status: 'waiting' as const,
      stage: 'waiting-for-remote' as const,
      pollCount: job.pollCount + 1,
      lastPolledAt: now,
      nextPollAt: new Date(now.getTime() + 2_000),
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null
    })),
    recordRetry: vi.fn(async () => ({
      ...job,
      status: 'retrying' as const,
      stage: 'failed' as const,
      nextAttemptAt: new Date(now.getTime() + 1_000)
    })),
    complete: vi.fn(async () => ({
      ...job,
      status: 'completed' as const,
      stage: 'completed' as const,
      completedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null
    })),
    fail: vi.fn(async () => ({
      ...job,
      status: 'failed' as const,
      stage: 'failed' as const,
      remoteErrorCode: 'ERR',
      remoteErrorMessage: 'failed',
      completedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null
    })),
    markRemoteCancelled: vi.fn(async () => ({
      ...job,
      status: 'cancelled' as const,
      stage: 'cancelled' as const,
      cancelledAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null
    })),
    cancel: vi.fn(),
    recoverStaleLeases: vi.fn(async () => 0)
  } satisfies Partial<PublishJobRepository>;

  return repository as PublishJobRepository & typeof repository;
}

function createClient() {
  const client = {
    submitRender: vi.fn(async () => ({
      jobId: 'remote_job_1',
      state: 'accepted' as const,
      outputFormat: 'pdf' as const,
      correlationId: 'remote-corr-1'
    })),
    submitCtaRender: vi.fn(async () => ({
      jobId: 'remote_job_cta_1',
      state: 'accepted' as const,
      outputFormat: 'pdf' as const,
      correlationId: 'remote-corr-cta-1'
    })),
    getJob: vi.fn(async () => ({
      jobId: 'remote_job_1',
      state: 'succeeded' as const,
      outputFormat: 'pdf' as const,
      correlationId: 'remote-corr-1'
    })),
    getDownload: vi.fn(async () => ({
      jobId: 'remote_job_1',
      fileName: 'guide.pdf',
      mimeType: 'application/pdf',
      byteSize: 1234,
      checksumSha256: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      downloadUrl: 'https://downloads.example.test/guide.pdf',
      expiresAt: '2026-01-01T01:00:00.000Z'
    })),
    waitForJob: vi.fn()
  } satisfies PublishEngineClient;

  return client;
}

function createExecutorHarness(overrides?: {
  job?: PublishJob;
  repository?: PublishJobRepository;
  client?: PublishEngineClient;
  renewLease?: ClaimedPublishJob | null;
  now?: Date;
  maxConsecutiveFailures?: number;
}) {
  const job = overrides?.job ?? buildPublishJob();
  const repository = overrides?.repository ?? createRepository(job);
  const client = overrides?.client ?? createClient();
  const source = {
    acquireNext: vi.fn(),
    renewLease: vi.fn(async () => overrides?.renewLease ?? buildClaim(job))
  };

  const executor = new PublishJobExecutor({
    source,
    repository,
    publishEngineClient: client,
    now: () => overrides?.now ?? now,
    pollIntervalMs: 2_000,
    leaseDurationMs: 30_000,
    heartbeatIntervalMs: 100,
    maxConsecutiveFailures: overrides?.maxConsecutiveFailures ?? 3,
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

  return {
    executor,
    job,
    claim: buildClaim(job),
    repository,
    client,
    source
  };
}

describe('publish job executor', () => {
  it('submits standard publish jobs and persists waiting state', async () => {
    const { executor, claim, client, repository } = createExecutorHarness();

    const outcome = await executor.execute(claim, new AbortController().signal);

    expect(outcome).toBe('waiting');
    expect(client.submitRender).toHaveBeenCalledTimes(1);
    expect(client.submitCtaRender).not.toHaveBeenCalled();

    const request = vi.mocked(client.submitRender).mock.calls[0]?.[0];
    expect(request?.publication).toEqual({
      title: 'Test Publication',
      language: 'en'
    });
    expect(request?.renderOptions).toEqual({
      densityId: 'compact',
      includeToc: true
    });

    expect(repository.recordSubmission).toHaveBeenCalledTimes(1);
  });

  it('submits CTA publish jobs through the dedicated client method', async () => {
    const job = buildPublishJob({
      publishMode: 'cta-guide',
      publicationMetadata: {
        publicationId: 'pub-1',
        title: 'CTA Guide',
        language: 'en',
        theme: 'light',
        audience: 'operators'
      }
    });

    const { executor, claim, client } = createExecutorHarness({ job });

    const outcome = await executor.execute(claim, new AbortController().signal);

    expect(outcome).toBe('waiting');
    expect(client.submitCtaRender).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.submitCtaRender).mock.calls[0]?.[0].publication).toEqual({
      publicationId: 'pub-1',
      title: 'CTA Guide',
      language: 'en',
      theme: 'light',
      audience: 'operators'
    });
  });

  it('schedules retry on retryable submission transport failures', async () => {
    const client = createClient();
    client.submitRender = vi.fn(async () => {
      throw new PublishEngineTransportError('temporary upstream failure');
    });

    const { executor, claim, repository } = createExecutorHarness({ client });

    const outcome = await executor.execute(claim, new AbortController().signal);

    expect(outcome).toBe('retry-scheduled');
    expect(repository.recordRetry).toHaveBeenCalledTimes(1);
    expect(repository.fail).not.toHaveBeenCalled();
    expect(vi.mocked(repository.recordRetry).mock.calls[0]?.[0]).toMatchObject({
      errorCode: ErrorCode.PUBLISH_ENGINE_TRANSPORT_ERROR
    });
  });

  it('completes published jobs after successful remote polling and download retrieval', async () => {
    const job = buildPublishJob({
      stage: 'waiting-for-remote',
      remoteJobId: 'remote_job_1',
      remoteState: 'processing',
      submittedAt: new Date('2026-01-01T00:00:10.000Z'),
      nextAttemptAt: null,
      nextPollAt: now
    });

    const { executor, claim, repository, client } = createExecutorHarness({ job });

    const outcome = await executor.execute(claim, new AbortController().signal);

    expect(outcome).toBe('completed');
    expect(client.getJob).toHaveBeenCalledTimes(1);
    expect(client.getDownload).toHaveBeenCalledTimes(1);
    expect(repository.complete).toHaveBeenCalledTimes(1);
    expect(vi.mocked(repository.complete).mock.calls[0]?.[0]).toMatchObject({
      remoteState: 'succeeded',
      downloadMetadata: {
        fileName: 'guide.pdf',
        mimeType: 'application/pdf',
        byteSize: 1234,
        checksumSha256: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        downloadUrl: 'https://downloads.example.test/guide.pdf',
        expiresAt: '2026-01-01T01:00:00.000Z'
      }
    });
  });

  it('marks jobs failed when remote polling returns terminal failure', async () => {
    const job = buildPublishJob({
      stage: 'waiting-for-remote',
      remoteJobId: 'remote_job_1',
      remoteState: 'processing',
      nextAttemptAt: null,
      nextPollAt: now
    });
    const client = createClient();
    client.getJob = vi.fn(async () => ({
      jobId: 'remote_job_1',
      state: 'failed',
      outputFormat: 'pdf',
      correlationId: 'remote-corr-1',
      error: {
        code: 'REMOTE_FAILED',
        message: 'Remote publish failed.'
      }
    }));

    const { executor, claim, repository } = createExecutorHarness({ job, client });

    const outcome = await executor.execute(claim, new AbortController().signal);

    expect(outcome).toBe('failed');
    expect(repository.fail).toHaveBeenCalledTimes(1);
    expect(repository.recordRetry).not.toHaveBeenCalled();
  });

  it('marks jobs cancelled when remote polling returns cancelled', async () => {
    const job = buildPublishJob({
      stage: 'waiting-for-remote',
      remoteJobId: 'remote_job_1',
      remoteState: 'processing',
      nextAttemptAt: null,
      nextPollAt: now
    });
    const client = createClient();
    client.getJob = vi.fn(async () => ({
      jobId: 'remote_job_1',
      state: 'cancelled',
      outputFormat: 'pdf',
      correlationId: 'remote-corr-1'
    }));

    const { executor, claim, repository } = createExecutorHarness({ job, client });

    const outcome = await executor.execute(claim, new AbortController().signal);

    expect(outcome).toBe('cancelled');
    expect(repository.markRemoteCancelled).toHaveBeenCalledTimes(1);
  });
});