import { afterEach, describe, expect, it, vi } from 'vitest';

import { JobExecutor } from '../../../src/application/workers/job-executor.js';
import type { JobProcessor } from '../../../src/domain/workers/job-processor.js';
import { PermanentWorkerError, RetryableWorkerError, WorkerCancelledError } from '../../../src/domain/workers/worker-errors.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';

function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject
  };
}

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

function buildResult(job: ReturnType<typeof buildJob>) {
  return {
    schemaVersion: '1.0' as const,
    sourceVersionId: job.sourceVersionId,
    contentHash: 'hash',
    wordCount: 1,
    characterCount: 1,
    paragraphCount: 1,
    lineCount: 1,
    processedAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
  };
}

function createHarness(input?: {
  processor?: JobProcessor;
  renewLease?: () => Promise<ReturnType<typeof buildJob> | null>;
}) {
  const job = buildJob();
  const now = new Date('2026-01-01T00:00:00.000Z');

  const markCompleted = vi.fn(async () => ({
    ...job,
    status: 'completed' as const,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null
  }));

  const scheduleRetry = vi.fn(async () => ({
    ...job,
    status: 'retrying' as const,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null
  }));

  const markFailed = vi.fn(async () => ({
    ...job,
    status: 'failed' as const,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null
  }));

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
      if (input?.renewLease) {
        return input.renewLease();
      }

      return job;
    })
  };

  const processor: JobProcessor = input?.processor ?? {
    jobType: 'transcript-processing',
    process: async () => buildResult(job)
  };

  const executor = new JobExecutor({
    jobSource,
    heartbeatStore,
    processors: [processor],
    now: () => now,
    sleep: (delayMs) => new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    }),
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
    heartbeatStore,
    markCompleted,
    scheduleRetry,
    markFailed
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('job executor heartbeat serialization', () => {
  it('prevents overlap between automatic and processor-requested heartbeats', async () => {
    vi.useFakeTimers();

    const gate = createDeferred<void>();
    let concurrent = 0;
    let maxConcurrent = 0;
    let calls = 0;

    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async ({ heartbeat }) => {
        const p = heartbeat();
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });
        await p;

        return buildResult(buildJob());
      }
    };

    const { executor, job } = createHarness({
      processor,
      renewLease: async () => {
        calls += 1;
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);

        if (calls === 1) {
          await gate.promise;
        }

        concurrent -= 1;
        return buildJob();
      }
    });

    const execution = executor.execute(job, new AbortController().signal);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10);
    gate.resolve();
    await vi.advanceTimersByTimeAsync(50);

    await execution;

    expect(maxConcurrent).toBe(1);
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  it('does not overlap multiple processor-requested heartbeats', async () => {
    vi.useFakeTimers();

    const gate = createDeferred<void>();
    let concurrent = 0;
    let maxConcurrent = 0;
    let calls = 0;

    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async ({ heartbeat }) => {
        const first = heartbeat();
        const second = heartbeat();

        gate.resolve();

        await Promise.all([first, second]);

        return buildResult(buildJob());
      }
    };

    const { executor, job } = createHarness({
      processor,
      renewLease: async () => {
        calls += 1;
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);

        if (calls === 1) {
          await gate.promise;
        }

        concurrent -= 1;
        return buildJob();
      }
    });

    const execution = executor.execute(job, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);
    await execution;

    expect(maxConcurrent).toBe(1);
    expect(calls).toBeLessThanOrEqual(2);
  });

  it('aborts processor when heartbeat renewal fails', async () => {
    vi.useFakeTimers();

    let aborted = false;

    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async ({ signal }) => {
        await new Promise<void>((_, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new WorkerCancelledError());
          });
        });

        return buildResult(buildJob());
      }
    };

    const { executor, job } = createHarness({
      processor,
      renewLease: async () => null
    });

    const execution = executor.execute(job, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);

    const outcome = await execution;

    expect(outcome).toBe('lease-lost');
    expect(aborted).toBe(true);
  });

  it('does not start new heartbeats after cleanup begins', async () => {
    vi.useFakeTimers();

    let calls = 0;

    const { executor, job } = createHarness({
      renewLease: async () => {
        calls += 1;
        return buildJob();
      }
    });

    const execution = executor.execute(job, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);
    await execution;

    const before = calls;
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for in-flight heartbeat to settle during cleanup', async () => {
    vi.useFakeTimers();

    const gate = createDeferred<void>();
    let calls = 0;

    const processorGate = createDeferred<void>();
    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async () => {
        await processorGate.promise;
        return buildResult(buildJob());
      }
    };

    const { executor, job } = createHarness({
      processor,
      renewLease: async () => {
        calls += 1;

        if (calls === 1) {
          await gate.promise;
        }

        return buildJob();
      }
    });

    let settled = false;
    const execution = executor.execute(job, new AbortController().signal).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(10);
    processorGate.resolve();
    await Promise.resolve();

    await Promise.resolve();
    expect(settled).toBe(false);

    gate.resolve();
    await execution;

    expect(settled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops heartbeat scheduling after success', async () => {
    vi.useFakeTimers();

    let calls = 0;
    const { executor, job } = createHarness({
      renewLease: async () => {
        calls += 1;
        return buildJob();
      }
    });

    const execution = executor.execute(job, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);

    const outcome = await execution;
    expect(outcome).toBe('completed');

    const after = calls;
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toBe(after);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops heartbeat scheduling after retry', async () => {
    vi.useFakeTimers();

    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async () => {
        throw new RetryableWorkerError('retry', ErrorCode.WORKER_RETRYABLE);
      }
    };

    let calls = 0;
    const { executor, job } = createHarness({
      processor,
      renewLease: async () => {
        calls += 1;
        return buildJob();
      }
    });

    const execution = executor.execute(job, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);

    const outcome = await execution;
    expect(outcome).toBe('retry-scheduled');

    const after = calls;
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toBe(after);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops heartbeat scheduling after permanent failure', async () => {
    vi.useFakeTimers();

    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async () => {
        throw new PermanentWorkerError('perm', ErrorCode.WORKER_PERMANENT);
      }
    };

    let calls = 0;
    const { executor, job } = createHarness({
      processor,
      renewLease: async () => {
        calls += 1;
        return buildJob();
      }
    });

    const execution = executor.execute(job, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);

    const outcome = await execution;
    expect(outcome).toBe('failed');

    const after = calls;
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toBe(after);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops heartbeat scheduling after lease loss', async () => {
    vi.useFakeTimers();

    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async ({ heartbeat }) => {
        await heartbeat();
        return buildResult(buildJob());
      }
    };

    let calls = 0;
    const { executor, job } = createHarness({
      processor,
      renewLease: async () => {
        calls += 1;
        return null;
      }
    });

    const execution = executor.execute(job, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);

    const outcome = await execution;
    expect(outcome).toBe('lease-lost');

    const after = calls;
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toBe(after);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops heartbeat scheduling after worker abort', async () => {
    vi.useFakeTimers();

    const processor: JobProcessor = {
      jobType: 'transcript-processing',
      process: async ({ signal }) => {
        if (signal.aborted) {
          throw new WorkerCancelledError();
        }

        await new Promise<void>((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(new WorkerCancelledError());
          });
        });

        return buildResult(buildJob());
      }
    };

    let calls = 0;
    const { executor, job } = createHarness({
      processor,
      renewLease: async () => {
        calls += 1;
        return buildJob();
      }
    });

    const controller = new AbortController();
    const execution = executor.execute(job, controller.signal);

    controller.abort();

    await vi.advanceTimersByTimeAsync(1000);

    const outcome = await execution;
    expect(outcome).toBe('cancelled');

    const after = calls;
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toBe(after);
    expect(vi.getTimerCount()).toBe(0);
  });
});
