import { describe, expect, it } from 'vitest';

import { AIPipeline } from '../../../src/application/ai/pipeline.js';
import { AIValidationError } from '../../../src/domain/ai/ai-provider-error.js';
import { MockAIProvider } from '../../../src/infrastructure/ai/providers/mock-provider.js';

describe('ai pipeline', () => {
  it('executes all prompts and returns aggregated output', async () => {
    const provider = new MockAIProvider({
      mode: 'success',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });

    const pipeline = new AIPipeline(provider, '1.0.0', 1000);

    const result = await pipeline.run(
      {
        transcriptText: 'Line one. Line two.'
      },
      new AbortController().signal
    );

    expect(result.pipelineVersion).toBe('1.0.0');
    expect(result.provider).toBe('mock');
    expect(result.promptExecutions).toHaveLength(5);
    expect(result.promptExecutions[0]?.stage).toBe('metadata');
    expect(result.promptExecutions[0]?.pipelineVersion).toBe('1.0.0');
    expect(result.metadata.title.length).toBeGreaterThan(0);
    expect(result.keywords.keywords.length).toBeGreaterThan(0);
    expect(result.usageTotals.totalTokens).toBeGreaterThan(0);
    expect(result.usageTotals.estimatedCostUsd).toBeNull();
  });

  it('surfaces schema validation failures from provider output', async () => {
    const provider = new MockAIProvider({
      mode: 'malformed-output',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });

    const pipeline = new AIPipeline(provider, '1.0.0', 1000);

    await expect(
      pipeline.run(
        {
          transcriptText: 'Line one. Line two.'
        },
        new AbortController().signal
      )
    ).rejects.toBeInstanceOf(AIValidationError);
  });
});
