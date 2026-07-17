import { describe, expect, it } from 'vitest';

import { environment } from '../../../src/platform/foundation/environment/index.js';

describe('platform environment', () => {
  it('loads the host', () => {
    expect(environment.host.length).toBeGreaterThan(0);
  });

  it('loads the port', () => {
    expect(environment.port).toBeGreaterThan(0);
  });

  it('loads the database URL', () => {
    expect(environment.databaseUrl.startsWith('postgresql://')).toBe(true);
  });

  it('loads the maximum database connections', () => {
    expect(environment.databaseMaxConnections).toBeGreaterThan(0);
  });

  it('loads the SSL flag', () => {
    expect(typeof environment.databaseSsl).toBe('boolean');
  });

  it('loads worker runtime settings', () => {
    expect(environment.workerName.length).toBeGreaterThan(0);
    expect(environment.workerPollIntervalMs).toBeGreaterThan(0);
    expect(environment.workerLeaseDurationMs).toBeGreaterThan(
      environment.workerHeartbeatIntervalMs
    );
    expect(environment.workerMaxAttempts).toBeGreaterThanOrEqual(1);
    expect(environment.workerConcurrency).toBeGreaterThanOrEqual(1);
    expect(environment.workerShutdownTimeoutMs).toBeGreaterThan(0);
    expect(environment.workerRetryBaseDelayMs).toBeGreaterThan(0);
    expect(environment.workerRetryMaxDelayMs).toBeGreaterThanOrEqual(
      environment.workerRetryBaseDelayMs
    );
    expect(environment.workerStaleRecoveryIntervalMs).toBeGreaterThan(0);
  });

  it('loads AI runtime settings', () => {
    expect(['mock', 'openai']).toContain(environment.aiProvider);
    expect(environment.openAiModel.length).toBeGreaterThan(0);
    expect(environment.openAiTimeoutMs).toBeGreaterThan(0);
    expect(environment.pipelineVersion.length).toBeGreaterThan(0);
    expect([
      'success',
      'retryable-failure',
      'permanent-failure',
      'timeout',
      'malformed-output'
    ]).toContain(environment.mockAiMode);
  });

  it('defaults NODE_ENV when not provided', () => {
    expect(environment.nodeEnv.length).toBeGreaterThan(0);
  });
});
