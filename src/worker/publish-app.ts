import type { Clock } from '../platform/foundation/clock/index.js';
import { systemClock } from '../platform/foundation/clock/index.js';
import { sleep, type Sleep } from '../platform/foundation/sleep.js';
import { createShutdownController } from '../platform/foundation/shutdown-signal.js';
import type { PublishJobSource } from '../domain/publish-jobs/publish-worker-types.js';
import type { PublishJobRepository } from '../domain/repositories/publish-job-repository.js';
import type { PublishEngineClient } from '../infrastructure/publish-engine/publish-engine-client.js';

import { PublishJobExecutor } from '../application/publish-jobs/publish-job-executor.js';
import { PublishStaleRecovery } from '../application/publish-jobs/publish-stale-recovery.js';
import {
  PublishWorkerLoop,
  type PublishWorkerRuntimeState
} from '../application/publish-jobs/publish-worker-loop.js';

export type CreatePublishWorkerAppDependencies = {
  readonly source: PublishJobSource;
  readonly repository: PublishJobRepository;
  readonly publishEngineClient: PublishEngineClient;
  readonly config: {
    workerId: string;
    pollIntervalMs: number;
    leaseDurationMs: number;
    heartbeatIntervalMs: number;
    retryBaseDelayMs: number;
    retryMaxDelayMs: number;
    maxConsecutiveFailures: number;
    concurrency: number;
    shutdownTimeoutMs: number;
    staleRecoveryIntervalMs: number;
  };
  readonly logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
  readonly clock?: Clock;
  readonly sleep?: Sleep;
};

export type PublishWorkerApp = {
  readonly state: PublishWorkerRuntimeState;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function createPublishWorkerApp(
  dependencies: CreatePublishWorkerAppDependencies
): PublishWorkerApp {
  const clock = dependencies.clock ?? systemClock;
  const sleeper = dependencies.sleep ?? sleep;
  const shutdown = createShutdownController();

  const state: PublishWorkerRuntimeState = {
    started: false,
    stopping: false,
    stopped: false,
    lastSuccessfulPollAt: null,
    activeJobCount: 0,
    lastStaleRecoveryRunAt: null
  };

  const executor = new PublishJobExecutor({
    source: dependencies.source,
    repository: dependencies.repository,
    publishEngineClient: dependencies.publishEngineClient,
    now: () => clock.now(),
    pollIntervalMs: dependencies.config.pollIntervalMs,
    leaseDurationMs: dependencies.config.leaseDurationMs,
    heartbeatIntervalMs: dependencies.config.heartbeatIntervalMs,
    maxConsecutiveFailures: dependencies.config.maxConsecutiveFailures,
    retryPolicy: {
      baseDelayMs: dependencies.config.retryBaseDelayMs,
      maxDelayMs: dependencies.config.retryMaxDelayMs,
      maxAttempts: dependencies.config.maxConsecutiveFailures
    },
    logger: dependencies.logger
  });

  const staleRecovery = new PublishStaleRecovery(
    dependencies.repository,
    () => clock.now(),
    {
      baseDelayMs: dependencies.config.retryBaseDelayMs,
      maxDelayMs: dependencies.config.retryMaxDelayMs,
      maxAttempts: dependencies.config.maxConsecutiveFailures
    },
    dependencies.config.maxConsecutiveFailures,
    dependencies.logger
  );

  const loop = new PublishWorkerLoop({
    config: {
      workerId: dependencies.config.workerId,
      pollIntervalMs: dependencies.config.pollIntervalMs,
      leaseDurationMs: dependencies.config.leaseDurationMs,
      concurrency: dependencies.config.concurrency,
      shutdownTimeoutMs: dependencies.config.shutdownTimeoutMs,
      staleRecoveryIntervalMs: dependencies.config.staleRecoveryIntervalMs
    },
    source: dependencies.source,
    executor,
    state,
    now: () => clock.now(),
    sleep: sleeper,
    runStaleRecovery: async () => {
      await staleRecovery.runOnce();
    },
    logger: dependencies.logger
  });

  let runPromise: Promise<void> | null = null;

  return {
    state,
    start: async () => {
      if (runPromise) {
        return await runPromise;
      }

      state.started = true;
      state.stopped = false;

      runPromise = loop.run(shutdown.signal).finally(() => {
        state.stopping = false;
        state.stopped = true;
        state.activeJobCount = 0;
      });

      return await runPromise;
    },
    stop: async () => {
      state.stopping = true;
      shutdown.requestShutdown();
      if (runPromise) {
        await runPromise;
      }
    }
  };
}
