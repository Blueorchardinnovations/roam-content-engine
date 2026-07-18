import { fileURLToPath } from 'node:url';
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity';
import type { TokenCredential } from '@azure/core-auth';

import { ulid } from 'ulid';

import { closeDatabasePool, db } from '../db/client.js';
import { DrizzlePublishJobRepository } from '../infrastructure/repositories/drizzle-publish-job-repository.js';
import {
  AzurePublishEngineAccessTokenProvider,
  createPublishEngineConfig,
  HttpPublishEngineClient,
  type PublishEngineAccessTokenProvider,
  type PublishEngineConfig,
  PublishEngineConfigurationError,
  type PublishEngineClient,
  type PublishEngineLogger
} from '../infrastructure/publish-engine/index.js';
import { DatabasePublishJobSource } from '../infrastructure/publish-jobs/index.js';
import { environment } from '../platform/foundation/environment/index.js';

import { createPublishWorkerApp } from './publish-app.js';

function createStructuredLogger() {
  return {
    info: (payload: Record<string, unknown>, message: string) => {
      console.log(JSON.stringify({ level: 'info', message, ...payload }));
    },
    warn: (payload: Record<string, unknown>, message: string) => {
      console.warn(JSON.stringify({ level: 'warn', message, ...payload }));
    },
    error: (payload: Record<string, unknown>, message: string) => {
      console.error(JSON.stringify({ level: 'error', message, ...payload }));
    }
  };
}

function createWorkerId(workerName: string): string {
  const safeName = workerName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `worker_${safeName}_${process.pid}_${ulid().slice(-6).toLowerCase()}`;
}

type PublishEngineIdentityMode = 'managed-identity' | 'default-azure-credential';

type ResolveProductionPublishEngineClientInput = {
  readonly config: PublishEngineConfig;
  readonly identityModeRaw: string;
  readonly managedIdentityClientIdRaw: string;
  readonly azureClientIdRaw: string | undefined;
  readonly tokenRefreshSkewMsRaw: string;
  readonly logger: ReturnType<typeof createStructuredLogger>;
};

type ResolveProductionPublishEngineClientDependencies = {
  readonly createManagedIdentityCredential?: (clientId?: string) => TokenCredential;
  readonly createDefaultAzureCredential?: () => TokenCredential;
  readonly createAccessTokenProvider?: (input: {
    credential: TokenCredential;
    scope: string;
    refreshSkewMs: number;
  }) => PublishEngineAccessTokenProvider;
  readonly createPublishEngineClient?: (input: {
    config: PublishEngineConfig;
    accessTokenProvider: PublishEngineAccessTokenProvider;
    logger: PublishEngineLogger;
  }) => PublishEngineClient;
};

const DEFAULT_TOKEN_REFRESH_SKEW_MS = 300_000;
const MAX_TOKEN_REFRESH_SKEW_MS = 3_600_000;

function resolveIdentityMode(rawIdentityMode: string): PublishEngineIdentityMode {
  const normalized = rawIdentityMode.trim();
  if (normalized.length === 0) {
    throw new PublishEngineConfigurationError(
      'PUBLISH_ENGINE_IDENTITY_MODE is required when PUBLISH_WORKER_ENABLED=true.'
    );
  }

  if (normalized === 'managed-identity' || normalized === 'default-azure-credential') {
    return normalized;
  }

  throw new PublishEngineConfigurationError(
    'PUBLISH_ENGINE_IDENTITY_MODE must be one of: managed-identity, default-azure-credential.'
  );
}

function resolveTokenRefreshSkewMs(rawTokenRefreshSkewMs: string): number {
  const normalized = rawTokenRefreshSkewMs.trim();
  if (normalized.length === 0) {
    return DEFAULT_TOKEN_REFRESH_SKEW_MS;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_TOKEN_REFRESH_SKEW_MS) {
    throw new PublishEngineConfigurationError(
      `PUBLISH_ENGINE_TOKEN_REFRESH_SKEW_MS must be an integer between 0 and ${MAX_TOKEN_REFRESH_SKEW_MS}.`
    );
  }

  return parsed;
}

function resolveManagedIdentityClientId(rawDedicatedClientId: string, rawAzureClientId: string | undefined): string | undefined {
  const dedicated = rawDedicatedClientId.trim();
  if (dedicated.length > 0) {
    return dedicated;
  }

  const fallback = (rawAzureClientId ?? '').trim();
  if (fallback.length > 0) {
    return fallback;
  }

  return undefined;
}

function createManagedIdentityTokenCredential(clientId?: string): TokenCredential {
  if (clientId) {
    return new ManagedIdentityCredential({ clientId });
  }

  return new ManagedIdentityCredential();
}

function createPublishEngineLogger(logger: ReturnType<typeof createStructuredLogger>): PublishEngineLogger {
  return {
    info: (event, fields) => {
      logger.info({ event, ...fields }, 'Publish Engine client operation succeeded.');
    },
    warn: (event, fields) => {
      logger.warn({ event, ...fields }, 'Publish Engine client operation warning.');
    },
    error: (event, fields) => {
      logger.error({ event, ...fields }, 'Publish Engine client operation failed.');
    }
  };
}

