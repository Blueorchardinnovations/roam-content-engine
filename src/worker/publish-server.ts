import { fileURLToPath } from 'node:url';

import { ulid } from 'ulid';

import { closeDatabasePool, db } from '../db/client.js';
import { DrizzlePublishJobRepository } from '../infrastructure/repositories/drizzle-publish-job-repository.js';
import {
  createPublishEngineConfig,
  PublishEngineConfigurationError,
  type PublishEngineClient
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

function resolveProductionPublishEngineClient(_config: ReturnType<typeof createPublishEngineConfig>): PublishEngineClient {
  throw new PublishEngineConfigurationError(
    'Publish worker has no production access-token provider configured. Identity integration is required before enabling durable publish orchestration.'
  );
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

  const publishEngineClient = resolveProductionPublishEngineClient(publishEngineConfig);

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