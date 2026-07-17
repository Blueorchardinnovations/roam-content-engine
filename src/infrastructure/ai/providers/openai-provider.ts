import OpenAI from 'openai';
import type { z } from 'zod';

import type { AIProvider, AIRequest } from '../../../domain/ai/ai-provider.js';
import type { AIProviderResult } from '../../../domain/ai/ai-provider-result.js';
import {
  AIProviderError,
  AIAuthenticationError,
  AIPermanentError,
  AIProviderUnavailableError,
  AIRateLimitError,
  AITimeoutError,
  AIValidationError
} from '../../../domain/ai/ai-provider-error.js';
import { WorkerCancelledError } from '../../../domain/workers/worker-errors.js';

export type OpenAIProviderDependencies = {
  readonly apiKey: string;
  readonly defaultModel: string;
  readonly timeoutMs: number;
  readonly now: () => Date;
  readonly createClient?: (apiKey: string, timeoutMs: number) => OpenAI;
};

function defaultClientFactory(apiKey: string, timeoutMs: number): OpenAI {
  return new OpenAI({
    apiKey,
    maxRetries: 0,
    timeout: timeoutMs
  });
}

function mapOpenAIError(error: unknown): never {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    throw new AITimeoutError('OpenAI request timed out.', undefined, error);
  }

  if (error instanceof OpenAI.APIUserAbortError) {
    throw new WorkerCancelledError('OpenAI request was cancelled.');
  }

  if (error instanceof OpenAI.AuthenticationError) {
    throw new AIAuthenticationError('OpenAI authentication failed.', undefined, error);
  }

  if (error instanceof OpenAI.PermissionDeniedError) {
    throw new AIAuthenticationError('OpenAI permission denied.', undefined, error);
  }

  if (error instanceof OpenAI.BadRequestError) {
    throw new AIPermanentError('OpenAI request was rejected.', undefined, error);
  }

  if (error instanceof OpenAI.RateLimitError) {
    throw new AIRateLimitError('OpenAI rate limit exceeded.', undefined, error);
  }

  if (error instanceof OpenAI.InternalServerError || error instanceof OpenAI.APIConnectionError) {
    throw new AIProviderUnavailableError('OpenAI service is unavailable.', undefined, error);
  }

  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: number }).status;

    if (status === 401 || status === 403) {
      throw new AIAuthenticationError('OpenAI authentication failed.', undefined, error);
    }

    if (status === 429) {
      throw new AIRateLimitError('OpenAI rate limit exceeded.', undefined, error);
    }

    if (status !== undefined && status >= 500) {
      throw new AIProviderUnavailableError('OpenAI service is unavailable.', undefined, error);
    }

    if (status !== undefined && status >= 400) {
      throw new AIPermanentError('OpenAI request failed.', { status }, error);
    }
  }

  if (error instanceof Error && /abort|timeout/i.test(error.message)) {
    throw new AIProviderUnavailableError('OpenAI request failed unexpectedly.', undefined, error);
  }

  throw new AIProviderUnavailableError('OpenAI request failed unexpectedly.', undefined, error);
}

function parseOptionalTokenCount(
  value: unknown,
  field: string,
  request: Pick<AIRequest<z.ZodTypeAny>, 'stage' | 'promptKey' | 'promptVersion'>
): number {
  if (value === undefined || value === null) {
    return 0;
  }

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new AIValidationError('OpenAI usage token count was invalid.', {
      stage: request.stage,
      promptKey: request.promptKey,
      promptVersion: request.promptVersion,
      field
    });
  }

  return value;
}

function checkedTokenSum(
  inputTokens: number,
  outputTokens: number,
  request: Pick<AIRequest<z.ZodTypeAny>, 'stage' | 'promptKey' | 'promptVersion'>
): number {
  const total = inputTokens + outputTokens;

  if (!Number.isSafeInteger(total) || total < 0) {
    throw new AIValidationError('OpenAI token usage overflowed safe integer range.', {
      stage: request.stage,
      promptKey: request.promptKey,
      promptVersion: request.promptVersion,
      field: 'totalTokens'
    });
  }

  return total;
}

export class OpenAIProvider implements AIProvider {
  public readonly providerName = 'openai' as const;

  private readonly client: OpenAI;

