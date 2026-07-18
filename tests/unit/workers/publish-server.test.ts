import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockEnvironment = {
  publishWorkerEnabled: boolean;
  publishWorkerName: string;
  publishEngineBaseUrl: string;
  publishEngineScope: string;
  publishEngineRequestTimeoutMs: number;
  publishJobPollIntervalMs: number;
  publishEngineMaxRetries: number;
  publishEngineRetryBaseDelayMs: number;
  publishEngineRetryMaxDelayMs: number;
  publishJobLeaseDurationMs: number;
  publishJobHeartbeatIntervalMs: number;
  publishJobRetryBaseDelayMs: number;
  publishJobRetryMaxDelayMs: number;
  publishJobMaxConsecutiveFailures: number;
  publishJobConcurrency: number;
  publishJobShutdownTimeoutMs: number;
  publishJobStaleRecoveryIntervalMs: number;
};

function createEnvironment(overrides?: Partial<MockEnvironment>): MockEnvironment {
  return {
    publishWorkerEnabled: false,
    publishWorkerName: 'roam-content-publish-worker',
    publishEngineBaseUrl: '',
    publishEngineScope: '',
    publishEngineRequestTimeoutMs: 30_000,
    publishJobPollIntervalMs: 2_000,
    publishEngineMaxRetries: 3,
    publishEngineRetryBaseDelayMs: 250,
    publishEngineRetryMaxDelayMs: 5_000,
    publishJobLeaseDurationMs: 30_000,
    publishJobHeartbeatIntervalMs: 10_000,
    publishJobRetryBaseDelayMs: 1_000,
    publishJobRetryMaxDelayMs: 60_000,
    publishJobMaxConsecutiveFailures: 5,
    publishJobConcurrency: 1,
    publishJobShutdownTimeoutMs: 30_000,
    publishJobStaleRecoveryIntervalMs: 30_000,
    ...overrides
  };
}

async function loadServerWithMocks(environment: MockEnvironment) {
  vi.resetModules();

  const closeDatabasePool = vi.fn(async () => undefined);
  const createPublishWorkerApp = vi.fn(() => ({
    state: {
      started: false,
      stopping: false,
      stopped: true,
      lastSuccessfulPollAt: null,
      activeJobCount: 0,
      lastStaleRecoveryRunAt: null
    },
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined)
  }));

  vi.doMock('../../../src/platform/foundation/environment/index.js', () => ({
    environment
  }));
  vi.doMock('../../../src/db/client.js', () => ({
    db: {},
    closeDatabasePool
  }));
  vi.doMock('../../../src/infrastructure/repositories/drizzle-publish-job-repository.js', () => ({
    DrizzlePublishJobRepository: class {}
  }));
  vi.doMock('../../../src/infrastructure/publish-jobs/index.js', () => ({
    DatabasePublishJobSource: class {}
  }));
  vi.doMock('../../../src/worker/publish-app.js', () => ({
    createPublishWorkerApp
  }));

  const module = await import('../../../src/worker/publish-server.js');

  return {
    startPublishWorkerServer: module.startPublishWorkerServer,
    closeDatabasePool,
    createPublishWorkerApp
  };
}

describe('publish server runtime gating', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not start publish worker app when disabled', async () => {
    const harness = await loadServerWithMocks(createEnvironment({
      publishWorkerEnabled: false
    }));

    await harness.startPublishWorkerServer();

    expect(harness.createPublishWorkerApp).not.toHaveBeenCalled();
    expect(harness.closeDatabasePool).toHaveBeenCalledTimes(1);
  });

  it('fails closed when enabled without a supported production token provider', async () => {
    const harness = await loadServerWithMocks(createEnvironment({
      publishWorkerEnabled: true,
      publishEngineBaseUrl: 'https://publish-engine.example',
      publishEngineScope: 'api://publish-engine/.default'
    }));

    await expect(harness.startPublishWorkerServer()).rejects.toMatchObject({
      code: 'PUBLISH_ENGINE_CONFIGURATION_ERROR'
    });

    expect(harness.createPublishWorkerApp).not.toHaveBeenCalled();
  });
});