import 'dotenv/config';

import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  HOST: z.string().min(1).default('0.0.0.0'),

  PORT: z.coerce.number().int().positive().max(65535).default(3000),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required.')
    .refine(
      (value) =>
        value.startsWith('postgresql://') ||
        value.startsWith('postgres://'),
      'DATABASE_URL must be a PostgreSQL connection URL.'
    ),

  DATABASE_MAX_CONNECTIONS: z.coerce
    .number()
    .int()
    .positive()
    .max(100),

  DATABASE_SSL: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const invalidFields = parsedEnvironment.error.issues
    .map((issue) => issue.path.join('.') || 'unknown')
    .join(', ');

  throw new Error(
    `Invalid environment configuration: ${invalidFields}`
  );
}

export interface Environment {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly databaseMaxConnections: number;
  readonly databaseSsl: boolean;
}

export const environment: Environment = {
  nodeEnv: parsedEnvironment.data.NODE_ENV,
  host: parsedEnvironment.data.HOST,
  port: parsedEnvironment.data.PORT,
  databaseUrl: parsedEnvironment.data.DATABASE_URL,
  databaseMaxConnections:
    parsedEnvironment.data.DATABASE_MAX_CONNECTIONS,
  databaseSsl: parsedEnvironment.data.DATABASE_SSL
};
