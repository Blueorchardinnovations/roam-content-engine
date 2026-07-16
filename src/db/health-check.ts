import { checkDatabaseHealth, closeDatabasePool } from './client.js';

async function runHealthCheck(): Promise<void> {
  try {
    await checkDatabaseHealth();
    console.log('PostgreSQL connection is healthy.');
  } catch {
    console.error('PostgreSQL health check failed.');
    process.exitCode = 1;
  } finally {
    await closeDatabasePool();
  }
}

void runHealthCheck();