export function resolveProductionPublishEngineClient(
  input: ResolveProductionPublishEngineClientInput,
  dependencies?: ResolveProductionPublishEngineClientDependencies
): PublishEngineClient {
  const identityMode = resolveIdentityMode(input.identityModeRaw);
  const tokenRefreshSkewMs = resolveTokenRefreshSkewMs(input.tokenRefreshSkewMsRaw);

  const createManagedIdentityCredential = dependencies?.createManagedIdentityCredential
    ?? createManagedIdentityTokenCredential;
  const createDefaultAzureCredential = dependencies?.createDefaultAzureCredential
    ?? (() => new DefaultAzureCredential());
  const createAccessTokenProvider = dependencies?.createAccessTokenProvider
    ?? ((providerInput: {
      credential: TokenCredential;
      scope: string;
      refreshSkewMs: number;
    }) => new AzurePublishEngineAccessTokenProvider(providerInput));
  const createPublishEngineClient = dependencies?.createPublishEngineClient
    ?? ((clientInput: {
      config: PublishEngineConfig;
      accessTokenProvider: PublishEngineAccessTokenProvider;
      logger: PublishEngineLogger;
    }) => new HttpPublishEngineClient(clientInput));

  let credential: TokenCredential;

  if (identityMode === 'managed-identity') {
    const managedIdentityClientId = resolveManagedIdentityClientId(
      input.managedIdentityClientIdRaw,
      input.azureClientIdRaw
    );

    try {
      credential = createManagedIdentityCredential(managedIdentityClientId);
    } catch (error) {
      throw new PublishEngineConfigurationError(
        'Failed to configure Managed Identity credential for publish worker.',
        undefined,
        error
      );
    }

    input.logger.info(
      {
        identityMode,
        managedIdentityAssignment: managedIdentityClientId ? 'user-assigned' : 'system-assigned',
        hasManagedIdentityClientId: Boolean(managedIdentityClientId)
      },
      'Publish worker identity mode configured.'
    );
  } else {
    try {
      credential = createDefaultAzureCredential();
    } catch (error) {
      throw new PublishEngineConfigurationError(
        'Failed to configure DefaultAzureCredential for publish worker.',
        undefined,
        error
      );
    }

    input.logger.info(
      {
        identityMode
      },
      'Publish worker identity mode configured.'
    );
  }

  const accessTokenProvider = createAccessTokenProvider({
    credential,
    scope: input.config.scope,
    refreshSkewMs: tokenRefreshSkewMs
  });

  return createPublishEngineClient({
    config: input.config,
    accessTokenProvider,
    logger: createPublishEngineLogger(input.logger)
  });
}

export async function startPublishWorkerServer(): Promise<void> {
  const logger = createStructuredLogger();

  if (!environment.publishWorkerEnabled) {
    logger.info(
      {
        enabled: environment.publishWorkerEnabled
      },
      'Publish worker is disabled. Exiting without starting orchestration.'
    );
    await closeDatabasePool();
    return;
  }

  const workerId = createWorkerId(environment.publishWorkerName);

  if (environment.publishEngineBaseUrl.length === 0 || environment.publishEngineScope.length === 0) {
    throw new PublishEngineConfigurationError(
      'PUBLISH_ENGINE_BASE_URL and PUBLISH_ENGINE_SCOPE are required when PUBLISH_WORKER_ENABLED=true.'
    );
  }

  const publishEngineConfig = createPublishEngineConfig({
    baseUrl: environment.publishEngineBaseUrl,
    scope: environment.publishEngineScope,
    requestTimeoutMs: environment.publishEngineRequestTimeoutMs,
    pollIntervalMs: environment.publishJobPollIntervalMs,
    maxRetries: environment.publishEngineMaxRetries,
    retryBaseDelayMs: environment.publishEngineRetryBaseDelayMs,
    retryMaxDelayMs: environment.publishEngineRetryMaxDelayMs
  });

  const publishEngineClient = resolveProductionPublishEngineClient({
    config: publishEngineConfig,
    identityModeRaw: environment.publishEngineIdentityMode,
    managedIdentityClientIdRaw: environment.publishEngineManagedIdentityClientId,
    azureClientIdRaw: process.env.AZURE_CLIENT_ID,
    tokenRefreshSkewMsRaw: environment.publishEngineTokenRefreshSkewMs,
    logger
  });

  const source = new DatabasePublishJobSource(db);
  const repository = new DrizzlePublishJobRepository(db);

  const workerApp = createPublishWorkerApp({
    source,
    repository,
    publishEngineClient,
    config: {
      workerId,
      pollIntervalMs: environment.publishJobPollIntervalMs,
      leaseDurationMs: environment.publishJobLeaseDurationMs,
      heartbeatIntervalMs: environment.publishJobHeartbeatIntervalMs,
      retryBaseDelayMs: environment.publishJobRetryBaseDelayMs,
      retryMaxDelayMs: environment.publishJobRetryMaxDelayMs,
      maxConsecutiveFailures: environment.publishJobMaxConsecutiveFailures,
      concurrency: environment.publishJobConcurrency,
      shutdownTimeoutMs: environment.publishJobShutdownTimeoutMs,
      staleRecoveryIntervalMs: environment.publishJobStaleRecoveryIntervalMs
    },
    logger
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal, workerId }, 'Publish worker shutdown requested.');

    await workerApp.stop();
    await closeDatabasePool();

    logger.info({ signal, workerId }, 'Publish worker shutdown complete.');
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  try {
    logger.info({ workerId }, 'Publish worker server starting.');
    await workerApp.start();
  } catch (error) {
    logger.error(
      {
        workerId,
        err: error
      },
      'Publish worker server failed.'
    );

    await closeDatabasePool();
    process.exitCode = 1;
    throw error;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  void startPublishWorkerServer();
}