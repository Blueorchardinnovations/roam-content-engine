import type { ClaimedPublishJob, PublishJobSource } from '../../domain/publish-jobs/publish-worker-types.js';

import type { PublishJobExecutor } from './publish-job-executor.js';

export type PublishWorkerLoopConfig = {
  readonly workerId: string;
  readonly pollIntervalMs: number;
  readonly leaseDurationMs: number;
  readonly concurrency: number;
  readonly shutdownTimeoutMs: number;
  readonly staleRecoveryIntervalMs: number;
};

export type PublishWorkerRuntimeState = {
  started: boolean;
  stopping: boolean;
  stopped: boolean;
  lastSuccessfulPollAt: Date | null;
  activeJobCount: number;
  lastStaleRecoveryRunAt: Date | null;
};

export type PublishWorkerLoopDependencies = {
  readonly config: PublishWorkerLoopConfig;
  readonly source: PublishJobSource;
  readonly executor: PublishJobExecutor;
  readonly state: PublishWorkerRuntimeState;
  readonly now: () => Date;
  readonly sleep: (delayMs: number) => Promise<void>;
  readonly runStaleRecovery: () => Promise<void>;
  readonly logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
};

export class PublishWorkerLoop {
  public constructor(private readonly dependencies: PublishWorkerLoopDependencies) {}

  public async run(signal: AbortSignal): Promise<void> {
    const activeExecutions = new Set<Promise<void>>();
    let nextStaleRecoveryAt = this.dependencies.now();

    while (!signal.aborted) {
      const now = this.dependencies.now();

      if (now >= nextStaleRecoveryAt) {
        try {
          await this.dependencies.runStaleRecovery();
          this.dependencies.state.lastStaleRecoveryRunAt = now;
          nextStaleRecoveryAt = new Date(now.getTime() + this.dependencies.config.staleRecoveryIntervalMs);
        } catch (error) {
          this.dependencies.logger.warn(
            {
              err: error,
              workerId: this.dependencies.config.workerId
            },
            'Publish stale lease recovery run failed.'
          );
        }
      }

      while (
        activeExecutions.size < this.dependencies.config.concurrency &&
        !signal.aborted
      ) {
        let claim: ClaimedPublishJob | null = null;

        try {
          claim = await this.dependencies.source.acquireNext({
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
            'Publish worker poll failed; retrying later.'
          );
          break;
        }

        this.dependencies.state.lastSuccessfulPollAt = this.dependencies.now();

        if (!claim) {
          break;
        }

        const execution = this.dependencies.executor
          .execute(claim, signal)
          .then((outcome) => {
            this.dependencies.logger.info(
              {
                workerId: this.dependencies.config.workerId,
                tenantId: claim.tenantId,
                publishJobId: claim.publishJobId,
                outcome
              },
              'Publish worker processed job claim.'
            );
          })
          .catch((error) => {
            this.dependencies.logger.error(
              {
                err: error,
                workerId: this.dependencies.config.workerId,
                tenantId: claim.tenantId,
                publishJobId: claim.publishJobId
              },
              'Publish worker execution failed unexpectedly.'
            );
          })
          .finally(() => {
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
        'Publish worker shutdown timeout reached with active operations.'
      );

      await Promise.allSettled(activeExecutions);
    }
  }
}
