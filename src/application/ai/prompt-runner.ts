import type { z } from 'zod';

import type { AIProvider } from '../../domain/ai/ai-provider.js';
import { AIValidationError } from '../../domain/ai/ai-provider-error.js';
import type { AIUsage } from '../../domain/ai/ai-usage.js';
import type { PromptDefinition, PromptRunMetadata } from '../../domain/ai/prompt-version.js';

export type PromptRunResult<TOutput> = {
  readonly output: TOutput;
  readonly metadata: PromptRunMetadata;
  readonly provider: string;
  readonly model: string;
  readonly generatedAt: string;
  readonly usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number | null;
    latencyMs: number;
  };
};

export class PromptRunner {
  public constructor(
    private readonly provider: AIProvider,
    private readonly timeoutMs: number,
    private readonly pipelineVersion: string
  ) {}

  public async run<TInput, TSchema extends z.ZodTypeAny>(
    definition: PromptDefinition<TInput, TSchema>,
    input: TInput,
    signal: AbortSignal
  ): Promise<PromptRunResult<z.infer<TSchema>>> {
    const result = await this.provider.generate(
      {
        stage: definition.stage,
        promptKey: definition.key,
        promptVersion: definition.version,
        pipelineVersion: this.pipelineVersion,
        prompt: definition.buildPrompt(input),
        schema: definition.schema,
        model: definition.modelPreference.model,
        temperature: definition.modelPreference.temperature,
        maxTokens: definition.modelPreference.maxTokens,
        timeoutMs: this.timeoutMs
      },
      signal
    );

    const parsedOutput = definition.schema.safeParse(result.output);

    if (!parsedOutput.success) {
      throw new AIValidationError('Prompt output failed runtime validation.', {
        stage: definition.stage,
        promptKey: definition.key,
        promptVersion: definition.version,
        issues: parsedOutput.error.issues
      });
    }

    const usage = this.normalizeUsage(result.usage, {
      stage: definition.stage,
      promptKey: definition.key,
      promptVersion: definition.version
    });

    return {
      output: parsedOutput.data,
      metadata: {
        stage: definition.stage,
        promptKey: definition.key,
        promptVersion: definition.version
      },
      provider: result.provider,
      model: result.model,
      generatedAt: result.generatedAt,
      usage
    };
  }

  private normalizeUsage(
    usage: AIUsage,
    context: {
      stage: string;
      promptKey: string;
      promptVersion: string;
    }
  ): AIUsage {
    const inputTokens = this.validateNonNegativeSafeInteger(usage.inputTokens, 'inputTokens', context);
    const outputTokens = this.validateNonNegativeSafeInteger(usage.outputTokens, 'outputTokens', context);
    const latencyMs = this.validateNonNegativeSafeInteger(usage.latencyMs, 'latencyMs', context);
    const totalTokens = this.checkedSum(inputTokens, outputTokens, context);

    if (usage.estimatedCostUsd !== null) {
      if (
        typeof usage.estimatedCostUsd !== 'number'
        || !Number.isFinite(usage.estimatedCostUsd)
        || usage.estimatedCostUsd < 0
      ) {
        throw new AIValidationError('Prompt usage contains invalid estimated cost.', {
          ...context,
          field: 'estimatedCostUsd'
        });
      }
    }

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd: usage.estimatedCostUsd,
      latencyMs
    };
  }

  private validateNonNegativeSafeInteger(
    value: unknown,
    field: string,
    context: {
      stage: string;
      promptKey: string;
      promptVersion: string;
    }
  ): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new AIValidationError('Prompt usage contains invalid token accounting.', {
        ...context,
        field
      });
    }

    return value;
  }

  private checkedSum(
    left: number,
    right: number,
    context: {
      stage: string;
      promptKey: string;
      promptVersion: string;
    }
  ): number {
    const total = left + right;

    if (!Number.isSafeInteger(total) || total < 0) {
      throw new AIValidationError('Prompt usage token total overflowed safe integer range.', context);
    }

    return total;
  }
}
