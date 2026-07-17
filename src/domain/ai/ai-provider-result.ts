import type { AIProviderName } from './ai-model.js';
import type { AIUsage } from './ai-usage.js';

export type AIProviderResult<TOutput> = {
  readonly provider: AIProviderName;
  readonly model: string;
  readonly output: TOutput;
  readonly usage: AIUsage;
  readonly generatedAt: string;
};