  public constructor(
    private readonly dependencies: OpenAIProviderDependencies
  ) {
    const factory = dependencies.createClient ?? defaultClientFactory;
    this.client = factory(dependencies.apiKey, dependencies.timeoutMs);
  }

  public async generate<TSchema extends z.ZodTypeAny>(
    request: AIRequest<TSchema>,
    signal: AbortSignal
  ): Promise<AIProviderResult<z.infer<TSchema>>> {
    const startedAt = this.dependencies.now().getTime();
    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      timeoutController.abort();
    }, request.timeoutMs);

    const requestController = new AbortController();
    const onCallerAbort = () => {
      requestController.abort();
    };
    const onTimeoutAbort = () => {
      requestController.abort();
    };

    if (signal.aborted) {
      throw new WorkerCancelledError('OpenAI request was cancelled before start.');
    }

    signal.addEventListener('abort', onCallerAbort, { once: true });
    timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });

    try {
      const completion = await this.client.chat.completions.create(
        {
          model: this.dependencies.defaultModel,
          messages: [
            {
              role: 'system',
              content: 'You are a strict JSON generator. Respond with valid JSON only.'
            },
            {
              role: 'user',
              content: request.prompt
            }
          ],
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          response_format: { type: 'json_object' }
        },
        {
          signal: requestController.signal
        }
      );

      if (signal.aborted) {
        throw new WorkerCancelledError('OpenAI request was cancelled.');
      }

      if (timeoutController.signal.aborted) {
        throw new AITimeoutError('OpenAI request timed out.');
      }

      const choice = completion.choices[0];
      const refusal = choice?.message?.refusal;
      const rawContent = choice?.message?.content;
      const finishReason = choice?.finish_reason;

      if (refusal && refusal.trim().length > 0) {
        throw new AIPermanentError('OpenAI response was refused.', {
          promptKey: request.promptKey,
          promptVersion: request.promptVersion,
          stage: request.stage,
          refusal: true
        });
      }

      if (finishReason === 'length') {
        throw new AIValidationError('OpenAI response was truncated.', {
          promptKey: request.promptKey
        });
      }

      if (rawContent === undefined || rawContent === null) {
        throw new AIValidationError('OpenAI response did not include content.', {
          promptKey: request.promptKey,
          promptVersion: request.promptVersion,
          stage: request.stage
        });
      }

      if (typeof rawContent !== 'string' || rawContent.trim().length === 0) {
        throw new AIValidationError('OpenAI response content was empty.', {
          promptKey: request.promptKey,
          promptVersion: request.promptVersion,
          stage: request.stage
        });
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawContent);
      } catch (error) {
        throw new AIValidationError('OpenAI response was not valid JSON.', {
          promptKey: request.promptKey,
          promptVersion: request.promptVersion,
          stage: request.stage
        }, error);
      }

      const parsed = request.schema.safeParse(parsedJson);

      if (!parsed.success) {
        throw new AIValidationError('OpenAI response failed schema validation.', {
          promptKey: request.promptKey,
          promptVersion: request.promptVersion,
          stage: request.stage,
          issues: parsed.error.issues
        });
      }

      const inputTokens = parseOptionalTokenCount(completion.usage?.prompt_tokens, 'prompt_tokens', request);
      const outputTokens = parseOptionalTokenCount(completion.usage?.completion_tokens, 'completion_tokens', request);
      const totalTokens = checkedTokenSum(inputTokens, outputTokens, request);

      if (completion.usage?.total_tokens !== undefined && completion.usage?.total_tokens !== null) {
        parseOptionalTokenCount(completion.usage.total_tokens, 'total_tokens', request);
      }

      const latencyMs = Math.max(0, this.dependencies.now().getTime() - startedAt);

      return {
        provider: this.providerName,
        model: this.dependencies.defaultModel,
        output: parsed.data,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCostUsd: null,
          latencyMs
        },
        generatedAt: this.dependencies.now().toISOString()
      };
    } catch (error) {
      if (signal.aborted) {
        throw new WorkerCancelledError('OpenAI request was cancelled.');
      }

      if (timeoutController.signal.aborted) {
        throw new AITimeoutError('OpenAI request timed out.', undefined, error);
      }

      if (error instanceof AIProviderError) {
        throw error;
      }

      mapOpenAIError(error);
    } finally {
      clearTimeout(timeoutHandle);
      signal.removeEventListener('abort', onCallerAbort);
      timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
    }
  }
}
