import { describe, expect, it, vi } from 'vitest';

import { JobExecutor } from '../../../src/application/workers/job-executor.js';
import type { JobProcessor } from '../../../src/domain/workers/job-processor.js';
import {
  PermanentWorkerError,
  RetryableWorkerError,
  WorkerCancelledError
} from '../../../src/domain/workers/worker-errors.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';

function buildJob() {
  const now = new Date('2026-01-01T00:00:00.000Z');

  return {
    id: 'job_01TEST' as const,
    tenantId: 'tenant_01TEST' as const,
    projectId: 'project_01TEST' as const,
    sourceVersionId: 'srcver_01TEST' as const,
    status: 'processing' as const,
    currentStage: 'normalizing-transcript' as const,
    idempotencyKey: 'idem-1',
    requestFingerprint: 'fingerprint',
    attemptCount: 1,
    result: null,
    errorCode: null,
    errorMessage: null,
    correlationId: 'corr_01TEST' as const,
    createdAt: now,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    leaseOwner: 'worker_test_1',
    leaseExpiresAt: new Date(now.getTime() + 30000),
    heartbeatAt: now,
    nextAttemptAt: null
  };
}

function createExecutor(overrides?: {
  processor?: JobProcessor;
  renewLeaseReturn?: boolean;
  attemptCount?: number;
}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const job = {
    ...buildJob(),
    attemptCount: overrides?.attemptCount ?? 1
  };

  const markCompleted = vi.fn(async () => ({ ...job, status: 'completed' as const }));
  const scheduleRetry = vi.fn(async () => ({ ...job, status: 'retrying' as const }));
  const markFailed = vi.fn(async () => ({ ...job, status: 'failed' as const }));

  const jobSource = {
    acquireNext: vi.fn(),
    renewLease: vi.fn(),
    markStage: vi.fn(async () => job),
    markCompleted,
    scheduleRetry,
    markFailed,
    listStaleProcessingJobs: vi.fn(async () => []),
    recoverStaleJob: vi.fn(async () => null)
  };

  const heartbeatStore = {
    renewLease: vi.fn(async () => {
      if (overrides?.renewLeaseReturn === false) {
        return null;
      }

      return job;
    })
  };

  const processor = overrides?.processor ?? {
    jobType: 'transcript-processing' as const,
    process: vi.fn(async ({ reportStage }) => {
      await reportStage('calculating-statistics');

      return {
        schemaVersion: '1.0' as const,
        sourceVersionId: job.sourceVersionId,
        contentHash: 'hash',
        wordCount: 1,
        characterCount: 1,
        paragraphCount: 1,
        lineCount: 1,
        processedAt: now.toISOString()
      };
    })
  };

  const sleep = vi.fn(async () => undefined);

  const executor = new JobExecutor({
    jobSource,
    heartbeatStore,
    processors: [processor],
    now: () => now,
    sleep,
    heartbeatIntervalMs: 10,
    leaseDurationMs: 100,
    retryPolicy: {
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      maxAttempts: 3
    },
    maxAttempts: 3,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  });

  return {
    executor,
    job,
    jobSource,
    heartbeatStore,
    markCompleted,
    scheduleRetry,
    markFailed
  };
}

