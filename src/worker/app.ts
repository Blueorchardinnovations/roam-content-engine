import { systemClock, type Clock } from '../platform/foundation/clock/index.js';
import { sleep, type Sleep } from '../platform/foundation/sleep.js';
import { createShutdownController } from '../platform/foundation/shutdown-signal.js';
import type { AIPipeline } from '../application/ai/pipeline.js';
import type { SourceVersionRepository } from '../domain/repositories/source-version-repository.js';
import type { WorkerJobSource, WorkerRuntimeState } from '../domain/workers/worker-types.js';
import { DatabaseWorkerHeartbeatStore } from '../infrastructure/workers/worker-heartbeat-store.js';
import { DeterministicTranscriptProcessor } from '../infrastructure/workers/deterministic-transcript-processor.js';
import { JobExecutor } from '../application/workers/job-executor.js';
import { StaleJobRecovery } from '../application/workers/stale-job-recovery.js';
import { WorkerLoop } from '../application/workers/worker-loop.js';
import { WorkerRunner } from '../application/workers/worker-runner.js';

export type CreateWorkerAppDependencies = {
  readonly workerConfig: {
    workerId: string;
    pollIntervalMs: number;
    leaseDurationMs: number;
    heartbeatIntervalMs: number;
    maxAttempts: number;
    concurrency: number;
    shutdownTimeoutMs: number;
    staleRecoveryIntervalMs: number;
    retryBaseDelayMs: number;
    retryMaxDelayMs: number;
  };
  readonly sourceVersionRepository: SourceVersionRepository;
  readonly jobSource: WorkerJobSource;
  readonly aiPipeline?: AIPipeline;
  readonly logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
  readonly clock?: Clock;
  readonly sleep?: Sleep;
};

export type WorkerApp = {
  readonly state: WorkerRuntimeState;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export function createWorkerApp(
  dependencies: CreateWorkerAppDependencies
): WorkerApp {
  const clock = dependencies.clock ?? systemClock;
  const sleeper = dependencies.sleep ?? sleep;
  const shutdown = createShutdownController();

  const state: WorkerRuntimeState = {
    started: false,
    stopping: false,
    stopped: false,
    lastSuccessfulPollAt: null,
    activeJobCount: 0,
    lastStaleRecoveryRunAt: null
  };

  const heartbeatStore = new DatabaseWorkerHeartbeatStore(
    dependencies.jobSource
  );

  const processor = new DeterministicTranscriptProcessor(
    dependencies.sourceVersionRepository,
    () => clock.now(),
    dependencies.aiPipeline
  );

  const executor = new JobExecutor({
    jobSource: dependencies.jobSource,
    heartbeatStore,
    processors: [processor],
    now: () => clock.now(),
    sleep: sleeper,
    heartbeatIntervalMs: dependencies.workerConfig.heartbeatIntervalMs,
    leaseDurationMs: dependencies.workerConfig.leaseDurationMs,
    maxAttempts: dependencies.workerConfig.maxAttempts,
    retryPolicy: {
      baseDelayMs: dependencies.workerConfig.retryBaseDelayMs,
      maxDelayMs: dependencies.workerConfig.retryMaxDelayMs,
      maxAttempts: dependencies.workerConfig.maxAttempts
    },
    logger: dependencies.logger
  });

  const staleRecovery = new StaleJobRecovery(
    dependencies.jobSource,
    () => clock.now(),
    dependencies.workerConfig.maxAttempts,
    {
      baseDelayMs: dependencies.workerConfig.retryBaseDelayMs,
      maxDelayMs: dependencies.workerConfig.retryMaxDelayMs,
      maxAttempts: dependencies.workerConfig.maxAttempts
    },
    dependencies.logger
  );

  const loop = new WorkerLoop({
    config: {
      workerId: dependencies.workerConfig.workerId,
      pollIntervalMs: dependencies.workerConfig.pollIntervalMs,
      leaseDurationMs: dependencies.workerConfig.leaseDurationMs,
      heartbeatIntervalMs: dependencies.workerConfig.heartbeatIntervalMs,
      maxAttempts: dependencies.workerConfig.maxAttempts,
      concurrency: dependencies.workerConfig.concurrency,
      shutdownTimeoutMs: dependencies.workerConfig.shutdownTimeoutMs,
      staleRecoveryIntervalMs: dependencies.workerConfig.staleRecoveryIntervalMs
    },
    jobSource: dependencies.jobSource,
    executor,
    state,
    now: () => clock.now(),
    sleep: sleeper,
    runStaleRecovery: async () => {
      await staleRecovery.runOnce();
    },
    logger: dependencies.logger
  });

  const runner = new WorkerRunner(loop, state, dependencies.logger);

  return {
    state,
    start: async () => {
      await runner.start(shutdown.signal);
    },
    stop: async () => {
      state.stopping = true;
      shutdown.requestShutdown();
      await runner.stop();
    }
  };
}
