export type RetryPolicyConfig = {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxAttempts: number;
  readonly jitterRatio?: number;
  readonly random?: () => number;
};

export type RetryDecision =
  | {
      readonly shouldRetry: false;
      readonly delayMs: 0;
      readonly nextAttemptAt: Date | null;
    }
  | {
      readonly shouldRetry: true;
      readonly delayMs: number;
      readonly nextAttemptAt: Date;
    };

export function calculateRetryDelayMs(
  attemptNumber: number,
  config: RetryPolicyConfig
): number {
  if (attemptNumber <= 0) {
    return 0;
  }

  const exponentialDelay = config.baseDelayMs * 2 ** (attemptNumber - 1);
  const cappedDelay = Math.min(config.maxDelayMs, exponentialDelay);
  const jitterRatio = config.jitterRatio ?? 0;

  if (jitterRatio <= 0) {
    return Math.max(0, Math.floor(cappedDelay));
  }

  const random = config.random ?? Math.random;
  const jitterFactor = 1 + (random() * 2 - 1) * jitterRatio;

  return Math.max(0, Math.floor(cappedDelay * jitterFactor));
}

export function evaluateRetry(input: {
  readonly attemptCount: number;
  readonly now: Date;
  readonly retryable: boolean;
  readonly config: RetryPolicyConfig;
}): RetryDecision {
  if (!input.retryable || input.attemptCount >= input.config.maxAttempts) {
    return {
      shouldRetry: false,
      delayMs: 0,
      nextAttemptAt: null
    };
  }

  const nextAttemptNumber = input.attemptCount + 1;
  const delayMs = calculateRetryDelayMs(nextAttemptNumber, input.config);

  return {
    shouldRetry: true,
    delayMs,
    nextAttemptAt: new Date(input.now.getTime() + delayMs)
  };
}
