import { fileURLToPath } from 'node:url';
import { ulid } from 'ulid';

import { closeDatabasePool, db } from '../db/client.js';
import { DrizzleSourceVersionRepository } from '../infrastructure/repositories/drizzle-source-version-repository.js';
import { environment } from '../platform/foundation/environment/index.js';
import { DatabaseJobSource } from '../infrastructure/workers/database-job-source.js';

import { createWorkerApp } from './app.js';

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

export async function startWorkerServer(): Promise<void> {
  const logger = createStructuredLogger();
  const workerId = createWorkerId(environment.workerName);

  const sourceVersionRepository = new DrizzleSourceVersionRepository(db);
  const jobSource = new DatabaseJobSource(db);

  const workerApp = createWorkerApp({
    workerConfig: {
      workerId,
      pollIntervalMs: environment.workerPollIntervalMs,
      leaseDurationMs: environment.workerLeaseDurationMs,
      heartbeatIntervalMs: environment.workerHeartbeatIntervalMs,
      maxAttempts: environment.workerMaxAttempts,
      concurrency: environment.workerConcurrency,
      shutdownTimeoutMs: environment.workerShutdownTimeoutMs,
      staleRecoveryIntervalMs: environment.workerStaleRecoveryIntervalMs,
      retryBaseDelayMs: environment.workerRetryBaseDelayMs,
      retryMaxDelayMs: environment.workerRetryMaxDelayMs
    },
    sourceVersionRepository,
    jobSource,
    logger
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal, workerId }, 'Worker shutdown requested.');

    await workerApp.stop();
    await closeDatabasePool();

    logger.info({ signal, workerId }, 'Worker shutdown complete.');
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  try {
    logger.info({ workerId }, 'Worker server starting.');
    await workerApp.start();
  } catch (error) {
    logger.error(
      {
        workerId,
        err: error
      },
      'Worker server failed.'
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
  void startWorkerServer();
}
