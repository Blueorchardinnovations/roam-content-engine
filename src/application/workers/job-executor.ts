import type { JobProcessor } from '../../domain/workers/job-processor.js';
import type { WorkerHeartbeatStore } from '../../infrastructure/workers/worker-heartbeat-store.js';
import type { WorkerJobSource, WorkerLeasedJob } from '../../domain/workers/worker-types.js';
import {
  LeaseLostError,
  PermanentWorkerError,
  RetryableWorkerError,
  UnsupportedJobTypeError,
  WorkerCancelledError
} from '../../domain/workers/worker-errors.js';
import type { PlatformError } from '../../platform/shared/errors/index.js';
import { ErrorCode } from '../../platform/shared/errors/codes.js';

import { evaluateRetry, type RetryPolicyConfig } from './retry-policy.js';

type ExecutorDependencies = {
  readonly jobSource: WorkerJobSource;
  readonly heartbeatStore: WorkerHeartbeatStore;
  readonly processors: readonly JobProcessor[];
  readonly now: () => Date;
  readonly sleep: (delayMs: number) => Promise<void>;
  readonly heartbeatIntervalMs: number;
  readonly leaseDurationMs: number;
  readonly retryPolicy: RetryPolicyConfig;
  readonly maxAttempts: number;
  readonly logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
};

export type JobExecutionOutcome =
  | 'completed'
  | 'retry-scheduled'
  | 'failed'
  | 'lease-lost'
  | 'cancelled';

export class JobExecutor {
  private readonly processorsByType: ReadonlyMap<string, JobProcessor>;

  public constructor(
    private readonly dependencies: ExecutorDependencies
  ) {
    this.processorsByType = new Map(
      dependencies.processors.map((processor) => [processor.jobType, processor])
    );
  }

  public async execute(
    job: WorkerLeasedJob,
    signal: AbortSignal
  ): Promise<JobExecutionOutcome> {
    const processor = this.processorsByType.get('transcript-processing');

    if (!processor) {
      await this.markPermanentFailure(
        job,
        new UnsupportedJobTypeError('transcript-processing')
      );

      return 'failed';
    }

    const jobAbortController = new AbortController();

    if (signal.aborted) {
      jobAbortController.abort();
    }

    const onAbort = () => {
      jobAbortController.abort();
    };

    signal.addEventListener('abort', onAbort);

    let heartbeatLoopActive = true;
    let cleanupStarted = false;
    let leaseLost = false;
    let heartbeatInFlight: Promise<void> | null = null;
    let heartbeatRequested = false;

    const renewLeaseOnce = async (): Promise<void> => {
      if (cleanupStarted || !heartbeatLoopActive || jobAbortController.signal.aborted) {
        return;
      }

      const renewed = await this.dependencies.heartbeatStore.renewLease({
        tenantId: job.tenantId,
        jobId: job.id,
        workerId: job.leaseOwner,
        leaseDurationMs: this.dependencies.leaseDurationMs,
        now: this.dependencies.now()
      });

      if (!renewed) {
        leaseLost = true;
        jobAbortController.abort();
        throw new LeaseLostError();
      }
    };

    const requestHeartbeat = (): Promise<void> => {
      if (cleanupStarted || !heartbeatLoopActive || jobAbortController.signal.aborted) {
        return Promise.resolve();
      }

      heartbeatRequested = true;

      if (heartbeatInFlight) {
        return heartbeatInFlight;
      }

      heartbeatInFlight = (async () => {
        while (heartbeatRequested) {
          heartbeatRequested = false;
          await renewLeaseOnce();

          if (cleanupStarted || !heartbeatLoopActive || jobAbortController.signal.aborted) {
            heartbeatRequested = false;
            break;
          }
        }
      })().finally(() => {
        heartbeatInFlight = null;
      });

      return heartbeatInFlight;
    };

    const heartbeatLoop = (async () => {
      while (heartbeatLoopActive && !jobAbortController.signal.aborted) {
        await this.dependencies.sleep(this.dependencies.heartbeatIntervalMs);

        if (!heartbeatLoopActive || jobAbortController.signal.aborted) {
          break;
        }

        try {
          await requestHeartbeat();
        } catch (error) {
          if (error instanceof LeaseLostError) {
            break;
          }

          throw error;
        }
      }
    })();

    const heartbeat = async (): Promise<void> => {
      await requestHeartbeat();
    };

    const reportStage = async (stage: WorkerLeasedJob['currentStage']) => {
      const updated = await this.dependencies.jobSource.markStage({
        tenantId: job.tenantId,
        jobId: job.id,
        workerId: job.leaseOwner,
        stage,
        now: this.dependencies.now()
      });

      if (!updated) {
        leaseLost = true;
        throw new LeaseLostError();
      }
    };

    try {
      const result = await processor.process({
        job,
        signal: jobAbortController.signal,
        reportStage,
        heartbeat
      });

      if (leaseLost) {
        return 'lease-lost';
      }

      const completed = await this.dependencies.jobSource.markCompleted({
        tenantId: job.tenantId,
        jobId: job.id,
        workerId: job.leaseOwner,
        result,
        now: this.dependencies.now()
      });

      if (!completed) {
        return 'lease-lost';
      }

      this.dependencies.logger.info(
        {
          workerId: job.leaseOwner,
          tenantId: job.tenantId,
          jobId: job.id,
          attemptCount: completed.attemptCount,
          status: completed.status
        },
        'Worker job completed successfully.'
      );

      return 'completed';
    } catch (error) {
      if (leaseLost || error instanceof LeaseLostError) {
        this.dependencies.logger.warn(
          {
            workerId: job.leaseOwner,
            tenantId: job.tenantId,
            jobId: job.id
          },
          'Worker lease was lost during execution.'
        );

        return 'lease-lost';
      }

      if (jobAbortController.signal.aborted || error instanceof WorkerCancelledError) {
        this.dependencies.logger.warn(
          {
            workerId: job.leaseOwner,
            tenantId: job.tenantId,
            jobId: job.id
          },
          'Worker job execution was cancelled.'
        );

        return 'cancelled';
      }

      const mappedError = this.classifyError(error);

      if (mappedError.retryable) {
        return await this.scheduleRetryOrFail(job, mappedError.error);
      }

      await this.markPermanentFailure(job, mappedError.error);
      return 'failed';
    } finally {
      cleanupStarted = true;
      heartbeatLoopActive = false;
      heartbeatRequested = false;
      signal.removeEventListener('abort', onAbort);
      await heartbeatLoop;
      await heartbeatInFlight;
    }
  }

