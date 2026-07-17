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
    .transform((value) => value === 'true'),

  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),

  WORKER_NAME: z.string().min(1).default('roam-content-worker'),

  WORKER_LEASE_DURATION_MS: z.coerce.number().int().positive().default(30000),

  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(10000),

  WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(1),

  WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  WORKER_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1000),

  WORKER_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(60000),

  WORKER_STALE_RECOVERY_INTERVAL_MS: z.coerce.number().int().positive().default(30000)
}).superRefine((value, context) => {
  if (value.WORKER_LEASE_DURATION_MS <= value.WORKER_HEARTBEAT_INTERVAL_MS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'WORKER_LEASE_DURATION_MS must be greater than WORKER_HEARTBEAT_INTERVAL_MS.',
      path: ['WORKER_LEASE_DURATION_MS']
    });
  }

  if (value.WORKER_RETRY_MAX_DELAY_MS < value.WORKER_RETRY_BASE_DELAY_MS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'WORKER_RETRY_MAX_DELAY_MS must be greater than or equal to WORKER_RETRY_BASE_DELAY_MS.',
      path: ['WORKER_RETRY_MAX_DELAY_MS']
    });
  }
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
  readonly workerPollIntervalMs: number;
  readonly workerName: string;
  readonly workerLeaseDurationMs: number;
  readonly workerHeartbeatIntervalMs: number;
  readonly workerMaxAttempts: number;
  readonly workerConcurrency: number;
  readonly workerShutdownTimeoutMs: number;
  readonly workerRetryBaseDelayMs: number;
  readonly workerRetryMaxDelayMs: number;
  readonly workerStaleRecoveryIntervalMs: number;
}

export const environment: Environment = {
  nodeEnv: parsedEnvironment.data.NODE_ENV,
  host: parsedEnvironment.data.HOST,
  port: parsedEnvironment.data.PORT,
  databaseUrl: parsedEnvironment.data.DATABASE_URL,
  databaseMaxConnections:
    parsedEnvironment.data.DATABASE_MAX_CONNECTIONS,
  databaseSsl: parsedEnvironment.data.DATABASE_SSL,
  workerPollIntervalMs: parsedEnvironment.data.WORKER_POLL_INTERVAL_MS,
  workerName: parsedEnvironment.data.WORKER_NAME,
  workerLeaseDurationMs: parsedEnvironment.data.WORKER_LEASE_DURATION_MS,
  workerHeartbeatIntervalMs: parsedEnvironment.data.WORKER_HEARTBEAT_INTERVAL_MS,
  workerMaxAttempts: parsedEnvironment.data.WORKER_MAX_ATTEMPTS,
  workerConcurrency: parsedEnvironment.data.WORKER_CONCURRENCY,
  workerShutdownTimeoutMs: parsedEnvironment.data.WORKER_SHUTDOWN_TIMEOUT_MS,
  workerRetryBaseDelayMs: parsedEnvironment.data.WORKER_RETRY_BASE_DELAY_MS,
  workerRetryMaxDelayMs: parsedEnvironment.data.WORKER_RETRY_MAX_DELAY_MS,
  workerStaleRecoveryIntervalMs:
    parsedEnvironment.data.WORKER_STALE_RECOVERY_INTERVAL_MS
};
