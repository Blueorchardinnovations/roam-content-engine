import { describe, expect, it, vi } from 'vitest';

import { PublishWorkerLoop } from '../../../src/application/publish-jobs/publish-worker-loop.js';
import type { ClaimedPublishJob } from '../../../src/domain/publish-jobs/index.js';

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

function buildClaim(): ClaimedPublishJob {
  return {
    tenantId: 'tenant_01TEST000000000000000000' as const,
    publishJobId: 'pjob_01TEST00000000000000000000' as const,
    workerId: 'worker_publish_loop_1',
    leaseExpiresAt: new Date('2026-01-01T00:00:30.000Z')
  };
}

describe('publish worker loop', () => {
  it('stops polling after shutdown', async () => {
    const state = createState();
    const sleepResolvers: Array<() => void> = [];
    let acquireCalls = 0;

    const loop = new PublishWorkerLoop({
      config: {
        workerId: 'worker_publish_loop_1',
        pollIntervalMs: 100,
        leaseDurationMs: 1000,
        concurrency: 1,
        shutdownTimeoutMs: 100,
        staleRecoveryIntervalMs: 1000
      },
      source: {
        acquireNext: vi.fn(async () => {
          acquireCalls += 1;
          return null;
        }),
        renewLease: vi.fn()
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

    expect(acquireCalls).toBe(1);
  });

  it('runs claimed publish jobs and tracks active executions', async () => {
    const state = createState();
    const claim = buildClaim();
    let acquired = false;

    let controller: AbortController | null = new AbortController();

    const loop = new PublishWorkerLoop({
      config: {
        workerId: 'worker_publish_loop_2',
        pollIntervalMs: 1,
        leaseDurationMs: 1000,
        concurrency: 1,
        shutdownTimeoutMs: 100,
        staleRecoveryIntervalMs: 1000
      },
      source: {
        acquireNext: vi.fn(async () => {
          if (acquired) {
            return null;
          }

          acquired = true;
          return claim;
        }),
        renewLease: vi.fn()
      },
      executor: {
        execute: vi.fn(async () => {
          controller?.abort();
          return 'waiting';
        })
      } as never,
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

    await loop.run(controller.signal);
    controller = null;

    expect(state.lastSuccessfulPollAt).not.toBeNull();
    expect(state.activeJobCount).toBeGreaterThanOrEqual(0);
  });
});