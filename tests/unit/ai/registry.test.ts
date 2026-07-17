import { describe, expect, it } from 'vitest';

import { createAIProvider } from '../../../src/infrastructure/ai/registry.js';

describe('ai provider registry', () => {
  it('creates mock provider when configured', () => {
    const provider = createAIProvider({
      providerName: 'mock',
      openAiApiKey: '',
      openAiModel: 'ignored',
      openAiTimeoutMs: 1000,
      mockMode: 'success',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });

    expect(provider.providerName).toBe('mock');
  });

  it('rejects openai provider without API key', () => {
    expect(() => {
      createAIProvider({
        providerName: 'openai',
        openAiApiKey: '',
        openAiModel: 'gpt-test',
        openAiTimeoutMs: 1000,
        mockMode: 'success',
        now: () => new Date('2026-01-01T00:00:00.000Z')
      });
    }).toThrow(/OPENAI_API_KEY/i);
  });

  it('creates openai provider when configured', () => {
    const provider = createAIProvider({
      providerName: 'openai',
      openAiApiKey: 'test-key',
      openAiModel: 'gpt-test',
      openAiTimeoutMs: 1000,
      mockMode: 'success',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });

    expect(provider.providerName).toBe('openai');
  });

  it('rejects unknown providers explicitly', () => {
    expect(() => {
      createAIProvider({
        providerName: 'other' as never,
        openAiApiKey: 'test-key',
        openAiModel: 'gpt-test',
        openAiTimeoutMs: 1000,
        mockMode: 'success',
        now: () => new Date('2026-01-01T00:00:00.000Z')
      });
    }).toThrow(/Unknown AI provider configuration/i);
  });
});
