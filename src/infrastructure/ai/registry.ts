import type { AIProvider } from '../../domain/ai/ai-provider.js';
import { ValidationError } from '../../platform/shared/errors/index.js';

import { MockAIProvider, type MockProviderMode } from './providers/mock-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';

export type AIProviderRegistryConfig = {
  readonly providerName: 'mock' | 'openai';
  readonly openAiApiKey: string;
  readonly openAiModel: string;
  readonly openAiTimeoutMs: number;
  readonly mockMode: MockProviderMode;
  readonly now: () => Date;
};

export function createAIProvider(config: AIProviderRegistryConfig): AIProvider {
  if (config.providerName === 'mock') {
    return new MockAIProvider({
      mode: config.mockMode,
      now: config.now
    });
  }

  if (config.providerName === 'openai') {
    if (config.openAiApiKey.trim().length === 0) {
      throw new ValidationError('OPENAI_API_KEY is required when AI_PROVIDER=openai.');
    }

    return new OpenAIProvider({
      apiKey: config.openAiApiKey,
      defaultModel: config.openAiModel,
      timeoutMs: config.openAiTimeoutMs,
      now: config.now
    });
  }

  throw new ValidationError('Unknown AI provider configuration.', {
    providerName: config.providerName
  });
}
