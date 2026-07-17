import { describe, expect, it, vi } from 'vitest';

import { WorkerLoop } from '../../../src/application/workers/worker-loop.js';
import { WorkerRunner } from '../../../src/application/workers/worker-runner.js';

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

function buildLeasedJob() {
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

function createState() {
  return {
    started: false,
    stopping: false,
    stopped: false,
    lastSuccessfulPollAt: null,
    activeJobCount: 0,
    lastStaleRecoveryRunAt: null
  };
}

describe('worker loop shutdown behavior', () => {
  it('stops new acquisitions after shutdown signal', async () => {
    const state = createState();
    const sleepResolvers: Array<() => void> = [];
    let acquireCalls = 0;

    const loop = new WorkerLoop({
      config: {
        workerId: 'worker_loop_shutdown_stop',
        pollIntervalMs: 100,
        leaseDurationMs: 1000,
        heartbeatIntervalMs: 100,
        maxAttempts: 3,
        concurrency: 1,
        shutdownTimeoutMs: 100,
        staleRecoveryIntervalMs: 1000
      },
      jobSource: {
        acquireNext: vi.fn(async () => {
          acquireCalls += 1;
          return null;
        }),
        renewLease: vi.fn(),
        markStage: vi.fn(),
        markCompleted: vi.fn(),
        scheduleRetry: vi.fn(),
        markFailed: vi.fn(),
        listStaleProcessingJobs: vi.fn(async () => []),
        recoverStaleJob: vi.fn(async () => null)
      },
      executor: {
        execute: vi.fn(async () => 'completed')
      } as never,
      state,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleep: async () => {
        await new Promise<void>((resolve) => {
          sleepResolvers.push(resolve);
        });
      },
      runStaleRecovery: async () => undefined,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    });

    const controller = new AbortController();
    const runPromise = loop.run(controller.signal);

    await Promise.resolve();

    controller.abort();
    sleepResolvers.splice(0).forEach((resolve) => resolve());

    await runPromise;

    const callsAfterStop = acquireCalls;
    expect(callsAfterStop).toBe(1);
  });

  it('propagates shutdown AbortSignal to in-flight cooperative execution', async () => {
    const state = createState();
    const job = buildLeasedJob();
    let observedAbort = false;

    const executor = {
      execute: vi.fn(async (_job: unknown, signal: AbortSignal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            observedAbort = true;
            resolve();
          });
        });

        return 'cancelled';
      })
    };

    let acquired = false;

    const loop = new WorkerLoop({
      config: {
        workerId: 'worker_loop_abort',
        pollIntervalMs: 1,
        leaseDurationMs: 1000,
        heartbeatIntervalMs: 100,
        maxAttempts: 3,
        concurrency: 1,
        shutdownTimeoutMs: 100,
        staleRecoveryIntervalMs: 1000
      },
      jobSource: {
        acquireNext: vi.fn(async () => {
          if (acquired) {
            return null;
          }

          acquired = true;
          return job;
        }),
        renewLease: vi.fn(),
        markStage: vi.fn(),
        markCompleted: vi.fn(),
        scheduleRetry: vi.fn(),
        markFailed: vi.fn(),
        listStaleProcessingJobs: vi.fn(async () => []),
        recoverStaleJob: vi.fn(async () => null)
      },
      executor: executor as never,
      state,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleep: async () => undefined,
      runStaleRecovery: async () => undefined,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    });

    const controller = new AbortController();
    const runPromise = loop.run(controller.signal);

    await Promise.resolve();
    controller.abort();

    await runPromise;

    expect(observedAbort).toBe(true);
    expect(state.activeJobCount).toBe(0);
  });

  it('aborts non-cooperative execution on shutdown timeout', async () => {
    const state = createState();
    const job = buildLeasedJob();

    let acquired = false;
    let settleExecution: (() => void) | null = null;
    let executionSignal: AbortSignal | null = null;
    const executionStarted = createDeferred<void>();

    const executor = {
      execute: vi.fn(async (_job: unknown, signal: AbortSignal) => {
        executionSignal = signal;
        executionStarted.resolve();

        await new Promise<void>((resolve) => {
          settleExecution = resolve;
        });

        return 'cancelled';
      })
    };

    const loop = new WorkerLoop({
      config: {
        workerId: 'worker_loop_timeout',
        pollIntervalMs: 1,
        leaseDurationMs: 1000,
        heartbeatIntervalMs: 100,
        maxAttempts: 3,
        concurrency: 1,
        shutdownTimeoutMs: 1,
        staleRecoveryIntervalMs: 1000
      },
      jobSource: {
        acquireNext: vi.fn(async () => {
          if (acquired) {
            return null;
          }

          acquired = true;
          return job;
        }),
        renewLease: vi.fn(),
        markStage: vi.fn(),
        markCompleted: vi.fn(),
        scheduleRetry: vi.fn(),
        markFailed: vi.fn(),
        listStaleProcessingJobs: vi.fn(async () => []),
        recoverStaleJob: vi.fn(async () => null)
      },
      executor: executor as never,
      state,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleep: async () => undefined,
      runStaleRecovery: async () => undefined,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    });

    const controller = new AbortController();
    const runPromise = loop.run(controller.signal);

    await executionStarted.promise;
    controller.abort();
    await Promise.resolve();

    expect(executionSignal?.aborted).toBe(true);

    settleExecution?.();
    await runPromise;

    expect(state.activeJobCount).toBe(0);
  });

  it('runner start/stop follows existing contract', async () => {
    const state = createState();
    const controller = new AbortController();

    const loop = {
      run: vi.fn(async (signal: AbortSignal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            resolve();
          });
        });
      })
    } as unknown as WorkerLoop;

    const runner = new WorkerRunner(loop, state, {
      info: () => undefined
    });

    const started = runner.start(controller.signal);
    const startedTwice = runner.start(controller.signal);

    expect(startedTwice).toBe(started);
    expect(state.started).toBe(true);

    controller.abort();

    await runner.stop();
    await started;

    expect(state.stopped).toBe(true);
    expect(state.activeJobCount).toBe(0);
  });
});
