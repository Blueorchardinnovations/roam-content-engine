export type AIProviderName = 'mock' | 'openai';

export type AIModelPreference = {
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
};

export type AIPipelineMetadata = {
  readonly provider: AIProviderName;
  readonly model: string;
  readonly pipelineVersion: string;
  readonly generatedAt: string;
};
