import { fileURLToPath } from 'node:url';

import { checkDatabaseHealth, closeDatabasePool, db } from '../db/client.js';
import { environment } from '../platform/foundation/environment/index.js';
import {
  DrizzleContentJobRepository,
  DrizzlePublishJobRepository,
  DrizzleJobEventRepository,
  DrizzleSourceVersionRepository
} from '../infrastructure/repositories/index.js';

import { createApp } from './app.js';

export async function startServer(): Promise<void> {
  const sourceVersionRepository = new DrizzleSourceVersionRepository(db);
  const contentJobRepository = new DrizzleContentJobRepository(db);
  const jobEventRepository = new DrizzleJobEventRepository(db);
  const publishJobRepository = new DrizzlePublishJobRepository(db);

  const app = await createApp({
    sourceVersionRepository,
    contentJobRepository,
    jobEventRepository,
    publishJobRepository,
    checkDatabaseHealth,
    nodeEnv: environment.nodeEnv
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down API server.');

    await app.close();
    await closeDatabasePool();
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  try {
    await app.listen({
      host: environment.host,
      port: environment.port
    });

    app.log.info(
      {
        host: environment.host,
        port: environment.port
      },
      'RoaM Content Engine API started.'
    );
  } catch (error) {
    app.log.error(
      {
        err: error
      },
      'Failed to start API server.'
    );

    await app.close();
    await closeDatabasePool();
    throw error;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isEntryPoint) {
  void startServer();
}
