import { describe, expect, it } from 'vitest';

import {
  createPublishEngineConfig,
  createPublishEngineConfigFromEnvironment
} from '../../../../src/infrastructure/publish-engine/publish-engine-config.js';
import { PublishEngineConfigurationError } from '../../../../src/infrastructure/publish-engine/publish-engine-errors.js';

describe('publish-engine config', () => {
  it('normalizes base url and applies defaults', () => {
    const config = createPublishEngineConfig({
      baseUrl: 'https://publish.example.com/v1/',
      scope: 'api://publish-engine/.default'
    });

    expect(config.baseUrl.toString()).toBe('https://publish.example.com/v1');
    expect(config.requestTimeoutMs).toBe(30000);
    expect(config.pollIntervalMs).toBe(2000);
    expect(config.maxRetries).toBe(3);
  });

  it('allows localhost http for test scenarios', () => {
    const config = createPublishEngineConfig({
      baseUrl: 'http://localhost:8787',
      scope: 'local-scope'
    });

    expect(config.baseUrl.origin).toBe('http://localhost:8787');
  });

  it('rejects insecure non-local http endpoints', () => {
    expect(() => createPublishEngineConfig({
      baseUrl: 'http://publish.example.com',
      scope: 'scope'
    })).toThrow(PublishEngineConfigurationError);
  });

  it('rejects base url with query or credentials', () => {
    expect(() => createPublishEngineConfig({
      baseUrl: 'https://user:pass@publish.example.com',
      scope: 'scope'
    })).toThrow(PublishEngineConfigurationError);

    expect(() => createPublishEngineConfig({
      baseUrl: 'https://publish.example.com/path?x=1',
      scope: 'scope'
    })).toThrow(PublishEngineConfigurationError);
  });

  it('parses environment variables with numeric overrides', () => {
    const config = createPublishEngineConfigFromEnvironment({
      PUBLISH_ENGINE_BASE_URL: 'https://publish.example.com',
      PUBLISH_ENGINE_SCOPE: 'scope-value',
      PUBLISH_ENGINE_REQUEST_TIMEOUT_MS: '45000',
      PUBLISH_ENGINE_MAX_RETRIES: '2'
    });

    expect(config.requestTimeoutMs).toBe(45000);
    expect(config.maxRetries).toBe(2);
  });

  it('rejects missing required environment variables', () => {
    expect(() => createPublishEngineConfigFromEnvironment({
      PUBLISH_ENGINE_SCOPE: 'scope-value'
    })).toThrow(PublishEngineConfigurationError);
  });
});
