import type { AIProviderName } from './ai-model.js';

export type AIUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number | null;
  readonly latencyMs: number;
};

export type AIUsageByPrompt = Record<string, AIUsage>;

export type AIUsageRecord = AIUsage & {
  readonly provider: AIProviderName;
  readonly model: string;
  readonly stage: string;
  readonly promptKey: string;
  readonly promptVersion: string;
  readonly pipelineVersion: string;
  readonly generatedAt: string;
};
