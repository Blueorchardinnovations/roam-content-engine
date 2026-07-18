import { describe, expect, it, vi } from 'vitest';

import { PublishJobExecutor } from '../../../src/application/publish-jobs/publish-job-executor.js';
import type { ClaimedPublishJob, PublishJob } from '../../../src/domain/publish-jobs/index.js';
import type { PublishJobRepository } from '../../../src/domain/repositories/publish-job-repository.js';
import type { PublishEngineClient } from '../../../src/infrastructure/publish-engine/publish-engine-client.js';
import {
  PublishEngineAuthenticationError,
  PublishEngineIdempotencyConflictError,
  PublishEngineProtocolError,
  PublishEngineRemoteRequestError,
  PublishEngineTimeoutError,
  PublishEngineTransportError
} from '../../../src/infrastructure/publish-engine/publish-engine-errors.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';

const baseNow = new Date('2026-01-01T00:00:00.000Z');

function buildPublishJob(overrides?: Partial<PublishJob>): PublishJob {
  return {
    id: 'pjob_01TEST00000000000000000000',
    tenantId: 'tenant_01TEST000000000000000000' as const,
    projectId: 'project_01TEST0000000000000000' as const,
    sourceContentJobId: 'job_01TEST00000000000000000000' as const,
    sourceRenderArtifactId: 'artifact_styled_1',
    sourceArtifactChecksumSha256: '51b724303381af22019511dc65b2857e1ff72ab00f2da4322562df5b4b8a9976',
    sourceArtifactByteSize: 36,
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
      includeToc: true
    },
    publicationMetadata: {
      title: 'Publish Matrix',
      language: 'en'
    },
    status: 'processing',
    stage: 'submitting',
    idempotencyKey: 'publish-matrix',
    requestFingerprint: 'fingerprint-matrix',
    remoteSubmissionIdempotencyKey: 'publish::submit:fingerprint-matrix',
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
    leaseOwner: 'worker_publish_matrix_1',
    leaseExpiresAt: new Date(baseNow.getTime() + 30_000),
    heartbeatAt: baseNow,
    nextAttemptAt: baseNow,
    nextPollAt: null,
    submittedAt: null,
    lastPolledAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: baseNow,
    updatedAt: baseNow,
    ...overrides
  };
}

function buildClaim(job: PublishJob): ClaimedPublishJob {
  return {
    tenantId: job.tenantId,
    publishJobId: job.id,
    workerId: job.leaseOwner ?? 'worker_publish_matrix_1',
    leaseExpiresAt: job.leaseExpiresAt ?? new Date(baseNow.getTime() + 30_000)
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
      remoteJobId: 'remote_matrix_1',
      remoteState: 'accepted',
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      nextAttemptAt: null,
      nextPollAt: new Date(baseNow.getTime() + 2_000)
    })),
    recordRemoteWaiting: vi.fn(async () => ({
      ...job,
      status: 'waiting' as const,
      stage: 'waiting-for-remote' as const,
      pollCount: job.pollCount + 1,
      consecutiveFailureCount: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      nextAttemptAt: null,
      nextPollAt: new Date(baseNow.getTime() + 2_000)
    })),
    recordRetry: vi.fn(async () => ({
      ...job,
      status: 'retrying' as const,
      stage: 'failed' as const,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null
    })),
    complete: vi.fn(async () => ({
      ...job,
      status: 'completed' as const,
      stage: 'completed' as const,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      nextAttemptAt: null,
      nextPollAt: null,
      completedAt: baseNow
    })),
    fail: vi.fn(async () => ({
      ...job,
      status: 'failed' as const,
      stage: 'failed' as const,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      nextAttemptAt: null,
      nextPollAt: null
    })),
    markRemoteCancelled: vi.fn(async () => ({
      ...job,
      status: 'cancelled' as const,
      stage: 'cancelled' as const,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      nextAttemptAt: null,
      nextPollAt: null
    })),
    cancel: vi.fn(),
    recoverStaleLeases: vi.fn(async () => 0)
  } satisfies Partial<PublishJobRepository>;

  return repository as PublishJobRepository & typeof repository;
}

