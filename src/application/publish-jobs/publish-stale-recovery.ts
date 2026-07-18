import { calculateRetryDelayMs, type RetryPolicyConfig } from '../workers/retry-policy.js';
import type { PublishJobRepository } from '../../domain/repositories/publish-job-repository.js';

export class PublishStaleRecovery {
  public constructor(
    private readonly repository: PublishJobRepository,
    private readonly now: () => Date,
    private readonly retryPolicy: RetryPolicyConfig,
    private readonly maxConsecutiveFailures: number,
    private readonly logger: {
      info: (payload: Record<string, unknown>, message: string) => void;
      warn: (payload: Record<string, unknown>, message: string) => void;
    }
  ) {}

  public async runOnce(limit = 50): Promise<number> {
    const currentTime = this.now();
    const retryDelayMs = calculateRetryDelayMs(1, this.retryPolicy);

    const recovered = await this.repository.recoverStaleLeases({
      now: currentTime,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
      retryDelayMs,
      limit
    });

    if (recovered > 0) {
      this.logger.warn(
        {
          recovered,
          at: currentTime.toISOString()
        },
        'Recovered stale publish job leases.'
      );
    } else {
      this.logger.info(
        {
          recovered,
          at: currentTime.toISOString()
        },
        'No stale publish job leases to recover.'
      );
    }

    return recovered;
  }
}