  private classifyError(error: unknown): {
    retryable: boolean;
    error: RetryableWorkerError | PermanentWorkerError;
  } {
    if (error instanceof RetryableWorkerError) {
      return {
        retryable: true,
        error
      };
    }

    if (error instanceof PermanentWorkerError) {
      return {
        retryable: false,
        error
      };
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as PlatformError).code === ErrorCode.DATABASE_UNAVAILABLE
    ) {
      return {
        retryable: true,
        error: new RetryableWorkerError('Database was temporarily unavailable.', 'DATABASE_UNAVAILABLE')
      };
    }

    return {
      retryable: true,
      error: new RetryableWorkerError(
        'Unexpected processor failure.',
        ErrorCode.WORKER_UNEXPECTED_ERROR
      )
    };
  }

  private sanitizeErrorMessage(error: Error): string {
    return error.message.length > 500
      ? error.message.slice(0, 500)
      : error.message;
  }

  private async scheduleRetryOrFail(
    job: WorkerLeasedJob,
    error: RetryableWorkerError
  ): Promise<JobExecutionOutcome> {
    const now = this.dependencies.now();
    const decision = evaluateRetry({
      attemptCount: job.attemptCount,
      now,
      retryable: true,
      config: this.dependencies.retryPolicy
    });

    if (!decision.shouldRetry || job.attemptCount >= this.dependencies.maxAttempts) {
      await this.markPermanentFailure(
        job,
        new PermanentWorkerError(
          this.sanitizeErrorMessage(error),
          ErrorCode.WORKER_MAX_ATTEMPTS_EXCEEDED
        )
      );
      return error.code === ErrorCode.WORKER_CANCELLED ? 'cancelled' : 'failed';
    }

    const scheduled = await this.dependencies.jobSource.scheduleRetry({
      tenantId: job.tenantId,
      jobId: job.id,
      workerId: job.leaseOwner,
      errorCode: error.code,
      errorMessage: this.sanitizeErrorMessage(error),
      nextAttemptAt: decision.nextAttemptAt,
      now
    });

    if (!scheduled) {
      throw new LeaseLostError();
    }

    this.dependencies.logger.warn(
      {
        workerId: job.leaseOwner,
        tenantId: job.tenantId,
        jobId: job.id,
        attemptCount: scheduled.attemptCount,
        nextAttemptAt: decision.nextAttemptAt.toISOString(),
        errorCode: error.code
      },
      'Worker job scheduled for retry.'
    );

    return error.code === ErrorCode.WORKER_CANCELLED
      ? 'cancelled'
      : 'retry-scheduled';
  }

  private async markPermanentFailure(
    job: WorkerLeasedJob,
    error: PermanentWorkerError
  ): Promise<void> {
    const failed = await this.dependencies.jobSource.markFailed({
      tenantId: job.tenantId,
      jobId: job.id,
      workerId: job.leaseOwner,
      errorCode: error.code,
      errorMessage: this.sanitizeErrorMessage(error),
      now: this.dependencies.now()
    });

    if (!failed) {
      throw new LeaseLostError();
    }

    this.dependencies.logger.error(
      {
        workerId: job.leaseOwner,
        tenantId: job.tenantId,
        jobId: job.id,
        attemptCount: failed.attemptCount,
        errorCode: error.code
      },
      'Worker job failed permanently.'
    );
  }
}
