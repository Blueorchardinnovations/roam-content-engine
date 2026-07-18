import type { RetryPolicyConfig } from '../../application/workers/retry-policy.js';
import { calculateRetryDelayMs } from '../../application/workers/retry-policy.js';

export type RetryableOperationType = 'submission' | 'read';

export type PublishEngineRetryContext = {
  readonly operationType: RetryableOperationType;
  readonly hasIdempotencyKey: boolean;
};

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

export function shouldRetryOperation(context: PublishEngineRetryContext): boolean {
  if (context.operationType === 'read') {
    return true;
  }

  return context.hasIdempotencyKey;
}

export function resolveRetryDelayMs(input: {
  readonly attemptNumber: number;
  readonly retryAfterMs?: number;
  readonly retryPolicy: RetryPolicyConfig;
  readonly remainingBudgetMs: number;
}): number {
  const base = input.retryAfterMs
    ?? calculateRetryDelayMs(input.attemptNumber, input.retryPolicy);

  const bounded = Math.min(base, input.retryPolicy.maxDelayMs, input.remainingBudgetMs);
  return Math.max(0, Math.floor(bounded));
}

export function parseRetryAfterMs(headerValue: string | null, nowMs: number): number | undefined {
  if (!headerValue) {
    return undefined;
  }

  const trimmed = headerValue.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds)) {
    if (asSeconds < 0) {
      return undefined;
    }

    return Math.floor(asSeconds * 1000);
  }

  const asDate = Date.parse(trimmed);
  if (!Number.isFinite(asDate)) {
    return undefined;
  }

  const delta = asDate - nowMs;
  if (delta < 0) {
    return 0;
  }

  return Math.floor(delta);
}
