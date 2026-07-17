import { describe, expect, it } from 'vitest';

import {
  calculateRetryDelayMs,
  evaluateRetry
} from '../../../src/application/workers/retry-policy.js';

describe('worker retry policy', () => {
  const config = {
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    maxAttempts: 5
  } as const;

  it('uses base delay for first retry', () => {
    expect(calculateRetryDelayMs(1, config)).toBe(1000);
  });

  it('doubles delay per attempt', () => {
    expect(calculateRetryDelayMs(2, config)).toBe(2000);
    expect(calculateRetryDelayMs(3, config)).toBe(4000);
  });

  it('caps delay at max', () => {
    expect(calculateRetryDelayMs(20, config)).toBe(60000);
  });

  it('prevents retry after max attempts', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    const decision = evaluateRetry({
      attemptCount: 5,
      now,
      retryable: true,
      config
    });

    expect(decision.shouldRetry).toBe(false);
    expect(decision.nextAttemptAt).toBeNull();
  });

  it('never returns negative delays', () => {
    expect(calculateRetryDelayMs(0, config)).toBe(0);
  });

  it('calculates deterministic nextAttemptAt with injected clock time', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    const decision = evaluateRetry({
      attemptCount: 1,
      now,
      retryable: true,
      config
    });

    expect(decision.shouldRetry).toBe(true);

    if (!decision.shouldRetry) {
      throw new Error('Expected retry decision.');
    }

    expect(decision.delayMs).toBe(2000);
    expect(decision.nextAttemptAt.toISOString()).toBe('2026-01-01T00:00:02.000Z');
  });
});
