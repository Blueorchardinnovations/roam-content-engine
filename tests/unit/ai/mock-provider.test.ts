import { describe, expect, it } from 'vitest';

import { AIProviderUnavailableError, AIPermanentError, AIValidationError, AITimeoutError } from '../../../src/domain/ai/ai-provider-error.js';
import { MockAIProvider } from '../../../src/infrastructure/ai/providers/mock-provider.js';
import { aiMetadataSchema } from '../../../src/schemas/ai/metadata-schema.js';
import { aiSummarySchema } from '../../../src/schemas/ai/summary-schema.js';
import { aiKeywordsSchema } from '../../../src/schemas/ai/keywords-schema.js';
import { aiScriptureSchema } from '../../../src/schemas/ai/scripture-schema.js';
import { aiReflectionsSchema } from '../../../src/schemas/ai/reflections-schema.js';
import { WorkerCancelledError } from '../../../src/domain/workers/worker-errors.js';

describe('mock ai provider', () => {
  it('returns deterministic success output for identical input', async () => {
    const provider = new MockAIProvider({
      mode: 'success',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });

    const signal = new AbortController().signal;
    const request = {
      stage: 'metadata',
      promptKey: 'metadata',
      promptVersion: '1.0',
      pipelineVersion: '1.0.0',
      prompt: 'Transcript text',
      schema: aiMetadataSchema,
      model: 'test-model',
      temperature: 0,
      maxTokens: 100,
      timeoutMs: 1000
    };

    const first = await provider.generate(request, signal);
    const second = await provider.generate(request, signal);

    expect(first.output).toEqual(second.output);
    expect(first.usage.totalTokens).toBe(first.usage.inputTokens + first.usage.outputTokens);
    expect(first.usage.estimatedCostUsd).toBeNull();
  });

  it('supports all failure modes including cancellation', async () => {
    const cancelled = new MockAIProvider({
      mode: 'success',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });
    const controller = new AbortController();
    controller.abort();

    await expect(cancelled.generate({
      stage: 'metadata',
      promptKey: 'metadata',
      promptVersion: '1.0',
      pipelineVersion: '1.0.0',
      prompt: 'Transcript text',
      schema: aiMetadataSchema,
      model: 'test-model',
      temperature: 0,
      maxTokens: 100,
      timeoutMs: 1000
    }, controller.signal)).rejects.toBeInstanceOf(WorkerCancelledError);

    await expect(new MockAIProvider({
      mode: 'retryable-failure',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    }).generate({
      stage: 'summary',
      promptKey: 'summary',
      promptVersion: '1.0',
      pipelineVersion: '1.0.0',
      prompt: 'Transcript text',
      schema: aiSummarySchema,
      model: 'test-model',
      temperature: 0,
      maxTokens: 100,
      timeoutMs: 1000
    }, new AbortController().signal)).rejects.toBeInstanceOf(AIProviderUnavailableError);

    await expect(new MockAIProvider({
      mode: 'permanent-failure',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    }).generate({
      stage: 'keywords',
      promptKey: 'keywords',
      promptVersion: '1.0',
      pipelineVersion: '1.0.0',
      prompt: 'Transcript text',
      schema: aiKeywordsSchema,
      model: 'test-model',
      temperature: 0,
      maxTokens: 100,
      timeoutMs: 1000
    }, new AbortController().signal)).rejects.toBeInstanceOf(AIPermanentError);

    await expect(new MockAIProvider({
      mode: 'timeout',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    }).generate({
      stage: 'scripture',
      promptKey: 'scripture',
      promptVersion: '1.0',
      pipelineVersion: '1.0.0',
      prompt: 'Transcript text',
      schema: aiScriptureSchema,
      model: 'test-model',
      temperature: 0,
      maxTokens: 100,
      timeoutMs: 1000
    }, new AbortController().signal)).rejects.toBeInstanceOf(AITimeoutError);

    await expect(new MockAIProvider({
      mode: 'malformed-output',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    }).generate({
      stage: 'reflections',
      promptKey: 'reflections',
      promptVersion: '1.0',
      pipelineVersion: '1.0.0',
      prompt: 'Transcript text',
      schema: aiReflectionsSchema,
      model: 'test-model',
      temperature: 0,
      maxTokens: 100,
      timeoutMs: 1000
    }, new AbortController().signal)).rejects.toBeInstanceOf(AIValidationError);
  });
});