describe('job executor', () => {
  it('completes job on successful processor execution', async () => {
    const { executor, job, markCompleted } = createExecutor();

    const outcome = await executor.execute(job, new AbortController().signal);

    expect(outcome).toBe('completed');
    expect(markCompleted).toHaveBeenCalledTimes(1);
  });

  it('schedules retry on retryable processor error', async () => {
    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async () => {
        throw new RetryableWorkerError('retry me', ErrorCode.WORKER_RETRYABLE);
      }
    };

    const { executor, job, scheduleRetry } = createExecutor({ processor });

    const outcome = await executor.execute(job, new AbortController().signal);

    expect(outcome).toBe('retry-scheduled');
    expect(scheduleRetry).toHaveBeenCalledTimes(1);
  });

  it('marks failed on permanent processor error', async () => {
    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async () => {
        throw new PermanentWorkerError('perm', ErrorCode.WORKER_PERMANENT);
      }
    };

    const { executor, job, markFailed } = createExecutor({ processor });

    const outcome = await executor.execute(job, new AbortController().signal);

    expect(outcome).toBe('failed');
    expect(markFailed).toHaveBeenCalledTimes(1);
  });

  it('converts retryable errors to permanent when max attempts reached', async () => {
    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async () => {
        throw new RetryableWorkerError('retry', ErrorCode.WORKER_RETRYABLE);
      }
    };

    const { executor, job, markFailed, scheduleRetry } = createExecutor({
      processor,
      attemptCount: 3
    });

    const outcome = await executor.execute(job, new AbortController().signal);

    expect(outcome).toBe('failed');
    expect(scheduleRetry).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledTimes(1);
  });

  it('handles cancellation without scheduling retry', async () => {
    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async () => {
        throw new WorkerCancelledError();
      }
    };

    const { executor, job, scheduleRetry } = createExecutor({ processor });

    const outcome = await executor.execute(job, new AbortController().signal);

    expect(outcome).toBe('cancelled');
    expect(scheduleRetry).not.toHaveBeenCalled();
  });

  it('stops with lease-lost outcome when heartbeat loses ownership', async () => {
    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async ({ heartbeat }) => {
        await heartbeat();

        return {
          schemaVersion: '1.0',
          sourceVersionId: 'srcver_01TEST',
          contentHash: 'hash',
          wordCount: 1,
          characterCount: 1,
          paragraphCount: 1,
          lineCount: 1,
          processedAt: new Date().toISOString()
        };
      }
    };

    const { executor, job, markCompleted } = createExecutor({
      processor,
      renewLeaseReturn: false
    });

    const outcome = await executor.execute(job, new AbortController().signal);

    expect(outcome).toBe('lease-lost');
    expect(markCompleted).not.toHaveBeenCalled();
  });

  it('sanitizes unknown error message before persistence', async () => {
    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async () => {
        throw new Error('x'.repeat(800));
      }
    };

    const { executor, job, scheduleRetry } = createExecutor({ processor });

    await executor.execute(job, new AbortController().signal);

    const args = scheduleRetry.mock.calls[0]?.[0];
    expect(args.errorMessage.length).toBeLessThanOrEqual(500);
  });

  it('returns lease-lost when completion persistence fails after processor produced render artifact', async () => {
    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async () => ({
        schemaVersion: '1.0',
        sourceVersionId: 'srcver_01TEST',
        contentHash: 'hash',
        wordCount: 1,
        characterCount: 1,
        paragraphCount: 1,
        lineCount: 1,
        processedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          renderArtifact: {
            metadata: {
              artifactId: 'artifact_1',
              status: 'ready',
              format: 'html',
              payloadRepresentation: 'structured-json',
              mimeType: 'application/json',
              fileExtension: '.json',
              checksumSha256: 'd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2',
            byteSize: 2,
            createdAt: '2026-01-01T00:00:00.000Z',
            warnings: [],
            errors: []
          },
          content: {
            kind: 'inline',
            encoding: 'utf-8',
            bytesBase64: 'e30=',
            serializedDocument: '{}'
          },
          storage: {
            kind: 'none'
          }
        }
      })
    };

    const { executor, job, markCompleted, markFailed, scheduleRetry } = createExecutor({ processor });
    markCompleted.mockResolvedValueOnce(null);

    const outcome = await executor.execute(job, new AbortController().signal);

    expect(outcome).toBe('lease-lost');
    expect(markCompleted).toHaveBeenCalledTimes(1);
    expect(markFailed).not.toHaveBeenCalled();
    expect(scheduleRetry).not.toHaveBeenCalled();
  });
});
