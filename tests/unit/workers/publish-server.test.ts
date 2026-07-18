import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type MockEnvironment = {
  publishWorkerEnabled: boolean;
  publishWorkerName: string;
  publishEngineBaseUrl: string;
  publishEngineScope: string;
  publishEngineIdentityMode: string;
  publishEngineManagedIdentityClientId: string;
  publishEngineTokenRefreshSkewMs: string;
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
    publishEngineIdentityMode: '',
    publishEngineManagedIdentityClientId: '',
    publishEngineTokenRefreshSkewMs: '300000',
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

  const managedIdentityCredential = vi.fn();
  const defaultAzureCredential = vi.fn();

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
  vi.doMock('@azure/identity', () => ({
    ManagedIdentityCredential: managedIdentityCredential,
    DefaultAzureCredential: defaultAzureCredential
  }));

  const module = await import('../../../src/worker/publish-server.js');

  return {
    startPublishWorkerServer: module.startPublishWorkerServer,
    resolveProductionPublishEngineClient: module.resolveProductionPublishEngineClient,
    closeDatabasePool,
    createPublishWorkerApp,
    managedIdentityCredential,
    defaultAzureCredential
  };
}

function createLoggerSpies() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

function createConfig() {
  return {
    baseUrl: new URL('https://publish-engine.example'),
    scope: 'api://publish-engine/.default',
    requestTimeoutMs: 30_000,
    pollIntervalMs: 2_000,
    maxWaitMs: 300_000,
    maxRetries: 3,
    retryBaseDelayMs: 250,
    retryMaxDelayMs: 5_000,
    retryJitterRatio: 0.2
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
    expect(harness.managedIdentityCredential).not.toHaveBeenCalled();
    expect(harness.defaultAzureCredential).not.toHaveBeenCalled();
  });

  it('fails closed when enabled with missing identity mode', async () => {
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

  it('fails closed when enabled with unsupported identity mode', async () => {
    const harness = await loadServerWithMocks(createEnvironment({
      publishWorkerEnabled: true,
      publishEngineBaseUrl: 'https://publish-engine.example',
      publishEngineScope: 'api://publish-engine/.default',
      publishEngineIdentityMode: 'unsupported-mode'
    }));

    await expect(harness.startPublishWorkerServer()).rejects.toMatchObject({
      code: 'PUBLISH_ENGINE_CONFIGURATION_ERROR'
    });

    expect(harness.createPublishWorkerApp).not.toHaveBeenCalled();
  });

  it('fails closed when enabled with missing scope', async () => {
    const harness = await loadServerWithMocks(createEnvironment({
      publishWorkerEnabled: true,
      publishEngineBaseUrl: 'https://publish-engine.example',
      publishEngineScope: '',
      publishEngineIdentityMode: 'managed-identity'
    }));

    await expect(harness.startPublishWorkerServer()).rejects.toMatchObject({
      code: 'PUBLISH_ENGINE_CONFIGURATION_ERROR'
    });
  });

  it('fails closed when refresh skew is invalid', async () => {
    const harness = await loadServerWithMocks(createEnvironment({
      publishWorkerEnabled: true,
      publishEngineBaseUrl: 'https://publish-engine.example',
      publishEngineScope: 'api://publish-engine/.default',
      publishEngineIdentityMode: 'managed-identity',
      publishEngineTokenRefreshSkewMs: '-1'
    }));

    await expect(harness.startPublishWorkerServer()).rejects.toMatchObject({
      code: 'PUBLISH_ENGINE_CONFIGURATION_ERROR'
    });
  });
});

