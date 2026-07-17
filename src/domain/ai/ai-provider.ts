import type { z } from 'zod';

import type { AIProviderName } from './ai-model.js';
import type { AIProviderResult } from './ai-provider-result.js';

export type AIRequest<TSchema extends z.ZodTypeAny> = {
  readonly stage: string;
  readonly promptKey: string;
  readonly promptVersion: string;
  readonly pipelineVersion: string;
  readonly prompt: string;
  readonly schema: TSchema;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly timeoutMs: number;
};

export interface AIProvider {
  readonly providerName: AIProviderName;

  generate<TSchema extends z.ZodTypeAny>(
    request: AIRequest<TSchema>,
    signal: AbortSignal
  ): Promise<AIProviderResult<z.infer<TSchema>>>;
}
