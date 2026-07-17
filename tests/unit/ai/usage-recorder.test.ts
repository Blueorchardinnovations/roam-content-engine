import { describe, expect, it } from 'vitest';

import { mergeUsageTotals } from '../../../src/application/ai/usage-recorder.js';

describe('usage recorder', () => {
  it('aggregates token usage and preserves absent cost', () => {
    const totals = mergeUsageTotals([
      {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        estimatedCostUsd: null,
        latencyMs: 5
      },
      {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        estimatedCostUsd: null,
        latencyMs: 7
      }
    ]);

    expect(totals.inputTokens).toBe(11);
    expect(totals.outputTokens).toBe(22);
    expect(totals.totalTokens).toBe(33);
    expect(totals.latencyMs).toBe(12);
    expect(totals.estimatedCostUsd).toBeNull();
    expect(totals.totalTokens).toBe(totals.inputTokens + totals.outputTokens);
  });

  it('computes aggregated total from aggregated input and output', () => {
    const totals = mergeUsageTotals([
      {
        inputTokens: 4,
        outputTokens: 6,
        totalTokens: 100,
        estimatedCostUsd: null,
        latencyMs: 2
      },
      {
        inputTokens: 2,
        outputTokens: 3,
        totalTokens: 100,
        estimatedCostUsd: null,
        latencyMs: 3
      }
    ]);

    expect(totals.inputTokens).toBe(6);
    expect(totals.outputTokens).toBe(9);
    expect(totals.totalTokens).toBe(15);
  });

  it('throws when aggregation overflows safe integer range', () => {
    expect(() => mergeUsageTotals([
      {
        inputTokens: Number.MAX_SAFE_INTEGER,
        outputTokens: 0,
        totalTokens: Number.MAX_SAFE_INTEGER,
        estimatedCostUsd: null,
        latencyMs: 1
      },
      {
        inputTokens: 1,
        outputTokens: 0,
        totalTokens: 1,
        estimatedCostUsd: null,
        latencyMs: 1
      }
    ])).toThrow();
  });
});
