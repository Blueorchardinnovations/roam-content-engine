import { afterEach, describe, expect, it, vi } from 'vitest';

const baselineEnv = { ...process.env };

async function loadEnvironment(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = {
    ...baselineEnv,
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    DATABASE_MAX_CONNECTIONS: '10',
    DATABASE_SSL: 'false',
    ...overrides
  };
  return import('../../../src/platform/foundation/environment/index.js');
}

afterEach(() => {
  process.env = { ...baselineEnv };
  vi.resetModules();
});

describe('environment variants', () => {
  it('rejects whitespace-only OpenAI values and unknown providers', async () => {
    await expect(loadEnvironment({
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: '   ',
      OPENAI_MODEL: '  ',
      PIPELINE_VERSION: '1.0.0',
      OPENAI_TIMEOUT_MS: '30000'
    })).rejects.toThrow(/OPENAI_API_KEY|OPENAI_MODEL/);

    await expect(loadEnvironment({
      AI_PROVIDER: 'bogus'
    })).rejects.toThrow(/AI_PROVIDER/);
  });

  it('rejects whitespace-only pipeline versions and invalid timeout values', async () => {
    await expect(loadEnvironment({
      AI_PROVIDER: 'mock',
      PIPELINE_VERSION: '   ',
      OPENAI_TIMEOUT_MS: '30000'
    })).rejects.toThrow(/PIPELINE_VERSION/);

    await expect(loadEnvironment({
      AI_PROVIDER: 'mock',
      PIPELINE_VERSION: '1.0.0',
      OPENAI_TIMEOUT_MS: '-1'
    })).rejects.toThrow(/OPENAI_TIMEOUT_MS/);
  });

  it('allows mock mode without an OpenAI key and does not fall back from OpenAI errors', async () => {
    const environmentModule = await loadEnvironment({
      AI_PROVIDER: 'mock',
      OPENAI_API_KEY: '',
      OPENAI_MODEL: 'gpt-4o-mini',
      PIPELINE_VERSION: '1.0.0',
      OPENAI_TIMEOUT_MS: '30000'
    });

    expect(environmentModule.environment.aiProvider).toBe('mock');
    expect(environmentModule.environment.openAiApiKey).toBe('');
  });

  it('does not expose secret values in validation errors', async () => {
    try {
      await loadEnvironment({
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'super-secret-key',
      OPENAI_MODEL: 'gpt-4o-mini',
      PIPELINE_VERSION: '1.0.0',
        OPENAI_TIMEOUT_MS: '-1'
      });
      throw new Error('Expected environment validation to fail.');
    } catch (error) {
      expect(String(error)).toContain('OPENAI_TIMEOUT_MS');
      expect(String(error)).not.toContain('super-secret-key');
    }
  });
});
