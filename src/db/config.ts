import 'dotenv/config';

import { z } from 'zod';

const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().positive(),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
});

const parsedConfig = databaseEnvSchema.safeParse(process.env);

if (!parsedConfig.success) {
  const issues = parsedConfig.error.issues
    .map((issue) => issue.path.join('.') || 'unknown')
    .join(', ');

  throw new Error(`Invalid database environment configuration: ${issues}`);
}

export const dbConfig = {
  url: parsedConfig.data.DATABASE_URL,
  maxConnections: parsedConfig.data.DATABASE_MAX_CONNECTIONS,
  ssl: parsedConfig.data.DATABASE_SSL
} as const;

export type DbConfig = typeof dbConfig;