function createClient(overrides?: Partial<PublishEngineClient>) {
  return {
    submitRender: vi.fn(async () => ({
      jobId: 'remote_matrix_1',
      state: 'accepted' as const,
      outputFormat: 'pdf' as const,
      correlationId: 'remote-corr-matrix-1'
    })),
    submitCtaRender: vi.fn(async () => ({
      jobId: 'remote_matrix_1',
      state: 'accepted' as const,
      outputFormat: 'pdf' as const,
      correlationId: 'remote-corr-matrix-1'
    })),
    getJob: vi.fn(async () => ({
      jobId: 'remote_matrix_1',
      state: 'queued' as const,
      outputFormat: 'pdf' as const,
      correlationId: 'remote-corr-matrix-1'
    })),
    getDownload: vi.fn(async () => ({
      jobId: 'remote_matrix_1',
      fileName: 'matrix.pdf',
      mimeType: 'application/pdf',
      downloadUrl: 'https://downloads.example.test/matrix.pdf'
    })),
    waitForJob: vi.fn(),
    ...overrides
  } satisfies PublishEngineClient;
}

function createHarness(overrides?: {
  job?: PublishJob;
  client?: PublishEngineClient;
  repository?: PublishJobRepository;
  now?: Date;
  maxConsecutiveFailures?: number;
  renewLease?: ClaimedPublishJob | null;
}) {
  const job = overrides?.job ?? buildPublishJob();
  const repository = overrides?.repository ?? createRepository(job);
  const client = overrides?.client ?? createClient();
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  const source = {
    acquireNext: vi.fn(),
    renewLease: vi.fn(async () => overrides?.renewLease ?? buildClaim(job))
  };

  const executor = new PublishJobExecutor({
    source,
    repository,
    publishEngineClient: client,
    now: () => overrides?.now ?? baseNow,
    pollIntervalMs: 2_000,
    leaseDurationMs: 30_000,
    heartbeatIntervalMs: 200,
    maxConsecutiveFailures: overrides?.maxConsecutiveFailures ?? 3,
    retryPolicy: {
      baseDelayMs: 1_000,
      maxDelayMs: 60_000,
      maxAttempts: 3
    },
    logger
  });

  return {
    executor,
    claim: buildClaim(job),
    job,
    repository,
    client,
    logger
  };
}

