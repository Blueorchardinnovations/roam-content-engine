import { describe, expect, it, vi } from 'vitest';

import { PublishWorkerLoop } from '../../../src/application/publish-jobs/publish-worker-loop.js';
import type { ClaimedPublishJob } from '../../../src/domain/publish-jobs/index.js';

function buildClaim(id: string): ClaimedPublishJob {
  return {
    tenantId: 'tenant_01TEST000000000000000000' as const,
    publishJobId: id as ClaimedPublishJob['publishJobId'],
    workerId: 'worker_publish_loop_matrix',
    leaseExpiresAt: new Date('2026-01-01T00:00:30.000Z')
  };
}

function createState() {
  return {
    started: false,
    stopping: false,
    stopped: false,
    lastSuccessfulPollAt: null as Date | null,
    activeJobCount: 0,
    lastStaleRecoveryRunAt: null as Date | null
  };
}

describe('publish worker loop matrix', () => {
  it('runs stale recovery periodically and does not busy-spin when no jobs are due', async () => {
    const state = createState();
    const sleeps: number[] = [];
    const runStaleRecovery = vi.fn(async () => undefined);
    const source = {
      acquireNext: vi.fn(async () => null),
      renewLease: vi.fn()
    };

    let current = new Date('2026-01-01T00:00:00.000Z');

    const controller = new AbortController();
    let sleepCalls = 0;

    const loop = new PublishWorkerLoop({
      config: {
        workerId: 'worker_publish_loop_matrix',
        pollIntervalMs: 50,
        leaseDurationMs: 1000,
        concurrency: 1,
        shutdownTimeoutMs: 100,
        staleRecoveryIntervalMs: 100
      },
      source,
      executor: {
        execute: vi.fn(async () => 'waiting')
      } as never,
      state,
      now: () => current,
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
        current = new Date(current.getTime() + delayMs);
        sleepCalls += 1;
        if (sleepCalls >= 3) {
          controller.abort();
        }
      },
      runStaleRecovery,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    });

    await loop.run(controller.signal);

    expect(source.acquireNext).toHaveBeenCalled();
    expect(runStaleRecovery).toHaveBeenCalled();
    expect(sleeps.every((delay) => delay === 50)).toBe(true);
  });

  it('isolates one job failure and continues processing subsequent claims', async () => {
    const state = createState();
    const claimA = buildClaim('pjob_01TEST00000000000000000001');
    const claimB = buildClaim('pjob_01TEST00000000000000000002');
    const controller = new AbortController();

    const source = {
      acquireNext: vi.fn(async () => {
        const index = source.acquireNext.mock.calls.length;
        if (index === 1) {
          return claimA;
        }

        if (index === 2) {
          return claimB;
        }

        controller.abort();
        return null;
      }),
      renewLease: vi.fn()
    };

    const executor = {
      execute: vi.fn(async (claim: ClaimedPublishJob) => {
        if (claim.publishJobId === claimA.publishJobId) {
          throw new Error('simulated failure');
        }

        return 'waiting' as const;
      })
    };

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    const loop = new PublishWorkerLoop({
      config: {
        workerId: 'worker_publish_loop_matrix',
        pollIntervalMs: 1,
        leaseDurationMs: 1000,
        concurrency: 1,
        shutdownTimeoutMs: 100,
        staleRecoveryIntervalMs: 10_000
      },
      source,
      executor: executor as never,
      state,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleep: async () => undefined,
      runStaleRecovery: async () => undefined,
      logger
    });

    await loop.run(controller.signal);

    expect(executor.execute).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('logs controlled metadata only, without styled HTML payloads or download URLs', async () => {
    const state = createState();
    const claim = buildClaim('pjob_01TEST00000000000000000003');
    const controller = new AbortController();

    const source = {
      acquireNext: vi.fn(async () => {
        if (source.acquireNext.mock.calls.length === 1) {
          return claim;
        }

        controller.abort();
        return null;
      }),
      renewLease: vi.fn()
    };

    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    const loop = new PublishWorkerLoop({
      config: {
        workerId: 'worker_publish_loop_matrix',
        pollIntervalMs: 1,
        leaseDurationMs: 1000,
        concurrency: 1,
        shutdownTimeoutMs: 100,
        staleRecoveryIntervalMs: 10_000
      },
      source,
      executor: {
        execute: vi.fn(async () => 'completed')
      } as never,
      state,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleep: async () => undefined,
      runStaleRecovery: async () => undefined,
      logger
    });

    await loop.run(controller.signal);

    const logs = JSON.stringify([
      ...logger.info.mock.calls,
      ...logger.warn.mock.calls,
      ...logger.error.mock.calls
    ]);

    expect(logs.includes('<!doctype html>')).toBe(false);
    expect(logs.includes('https://')).toBe(false);
  });
});
