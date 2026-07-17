import type { WorkerJobSource } from '../../domain/workers/worker-types.js';
import type { RetryPolicyConfig } from './retry-policy.js';
import { calculateRetryDelayMs } from './retry-policy.js';

export class StaleJobRecovery {
  public constructor(
    private readonly jobSource: WorkerJobSource,
    private readonly now: () => Date,
    private readonly maxAttempts: number,
    private readonly retryPolicy: RetryPolicyConfig,
    private readonly logger: {
      info: (payload: Record<string, unknown>, message: string) => void;
      warn: (payload: Record<string, unknown>, message: string) => void;
    }
  ) {}

  public async runOnce(limit = 50): Promise<number> {
    const currentTime = this.now();
    const staleJobs = await this.jobSource.listStaleProcessingJobs({
      now: currentTime,
      limit
    });

    let recovered = 0;

    for (const stale of staleJobs) {
      const delayMs = calculateRetryDelayMs(
        stale.attemptCount + 1,
        this.retryPolicy
      );

      const nextAttemptAt = new Date(currentTime.getTime() + delayMs);

      const updated = await this.jobSource.recoverStaleJob({
        tenantId: stale.tenantId,
        jobId: stale.id,
        maxAttempts: this.maxAttempts,
        nextAttemptAt,
        now: currentTime
      });

      if (!updated) {
        continue;
      }

      recovered += 1;

      if (updated.status === 'failed') {
        this.logger.warn(
          {
            tenantId: updated.tenantId,
            jobId: updated.id,
            attemptCount: updated.attemptCount,
            status: updated.status
          },
          'Stale processing job was moved to failed.'
        );
      } else {
        this.logger.info(
          {
            tenantId: updated.tenantId,
            jobId: updated.id,
            attemptCount: updated.attemptCount,
            status: updated.status,
            nextAttemptAt: updated.status === 'retrying'
              ? nextAttemptAt.toISOString()
              : null
          },
          'Stale processing job was recovered.'
        );
      }
    }

    return recovered;
  }
}
