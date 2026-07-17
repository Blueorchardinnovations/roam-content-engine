import type { JobExecutor } from './job-executor.js';
import type { WorkerConfig, WorkerJobSource, WorkerRuntimeState } from '../../domain/workers/worker-types.js';

export type WorkerLoopDependencies = {
  readonly config: WorkerConfig;
  readonly jobSource: WorkerJobSource;
  readonly executor: JobExecutor;
  readonly state: WorkerRuntimeState;
  readonly now: () => Date;
  readonly sleep: (delayMs: number) => Promise<void>;
  readonly runStaleRecovery: () => Promise<void>;
  readonly logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
};

export class WorkerLoop {
  public constructor(
    private readonly dependencies: WorkerLoopDependencies
  ) {}

  public async run(signal: AbortSignal): Promise<void> {
    const activeExecutions = new Set<Promise<unknown>>();
    const executionControllers = new Set<AbortController>();
    let nextStaleRecoveryAt = this.dependencies.now();

    while (!signal.aborted) {
      const now = this.dependencies.now();

      if (now >= nextStaleRecoveryAt) {
        try {
          await this.dependencies.runStaleRecovery();
          nextStaleRecoveryAt = new Date(
            now.getTime() + this.dependencies.config.staleRecoveryIntervalMs
          );
          this.dependencies.state.lastStaleRecoveryRunAt = now;
        } catch (error) {
          this.dependencies.logger.warn(
            {
              err: error,
              workerId: this.dependencies.config.workerId
            },
            'Stale job recovery run failed.'
          );
        }
      }

      while (
        activeExecutions.size < this.dependencies.config.concurrency &&
        !signal.aborted
      ) {
        let job;

        try {
          job = await this.dependencies.jobSource.acquireNext({
            workerId: this.dependencies.config.workerId,
            leaseDurationMs: this.dependencies.config.leaseDurationMs,
            now: this.dependencies.now()
          });
        } catch (error) {
          this.dependencies.logger.warn(
            {
              err: error,
              workerId: this.dependencies.config.workerId
            },
            'Worker poll failed; retrying later.'
          );
          break;
        }

        this.dependencies.state.lastSuccessfulPollAt = this.dependencies.now();

        if (!job) {
          break;
        }

        const executionController = new AbortController();
        executionControllers.add(executionController);

        const onSignalAbort = () => {
          executionController.abort();
        };

        signal.addEventListener('abort', onSignalAbort);

        const execution = this.dependencies.executor
          .execute(job, executionController.signal)
          .catch((error) => {
            this.dependencies.logger.error(
              {
                err: error,
                workerId: this.dependencies.config.workerId,
                tenantId: job.tenantId,
                jobId: job.id
              },
              'Worker job execution failed unexpectedly.'
            );
          })
          .finally(() => {
            signal.removeEventListener('abort', onSignalAbort);
            executionControllers.delete(executionController);
            activeExecutions.delete(execution);
            this.dependencies.state.activeJobCount = activeExecutions.size;
          });

        activeExecutions.add(execution);
        this.dependencies.state.activeJobCount = activeExecutions.size;
      }

      if (signal.aborted) {
        break;
      }

      if (activeExecutions.size === 0) {
        await this.dependencies.sleep(this.dependencies.config.pollIntervalMs);
        continue;
      }

      await Promise.race([
        Promise.allSettled(activeExecutions),
        this.dependencies.sleep(this.dependencies.config.pollIntervalMs)
      ]);
    }

    if (activeExecutions.size === 0) {
      return;
    }

    const waitForSettled = Promise.allSettled(activeExecutions);
    const timeout = this.dependencies.sleep(this.dependencies.config.shutdownTimeoutMs);

    const settledOrTimedOut = await Promise.race([
      waitForSettled.then(() => 'settled' as const),
      timeout.then(() => 'timeout' as const)
    ]);

    if (settledOrTimedOut === 'timeout') {
      this.dependencies.logger.warn(
        {
          workerId: this.dependencies.config.workerId,
          activeJobs: activeExecutions.size
        },
        'Worker shutdown timeout reached; aborting active processors.'
      );

      for (const controller of executionControllers) {
        controller.abort();
      }

      await Promise.allSettled(activeExecutions);
    }
  }
}
