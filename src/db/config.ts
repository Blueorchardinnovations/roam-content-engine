import { environment } from '../platform/foundation/environment/index.js';

export const dbConfig = {
  url: environment.databaseUrl,
  maxConnections: environment.databaseMaxConnections,
  ssl: environment.databaseSsl
} as const;

export type DbConfig = typeof dbConfig;
