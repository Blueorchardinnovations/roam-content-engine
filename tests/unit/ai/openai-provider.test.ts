import { describe, expect, it, vi } from 'vitest';

import {
  AIAuthenticationError,
  AIProviderUnavailableError,
  AIRateLimitError,
  AITimeoutError,
  AIValidationError,
  AIPermanentError
} from '../../../src/domain/ai/ai-provider-error.js';
import { WorkerCancelledError } from '../../../src/domain/workers/worker-errors.js';
import { OpenAIProvider } from '../../../src/infrastructure/ai/providers/openai-provider.js';
import { aiMetadataSchema } from '../../../src/schemas/ai/metadata-schema.js';

function buildRequest() {
  return {
    stage: 'metadata',
    promptKey: 'metadata',
    promptVersion: '1.0',
    pipelineVersion: '1.0.0',
    prompt: 'Return metadata JSON.',
    schema: aiMetadataSchema,
    model: 'default',
    temperature: 0,
    maxTokens: 100,
    timeoutMs: 1000
  } as const;
}

function createProvider(
  create: (...args: any[]) => Promise<any>,
  now: () => Date = () => new Date('2026-01-01T00:00:00.000Z')
) {
  return new OpenAIProvider({
    apiKey: 'test-key',
    defaultModel: 'test-model',
    timeoutMs: 1000,
    now,
    createClient: () => ({
      chat: {
        completions: {
          create
        }
      }
    } as any)
  });
}

function createPendingSdkResponse() {
  return async (_request: any, options: { signal: AbortSignal }) => {
    return await new Promise((_, reject) => {
      const onAbort = () => reject(new Error('aborted'));

      if (options.signal.aborted) {
        onAbort();
        return;
      }

      options.signal.addEventListener('abort', onAbort, { once: true });
    });
  };
}

describe('openai provider', () => {
  it('propagates caller cancellation to the SDK request and returns a cancellation error', async () => {
    let observedSignal: AbortSignal | null = null;

    const provider = createProvider(async (_request, options) => {
      observedSignal = options.signal;
      return await new Promise((_, reject) => {
        const onAbort = () => reject(new Error('aborted'));

        if (options.signal.aborted) {
          onAbort();
          return;
        }

        options.signal.addEventListener('abort', onAbort, { once: true });
      });
    });

    const controller = new AbortController();
    const result = provider.generate(buildRequest(), controller.signal);
    const expectation = expect(result).rejects.toBeInstanceOf(WorkerCancelledError);

    controller.abort();

    await expectation;
    expect(observedSignal).not.toBeNull();
    expect(observedSignal?.aborted).toBe(true);
  });

  it('maps provider timeout to AITimeoutError', async () => {
    vi.useFakeTimers();
    try {
      const provider = createProvider(createPendingSdkResponse());

      const promise = provider.generate(buildRequest(), new AbortController().signal);
      const expectation = expect(promise).rejects.toBeInstanceOf(AITimeoutError);
      await vi.advanceTimersByTimeAsync(1000);

      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps rate limit failures to AIRateLimitError', async () => {
    const error = new Error('rate limited') as Error & { status: number };
    error.status = 429;

    const provider = createProvider(async () => {
      throw error;
    });

    await expect(provider.generate(buildRequest(), new AbortController().signal)).rejects.toBeInstanceOf(AIRateLimitError);
  });

  it('maps provider unavailable failures to AIProviderUnavailableError', async () => {
    const error = new Error('server unavailable') as Error & { status: number };
    error.status = 503;

    const provider = createProvider(async () => {
      throw error;
    });

    await expect(provider.generate(buildRequest(), new AbortController().signal)).rejects.toBeInstanceOf(AIProviderUnavailableError);
  });

  it('maps authentication and permission failures to permanent AI errors', async () => {
    const authError = new Error('auth failed') as Error & { status: number };
    authError.status = 401;

    const permissionError = new Error('permission denied') as Error & { status: number };
    permissionError.status = 403;

    const authProvider = createProvider(async () => {
      throw authError;
    });
    const permissionProvider = createProvider(async () => {
      throw permissionError;
    });

    await expect(authProvider.generate(buildRequest(), new AbortController().signal)).rejects.toBeInstanceOf(AIAuthenticationError);
    await expect(permissionProvider.generate(buildRequest(), new AbortController().signal)).rejects.toBeInstanceOf(AIAuthenticationError);
  });

  it('maps invalid request failures to permanent AI errors', async () => {
    const error = new Error('bad request') as Error & { status: number };
    error.status = 400;

    const provider = createProvider(async () => {
      throw error;
    });

    await expect(provider.generate(buildRequest(), new AbortController().signal)).rejects.toBeInstanceOf(AIPermanentError);
  });

  it('rejects empty, whitespace-only, truncated, malformed, and schema-invalid outputs', async () => {
    const emptyProvider = createProvider(async () => ({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: ''
          }
        }
      ]
    }));

    const whitespaceProvider = createProvider(async () => ({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: '   '
          }
        }
      ]
    }));

    const truncatedProvider = createProvider(async () => ({
      choices: [
        {
          finish_reason: 'length',
          message: {
            content: '{"title": "partial"}'
          }
        }
      ]
    }));

    const malformedProvider = createProvider(async () => ({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: 'not-json'
          }
        }
      ]
    }));

    const schemaInvalidProvider = createProvider(async () => ({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              title: 'ok'
            })
          }
        }
      ]
    }));

    for (const provider of [emptyProvider, whitespaceProvider, truncatedProvider, malformedProvider, schemaInvalidProvider]) {
      await expect(provider.generate(buildRequest(), new AbortController().signal)).rejects.toBeInstanceOf(AIValidationError);
    }
  });

  it('handles explicit refusal without parsing model text', async () => {
    const provider = createProvider(async () => ({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            refusal: 'unsafe content',
            content: null
          }
        }
      ]
    }));

    await expect(provider.generate(buildRequest(), new AbortController().signal)).rejects.toBeInstanceOf(AIPermanentError);
  });

  it('preserves missing usage fields safely', async () => {
    const provider = createProvider(async () => ({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              title: 'Title',
              description: 'Description',
              language: 'en',
              audience: 'general'
            })
          }
        }
      ]
    }));

    const result = await provider.generate(buildRequest(), new AbortController().signal);

    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    expect(result.usage.totalTokens).toBe(0);
    expect(result.usage.estimatedCostUsd).toBeNull();
  });

  it('computes totalTokens from prompt and completion tokens when provider total conflicts', async () => {
    const provider = createProvider(async () => ({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              title: 'Title',
              description: 'Description',
              language: 'en',
              audience: 'general'
            })
          }
        }
      ],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 4,
        total_tokens: 999
      }
    }));

    const result = await provider.generate(buildRequest(), new AbortController().signal);

    expect(result.usage.inputTokens).toBe(3);
    expect(result.usage.outputTokens).toBe(4);
    expect(result.usage.totalTokens).toBe(7);
  });

  it('rejects invalid usage token counts', async () => {
    const invalidUsageValues = [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1];

    for (const invalid of invalidUsageValues) {
      const provider = createProvider(async () => ({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                title: 'Title',
                description: 'Description',
                language: 'en',
                audience: 'general'
              })
            }
          }
        ],
        usage: {
          prompt_tokens: invalid,
          completion_tokens: 1,
          total_tokens: 2
        }
      }));

      await expect(provider.generate(buildRequest(), new AbortController().signal)).rejects.toBeInstanceOf(AIValidationError);
    }
  });
});
