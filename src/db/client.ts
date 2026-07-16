import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { dbConfig } from './config.js';
import * as schema from './schema/index.js';

type Schema = typeof schema;

declare global {
  var __roamContentPool: Pool | undefined;
}

const pool =
  globalThis.__roamContentPool ??
  new Pool({
    connectionString: dbConfig.url,
    max: dbConfig.maxConnections,
    ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false
  });

if (!globalThis.__roamContentPool) {
  globalThis.__roamContentPool = pool;

  pool.on('error', () => {
    console.error('Unexpected PostgreSQL pool error.');
  });
}

export const db: NodePgDatabase<Schema> = drizzle(pool, { schema });

let isShuttingDown = false;

export async function checkDatabaseHealth(): Promise<boolean> {
  await pool.query('SELECT 1');
  return true;
}

export async function closeDatabasePool(): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  await pool.end();
  globalThis.__roamContentPool = undefined;
}

async function handleShutdownSignal(): Promise<void> {
  await closeDatabasePool();
}

process.once('SIGINT', () => {
  void handleShutdownSignal();
});

process.once('SIGTERM', () => {
  void handleShutdownSignal();
});