describe('publish server identity composition', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('selects ManagedIdentityCredential in managed-identity mode', async () => {
    const harness = await loadServerWithMocks(createEnvironment());
    const logger = createLoggerSpies();
    const createManagedIdentityCredential = vi.fn(() => ({
      getToken: vi.fn(async () => ({
        token: 't',
        expiresOnTimestamp: Date.now() + 60_000
      }))
    }));

    harness.resolveProductionPublishEngineClient({
      config: createConfig(),
      identityModeRaw: 'managed-identity',
      managedIdentityClientIdRaw: '',
      azureClientIdRaw: undefined,
      tokenRefreshSkewMsRaw: '300000',
      logger
    }, {
      createManagedIdentityCredential,
      createDefaultAzureCredential: vi.fn(),
      createAccessTokenProvider: vi.fn(() => ({
        getAccessToken: vi.fn(async () => 'token')
      })),
      createPublishEngineClient: vi.fn(() => ({
        submitRender: vi.fn(),
        submitCtaRender: vi.fn(),
        getJob: vi.fn(),
        getDownload: vi.fn(),
        waitForJob: vi.fn()
      }))
    });

    expect(createManagedIdentityCredential).toHaveBeenCalledTimes(1);
    expect(createManagedIdentityCredential).toHaveBeenCalledWith(undefined);
  });

  it('honors dedicated user-assigned client id over AZURE_CLIENT_ID', async () => {
    const harness = await loadServerWithMocks(createEnvironment());
    const logger = createLoggerSpies();
    const createManagedIdentityCredential = vi.fn(() => ({
      getToken: vi.fn()
    }));

    harness.resolveProductionPublishEngineClient({
      config: createConfig(),
      identityModeRaw: 'managed-identity',
      managedIdentityClientIdRaw: 'dedicated-client-id',
      azureClientIdRaw: 'fallback-client-id',
      tokenRefreshSkewMsRaw: '300000',
      logger
    }, {
      createManagedIdentityCredential,
      createDefaultAzureCredential: vi.fn(),
      createAccessTokenProvider: vi.fn(() => ({
        getAccessToken: vi.fn(async () => 'token')
      })),
      createPublishEngineClient: vi.fn(() => ({
        submitRender: vi.fn(),
        submitCtaRender: vi.fn(),
        getJob: vi.fn(),
        getDownload: vi.fn(),
        waitForJob: vi.fn()
      }))
    });

    expect(createManagedIdentityCredential).toHaveBeenCalledWith('dedicated-client-id');
  });

  it('supports AZURE_CLIENT_ID compatibility fallback for managed identity', async () => {
    const harness = await loadServerWithMocks(createEnvironment());
    const logger = createLoggerSpies();
    const createManagedIdentityCredential = vi.fn(() => ({
      getToken: vi.fn()
    }));

    harness.resolveProductionPublishEngineClient({
      config: createConfig(),
      identityModeRaw: 'managed-identity',
      managedIdentityClientIdRaw: '',
      azureClientIdRaw: 'fallback-client-id',
      tokenRefreshSkewMsRaw: '300000',
      logger
    }, {
      createManagedIdentityCredential,
      createDefaultAzureCredential: vi.fn(),
      createAccessTokenProvider: vi.fn(() => ({
        getAccessToken: vi.fn(async () => 'token')
      })),
      createPublishEngineClient: vi.fn(() => ({
        submitRender: vi.fn(),
        submitCtaRender: vi.fn(),
        getJob: vi.fn(),
        getDownload: vi.fn(),
        waitForJob: vi.fn()
      }))
    });

    expect(createManagedIdentityCredential).toHaveBeenCalledWith('fallback-client-id');
  });

  it('selects DefaultAzureCredential in default-azure-credential mode', async () => {
    const harness = await loadServerWithMocks(createEnvironment());
    const logger = createLoggerSpies();
    const createDefaultAzureCredential = vi.fn(() => ({
      getToken: vi.fn()
    }));

    harness.resolveProductionPublishEngineClient({
      config: createConfig(),
      identityModeRaw: 'default-azure-credential',
      managedIdentityClientIdRaw: '',
      azureClientIdRaw: undefined,
      tokenRefreshSkewMsRaw: '300000',
      logger
    }, {
      createManagedIdentityCredential: vi.fn(),
      createDefaultAzureCredential,
      createAccessTokenProvider: vi.fn(() => ({
        getAccessToken: vi.fn(async () => 'token')
      })),
      createPublishEngineClient: vi.fn(() => ({
        submitRender: vi.fn(),
        submitCtaRender: vi.fn(),
        getJob: vi.fn(),
        getDownload: vi.fn(),
        waitForJob: vi.fn()
      }))
    });

    expect(createDefaultAzureCredential).toHaveBeenCalledTimes(1);
  });

  it('uses sanitized identity logs without exposing managed identity client id', async () => {
    const harness = await loadServerWithMocks(createEnvironment());
    const logger = createLoggerSpies();

    harness.resolveProductionPublishEngineClient({
      config: createConfig(),
      identityModeRaw: 'managed-identity',
      managedIdentityClientIdRaw: 'secret-client-id',
      azureClientIdRaw: undefined,
      tokenRefreshSkewMsRaw: '300000',
      logger
    }, {
      createManagedIdentityCredential: vi.fn(() => ({ getToken: vi.fn() })),
      createDefaultAzureCredential: vi.fn(),
      createAccessTokenProvider: vi.fn(() => ({ getAccessToken: vi.fn(async () => 'token') })),
      createPublishEngineClient: vi.fn(() => ({
        submitRender: vi.fn(),
        submitCtaRender: vi.fn(),
        getJob: vi.fn(),
        getDownload: vi.fn(),
        waitForJob: vi.fn()
      }))
    });

    const logPayload = logger.info.mock.calls[0]?.[0];
    expect(logPayload).toMatchObject({
      identityMode: 'managed-identity',
      hasManagedIdentityClientId: true
    });
    expect(JSON.stringify(logPayload)).not.toContain('secret-client-id');
  });

  it('has no static bearer-token configuration path', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/worker/publish-server.ts'),
      'utf8'
    );

    expect(source).not.toContain('PUBLISH_ENGINE_ACCESS_TOKEN');
    expect(source).not.toContain('STATIC_TOKEN');
    expect(source).not.toContain('Bearer ');
  });

  it('API server composition import is unaffected by publish identity mode settings', async () => {
    vi.resetModules();
    vi.doMock('../../../src/platform/foundation/environment/index.js', () => ({
      environment: {
        nodeEnv: 'test',
        host: '0.0.0.0',
        port: 3000,
        publishEngineIdentityMode: 'invalid-mode'
      }
    }));
    vi.doMock('../../../src/db/client.js', () => ({
      db: {},
      checkDatabaseHealth: vi.fn(async () => true),
      closeDatabasePool: vi.fn(async () => undefined)
    }));
    vi.doMock('../../../src/infrastructure/repositories/index.js', () => ({
      DrizzleContentJobRepository: class {},
      DrizzlePublishJobRepository: class {},
      DrizzleJobEventRepository: class {},
      DrizzleSourceVersionRepository: class {}
    }));

    await expect(import('../../../src/api/server.js')).resolves.toBeDefined();
  });

  it('transcript-worker composition import is unaffected by publish identity mode settings', async () => {
    vi.resetModules();
    vi.doMock('../../../src/platform/foundation/environment/index.js', () => ({
      environment: {
        workerName: 'worker',
        aiProvider: 'mock',
        openAiApiKey: '',
        openAiModel: 'gpt-4o-mini',
        openAiTimeoutMs: 30000,
        mockAiMode: 'success',
        pipelineVersion: '1.0.0',
        workerPollIntervalMs: 1000,
        workerLeaseDurationMs: 30000,
        workerHeartbeatIntervalMs: 10000,
        workerMaxAttempts: 5,
        workerConcurrency: 1,
        workerShutdownTimeoutMs: 30000,
        workerStaleRecoveryIntervalMs: 30000,
        workerRetryBaseDelayMs: 1000,
        workerRetryMaxDelayMs: 60000,
        publishEngineIdentityMode: 'invalid-mode'
      }
    }));
    vi.doMock('../../../src/db/client.js', () => ({
      db: {},
      closeDatabasePool: vi.fn(async () => undefined)
    }));
    vi.doMock('../../../src/infrastructure/repositories/drizzle-source-version-repository.js', () => ({
      DrizzleSourceVersionRepository: class {}
    }));
    vi.doMock('../../../src/infrastructure/workers/database-job-source.js', () => ({
      DatabaseJobSource: class {}
    }));
    vi.doMock('../../../src/infrastructure/ai/registry.js', () => ({
      createAIProvider: vi.fn(() => ({ providerName: 'mock' }))
    }));
    vi.doMock('../../../src/application/ai/pipeline.js', () => ({
      AIPipeline: class {}
    }));
    vi.doMock('../../../src/worker/app.js', () => ({
      createWorkerApp: vi.fn(() => ({
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined)
      }))
    }));

    await expect(import('../../../src/worker/server.js')).resolves.toBeDefined();
  });
});