describe('publish job executor matrix', () => {
  it('forwards persisted idempotency key and correlation ID to submission call', async () => {
    const { executor, claim, client, job } = createHarness();

    await executor.execute(claim, new AbortController().signal);

    expect(client.submitRender).toHaveBeenCalledTimes(1);
    expect(vi.mocked(client.submitRender).mock.calls[0]?.[1]).toMatchObject({
      idempotencyKey: job.remoteSubmissionIdempotencyKey,
      correlationId: job.correlationId
    });
  });

  it('persists remote job ID and clears lease when submission succeeds', async () => {
    const { executor, claim, repository } = createHarness();

    expect(await executor.execute(claim, new AbortController().signal)).toBe('waiting');

    const submission = vi.mocked(repository.recordSubmission).mock.calls[0]?.[0];
    expect(submission?.remoteJobId).toBe('remote_matrix_1');
    expect(repository.recordSubmission).toHaveBeenCalledTimes(1);
  });

  it('schedules polling for queued and running remote states', async () => {
    for (const state of ['queued', 'running'] as const) {
      const job = buildPublishJob({
        stage: 'waiting-for-remote',
        remoteJobId: 'remote_matrix_1',
        remoteState: 'accepted',
        nextAttemptAt: null,
        nextPollAt: baseNow
      });
      const client = createClient({
        getJob: vi.fn(async () => ({
          jobId: 'remote_matrix_1',
          state,
          outputFormat: 'pdf',
          correlationId: 'remote-corr-matrix-1'
        }))
      });
      const { executor, claim, repository } = createHarness({ job, client });

      expect(await executor.execute(claim, new AbortController().signal)).toBe('waiting');
      expect(repository.recordRemoteWaiting).toHaveBeenCalledTimes(1);
      expect(repository.recordRetry).not.toHaveBeenCalled();
    }
  });

  it('never calls waitForJob in durable orchestration', async () => {
    const { executor, claim, client } = createHarness();

    await executor.execute(claim, new AbortController().signal);

    expect(client.waitForJob).not.toHaveBeenCalled();
  });

  it('excludes upstream download jobId from persisted metadata and avoids URL logging', async () => {
    const job = buildPublishJob({
      stage: 'waiting-for-remote',
      remoteJobId: 'remote_matrix_1',
      remoteState: 'processing',
      nextAttemptAt: null,
      nextPollAt: baseNow
    });
    const client = createClient({
      getJob: vi.fn(async () => ({
        jobId: 'remote_matrix_1',
        state: 'succeeded',
        outputFormat: 'pdf',
        correlationId: 'remote-corr-matrix-1'
      })),
      getDownload: vi.fn(async () => ({
        jobId: 'remote_matrix_1',
        fileName: 'matrix.pdf',
        mimeType: 'application/pdf',
        byteSize: 321,
        checksumSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        downloadUrl: 'https://downloads.example.test/matrix.pdf'
      }))
    });

    const { executor, claim, repository, logger } = createHarness({ job, client });

    expect(await executor.execute(claim, new AbortController().signal)).toBe('completed');

    const completeInput = vi.mocked(repository.complete).mock.calls[0]?.[0];
    expect(completeInput?.downloadMetadata).toMatchObject({
      fileName: 'matrix.pdf',
      mimeType: 'application/pdf',
      byteSize: 321,
      checksumSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      downloadUrl: 'https://downloads.example.test/matrix.pdf'
    });
    expect('jobId' in (completeInput?.downloadMetadata ?? {})).toBe(false);

    const flattenedLogs = JSON.stringify([
      ...vi.mocked(logger.info).mock.calls,
      ...vi.mocked(logger.warn).mock.calls,
      ...vi.mocked(logger.error).mock.calls
    ]);
    expect(flattenedLogs.includes('https://downloads.example.test/matrix.pdf')).toBe(false);
  });

  it('treats remote terminal failure and remote cancellation as terminal local outcomes', async () => {
    const failureJob = buildPublishJob({
      stage: 'waiting-for-remote',
      remoteJobId: 'remote_matrix_1',
      remoteState: 'processing',
      nextAttemptAt: null,
      nextPollAt: baseNow
    });

    const failureClient = createClient({
      getJob: vi.fn(async () => ({
        jobId: 'remote_matrix_1',
        state: 'failed',
        outputFormat: 'pdf',
        error: {
          code: 'REMOTE_FAILED',
          message: 'remote failure'
        }
      }))
    });

    const failureHarness = createHarness({ job: failureJob, client: failureClient });
    expect(await failureHarness.executor.execute(failureHarness.claim, new AbortController().signal)).toBe('failed');

    const cancelledClient = createClient({
      getJob: vi.fn(async () => ({
        jobId: 'remote_matrix_1',
        state: 'cancelled',
        outputFormat: 'pdf'
      }))
    });
    const cancelledHarness = createHarness({ job: failureJob, client: cancelledClient });
    expect(await cancelledHarness.executor.execute(cancelledHarness.claim, new AbortController().signal)).toBe('cancelled');
  });

  it('schedules retries for transport and timeout errors and fails after retry exhaustion', async () => {
    const transportHarness = createHarness({
      client: createClient({
        submitRender: vi.fn(async () => {
          throw new PublishEngineTransportError('transport');
        })
      })
    });
    expect(await transportHarness.executor.execute(transportHarness.claim, new AbortController().signal)).toBe('retry-scheduled');

    const timeoutHarness = createHarness({
      client: createClient({
        submitRender: vi.fn(async () => {
          throw new PublishEngineTimeoutError('timeout');
        })
      })
    });
    expect(await timeoutHarness.executor.execute(timeoutHarness.claim, new AbortController().signal)).toBe('retry-scheduled');

    const exhaustedJob = buildPublishJob({ consecutiveFailureCount: 2 });
    const exhaustedHarness = createHarness({
      job: exhaustedJob,
      maxConsecutiveFailures: 3,
      client: createClient({
        submitRender: vi.fn(async () => {
          throw new PublishEngineTransportError('transport');
        })
      })
    });
    expect(await exhaustedHarness.executor.execute(exhaustedHarness.claim, new AbortController().signal)).toBe('failed');
    expect(vi.mocked(exhaustedHarness.repository.fail).mock.calls[0]?.[0]?.errorCode).toBe(ErrorCode.PUBLISH_JOB_RETRY_EXHAUSTED);
  });

  it('treats authentication, authorization, protocol, idempotency conflicts, and download validation errors as permanent', async () => {
    const permanentCases: Array<{ name: string; error: Error }> = [
      { name: 'auth', error: new PublishEngineAuthenticationError('auth') },
      { name: 'authorization', error: new PublishEngineRemoteRequestError('forbidden', { status: 403 }) },
      { name: 'protocol', error: new PublishEngineProtocolError('protocol') },
      { name: 'idempotency', error: new PublishEngineIdempotencyConflictError('idem conflict') }
    ];

    for (const entry of permanentCases) {
      const harness = createHarness({
        client: createClient({
          submitRender: vi.fn(async () => {
            throw entry.error;
          })
        })
      });

      expect(await harness.executor.execute(harness.claim, new AbortController().signal)).toBe('failed');
      expect(harness.repository.recordRetry).not.toHaveBeenCalled();
    }

    const downloadValidationJob = buildPublishJob({
      stage: 'waiting-for-remote',
      remoteJobId: 'remote_matrix_1',
      remoteState: 'processing',
      nextAttemptAt: null,
      nextPollAt: baseNow
    });
    const downloadValidationHarness = createHarness({
      job: downloadValidationJob,
      client: createClient({
        getJob: vi.fn(async () => ({
          jobId: 'remote_matrix_1',
          state: 'succeeded',
          outputFormat: 'pdf'
        })),
        getDownload: vi.fn(async () => ({
          jobId: 'remote_matrix_1',
          fileName: '',
          mimeType: 'application/pdf'
        }))
      })
    });

    expect(await downloadValidationHarness.executor.execute(downloadValidationHarness.claim, new AbortController().signal)).toBe('failed');
  });

  it('rejects late submission and poll writes after lease replacement or cancellation', async () => {
    const leaseLostRepo = createRepository(buildPublishJob());
    leaseLostRepo.recordSubmission = vi.fn(async () => null);
    const leaseLostSubmissionHarness = createHarness({ repository: leaseLostRepo });

    expect(await leaseLostSubmissionHarness.executor.execute(leaseLostSubmissionHarness.claim, new AbortController().signal)).toBe('lease-lost');

    const cancelledJob = buildPublishJob({
      stage: 'waiting-for-remote',
      remoteJobId: 'remote_matrix_1',
      remoteState: 'processing',
      status: 'processing',
      nextAttemptAt: null,
      nextPollAt: baseNow
    });
    const cancelledRepo = createRepository(cancelledJob);
    cancelledRepo.recordRemoteWaiting = vi.fn(async () => null);

    const pollHarness = createHarness({
      job: cancelledJob,
      repository: cancelledRepo,
      client: createClient({
        getJob: vi.fn(async () => ({
          jobId: 'remote_matrix_1',
          state: 'queued',
          outputFormat: 'pdf'
        }))
      })
    });

    expect(await pollHarness.executor.execute(pollHarness.claim, new AbortController().signal)).toBe('lease-lost');
  });

  it('does not modify content-job state from publish failure paths', async () => {
    const { executor, claim, client } = createHarness({
      client: createClient({
        submitRender: vi.fn(async () => {
          throw new PublishEngineTransportError('transport');
        })
      })
    });

    await executor.execute(claim, new AbortController().signal);

    expect(client.submitRender).toHaveBeenCalledTimes(1);
    expect(client.waitForJob).not.toHaveBeenCalled();
  });
});
