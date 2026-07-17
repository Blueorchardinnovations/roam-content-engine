import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { PromptRunner } from '../../../src/application/ai/prompt-runner.js';
import { AIValidationError } from '../../../src/domain/ai/ai-provider-error.js';
import type { AIProvider, AIRequest } from '../../../src/domain/ai/ai-provider.js';
import { metadataPrompt } from '../../../src/infrastructure/ai/prompts/index.js';

const unsafeProvider: AIProvider = {
  providerName: 'mock',
  async generate<TSchema extends z.ZodTypeAny>(_request: AIRequest<TSchema>, _signal: AbortSignal): Promise<any> {
    return {
      provider: 'mock',
      model: 'test-model',
      output: {
        title: 'ok',
        description: 'ok',
        language: 'en',
        audience: 'general',
        unexpected: true
      },
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        estimatedCostUsd: null,
        latencyMs: 1
      },
      generatedAt: '2026-01-01T00:00:00.000Z'
    };
  }
};

describe('prompt runner', () => {
  it('revalidates provider output before returning it', async () => {
    const runner = new PromptRunner(unsafeProvider, 1000, '1.0.0');

    await expect(
      runner.run(
        metadataPrompt,
        {
          transcriptText: 'Transcript text'
        },
        new AbortController().signal
      )
    ).rejects.toBeInstanceOf(AIValidationError);
  });

  it('computes totalTokens from inputTokens plus outputTokens', async () => {
    const provider: AIProvider = {
      providerName: 'mock',
      async generate() {
        return {
          provider: 'mock',
          model: 'test-model',
          output: {
            title: 'ok',
            description: 'ok',
            language: 'en',
            audience: 'general'
          },
          usage: {
            inputTokens: 2,
            outputTokens: 3,
            totalTokens: 999,
            estimatedCostUsd: null,
            latencyMs: 1
          },
          generatedAt: '2026-01-01T00:00:00.000Z'
        };
      }
    };

    const runner = new PromptRunner(provider, 1000, '1.0.0');
    const result = await runner.run(
      metadataPrompt,
      {
        transcriptText: 'Transcript text'
      },
      new AbortController().signal
    );

    expect(result.usage.inputTokens).toBe(2);
    expect(result.usage.outputTokens).toBe(3);
    expect(result.usage.totalTokens).toBe(5);
  });

  it('rejects invalid token and latency usage values', async () => {
    const invalidValues = [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1];

    for (const invalidValue of invalidValues) {
      const provider: AIProvider = {
        providerName: 'mock',
        async generate() {
          return {
            provider: 'mock',
            model: 'test-model',
            output: {
              title: 'ok',
              description: 'ok',
              language: 'en',
              audience: 'general'
            },
            usage: {
              inputTokens: invalidValue,
              outputTokens: 1,
              totalTokens: 1,
              estimatedCostUsd: null,
              latencyMs: 1
            },
            generatedAt: '2026-01-01T00:00:00.000Z'
          };
        }
      };

      const runner = new PromptRunner(provider, 1000, '1.0.0');

      await expect(
        runner.run(
          metadataPrompt,
          {
            transcriptText: 'Transcript text'
          },
          new AbortController().signal
        )
      ).rejects.toBeInstanceOf(AIValidationError);
    }
  });
});
