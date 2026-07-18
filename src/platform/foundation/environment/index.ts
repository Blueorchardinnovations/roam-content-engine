import 'dotenv/config';

import { z } from 'zod';

const trimString = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim() : value;

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

  WORKER_STALE_RECOVERY_INTERVAL_MS: z.coerce.number().int().positive().default(30000),

  PUBLISH_WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  PUBLISH_WORKER_NAME: z.string().min(1).default('roam-content-publish-worker'),

  PUBLISH_JOB_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(2000),

  PUBLISH_JOB_MAX_CONSECUTIVE_FAILURES: z.coerce.number().int().min(1).default(5),

  PUBLISH_JOB_LEASE_DURATION_MS: z.coerce.number().int().positive().default(30000),

  PUBLISH_JOB_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(10000),

  PUBLISH_JOB_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1000),

  PUBLISH_JOB_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(60000),

  PUBLISH_JOB_STALE_RECOVERY_INTERVAL_MS: z.coerce.number().int().positive().default(30000),

  PUBLISH_JOB_CONCURRENCY: z.coerce.number().int().min(1).default(1),

  PUBLISH_JOB_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  PUBLISH_ENGINE_BASE_URL: z.preprocess(trimString, z.string().default('')),

  PUBLISH_ENGINE_SCOPE: z.preprocess(trimString, z.string().default('')),

  PUBLISH_ENGINE_IDENTITY_MODE: z.preprocess(trimString, z.string().default('')),

  PUBLISH_ENGINE_MANAGED_IDENTITY_CLIENT_ID: z.preprocess(trimString, z.string().default('')),

  PUBLISH_ENGINE_TOKEN_REFRESH_SKEW_MS: z.preprocess(trimString, z.string().default('300000')),

  PUBLISH_ENGINE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(300000).default(30000),

  PUBLISH_ENGINE_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),

  PUBLISH_ENGINE_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(250),

  PUBLISH_ENGINE_RETRY_MAX_DELAY_MS: z.coerce.number().int().positive().default(5000),

  AI_PROVIDER: z.preprocess(trimString, z.enum(['mock', 'openai']).default('mock')),

  OPENAI_API_KEY: z.preprocess(trimString, z.string().default('')),

  OPENAI_MODEL: z.preprocess(trimString, z.string().min(1).default('gpt-4o-mini')),

  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().max(300000).default(30000),

  PIPELINE_VERSION: z.preprocess(trimString, z.string().min(1).default('1.0.0')),

  MOCK_AI_MODE: z
    .enum([
      'success',
      'retryable-failure',
      'permanent-failure',
      'timeout',
      'malformed-output'
    ])
    .default('success')
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

  if (value.PUBLISH_JOB_LEASE_DURATION_MS <= value.PUBLISH_JOB_HEARTBEAT_INTERVAL_MS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'PUBLISH_JOB_LEASE_DURATION_MS must be greater than PUBLISH_JOB_HEARTBEAT_INTERVAL_MS.',
      path: ['PUBLISH_JOB_LEASE_DURATION_MS']
    });
  }

  if (value.PUBLISH_JOB_RETRY_MAX_DELAY_MS < value.PUBLISH_JOB_RETRY_BASE_DELAY_MS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'PUBLISH_JOB_RETRY_MAX_DELAY_MS must be greater than or equal to PUBLISH_JOB_RETRY_BASE_DELAY_MS.',
      path: ['PUBLISH_JOB_RETRY_MAX_DELAY_MS']
    });
  }

  if (value.PUBLISH_ENGINE_RETRY_MAX_DELAY_MS < value.PUBLISH_ENGINE_RETRY_BASE_DELAY_MS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'PUBLISH_ENGINE_RETRY_MAX_DELAY_MS must be greater than or equal to PUBLISH_ENGINE_RETRY_BASE_DELAY_MS.',
      path: ['PUBLISH_ENGINE_RETRY_MAX_DELAY_MS']
    });
  }

  if (value.AI_PROVIDER === 'openai' && value.OPENAI_API_KEY.trim().length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'OPENAI_API_KEY is required when AI_PROVIDER=openai.',
      path: ['OPENAI_API_KEY']
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
  readonly publishWorkerEnabled: boolean;
  readonly publishWorkerName: string;
  readonly publishJobPollIntervalMs: number;
  readonly publishJobMaxConsecutiveFailures: number;
  readonly publishJobLeaseDurationMs: number;
  readonly publishJobHeartbeatIntervalMs: number;
  readonly publishJobRetryBaseDelayMs: number;
  readonly publishJobRetryMaxDelayMs: number;
  readonly publishJobStaleRecoveryIntervalMs: number;
  readonly publishJobConcurrency: number;
  readonly publishJobShutdownTimeoutMs: number;
  readonly publishEngineBaseUrl: string;
  readonly publishEngineScope: string;
  readonly publishEngineIdentityMode: string;
  readonly publishEngineManagedIdentityClientId: string;
  readonly publishEngineTokenRefreshSkewMs: string;
  readonly publishEngineRequestTimeoutMs: number;
  readonly publishEngineMaxRetries: number;
  readonly publishEngineRetryBaseDelayMs: number;
  readonly publishEngineRetryMaxDelayMs: number;
  readonly aiProvider: 'mock' | 'openai';
  readonly openAiApiKey: string;
  readonly openAiModel: string;
  readonly openAiTimeoutMs: number;
  readonly pipelineVersion: string;
  readonly mockAiMode:
    | 'success'
    | 'retryable-failure'
    | 'permanent-failure'
    | 'timeout'
    | 'malformed-output';
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
    parsedEnvironment.data.WORKER_STALE_RECOVERY_INTERVAL_MS,
  publishWorkerEnabled: parsedEnvironment.data.PUBLISH_WORKER_ENABLED,
  publishWorkerName: parsedEnvironment.data.PUBLISH_WORKER_NAME,
  publishJobPollIntervalMs: parsedEnvironment.data.PUBLISH_JOB_POLL_INTERVAL_MS,
  publishJobMaxConsecutiveFailures:
    parsedEnvironment.data.PUBLISH_JOB_MAX_CONSECUTIVE_FAILURES,
  publishJobLeaseDurationMs: parsedEnvironment.data.PUBLISH_JOB_LEASE_DURATION_MS,
  publishJobHeartbeatIntervalMs:
    parsedEnvironment.data.PUBLISH_JOB_HEARTBEAT_INTERVAL_MS,
  publishJobRetryBaseDelayMs:
    parsedEnvironment.data.PUBLISH_JOB_RETRY_BASE_DELAY_MS,
  publishJobRetryMaxDelayMs:
    parsedEnvironment.data.PUBLISH_JOB_RETRY_MAX_DELAY_MS,
  publishJobStaleRecoveryIntervalMs:
    parsedEnvironment.data.PUBLISH_JOB_STALE_RECOVERY_INTERVAL_MS,
  publishJobConcurrency: parsedEnvironment.data.PUBLISH_JOB_CONCURRENCY,
  publishJobShutdownTimeoutMs:
    parsedEnvironment.data.PUBLISH_JOB_SHUTDOWN_TIMEOUT_MS,
  publishEngineBaseUrl: parsedEnvironment.data.PUBLISH_ENGINE_BASE_URL,
  publishEngineScope: parsedEnvironment.data.PUBLISH_ENGINE_SCOPE,
  publishEngineIdentityMode: parsedEnvironment.data.PUBLISH_ENGINE_IDENTITY_MODE,
  publishEngineManagedIdentityClientId:
    parsedEnvironment.data.PUBLISH_ENGINE_MANAGED_IDENTITY_CLIENT_ID,
  publishEngineTokenRefreshSkewMs:
    parsedEnvironment.data.PUBLISH_ENGINE_TOKEN_REFRESH_SKEW_MS,
  publishEngineRequestTimeoutMs:
    parsedEnvironment.data.PUBLISH_ENGINE_REQUEST_TIMEOUT_MS,
  publishEngineMaxRetries: parsedEnvironment.data.PUBLISH_ENGINE_MAX_RETRIES,
  publishEngineRetryBaseDelayMs:
    parsedEnvironment.data.PUBLISH_ENGINE_RETRY_BASE_DELAY_MS,
  publishEngineRetryMaxDelayMs:
    parsedEnvironment.data.PUBLISH_ENGINE_RETRY_MAX_DELAY_MS,
  aiProvider: parsedEnvironment.data.AI_PROVIDER,
  openAiApiKey: parsedEnvironment.data.OPENAI_API_KEY,
  openAiModel: parsedEnvironment.data.OPENAI_MODEL,
  openAiTimeoutMs: parsedEnvironment.data.OPENAI_TIMEOUT_MS,
  pipelineVersion: parsedEnvironment.data.PIPELINE_VERSION,
  mockAiMode: parsedEnvironment.data.MOCK_AI_MODE
};
