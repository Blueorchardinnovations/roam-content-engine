import { z } from 'zod';

import type { PublishEngineConfig } from './publish-engine-types.js';
import { PublishEngineConfigurationError } from './publish-engine-errors.js';

const configSchema = z.object({
  baseUrl: z.url(),
  scope: z.string().trim().min(1).max(2000),
  requestTimeoutMs: z.number().int().positive().max(300_000).default(30_000),
  pollIntervalMs: z.number().int().positive().max(60_000).default(2_000),
  maxWaitMs: z.number().int().positive().max(3_600_000).default(300_000),
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryBaseDelayMs: z.number().int().positive().max(60_000).default(250),
  retryMaxDelayMs: z.number().int().positive().max(120_000).default(5_000),
  retryJitterRatio: z.number().min(0).max(1).default(0.2)
}).strict().superRefine((value, context) => {
  if (value.maxWaitMs < value.pollIntervalMs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'maxWaitMs must be greater than or equal to pollIntervalMs.',
      path: ['maxWaitMs']
    });
  }

  if (value.retryMaxDelayMs < value.retryBaseDelayMs) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'retryMaxDelayMs must be greater than or equal to retryBaseDelayMs.',
      path: ['retryMaxDelayMs']
    });
  }
});

function normalizeBaseUrl(input: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new PublishEngineConfigurationError('PUBLISH_ENGINE_BASE_URL is invalid.');
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new PublishEngineConfigurationError('Publish Engine base URL must use HTTP or HTTPS.');
  }

  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new PublishEngineConfigurationError('Publish Engine base URL must not include embedded credentials.');
  }

  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new PublishEngineConfigurationError('Publish Engine base URL must not include query string or fragment.');
  }

  const normalizedPath = parsed.pathname === '/'
    ? '/'
    : parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = normalizedPath;

  const host = parsed.hostname.toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  const isLocalHttp = protocol === 'http:' && localHosts.has(host);

  if (protocol === 'http:' && !isLocalHttp) {
    throw new PublishEngineConfigurationError('Publish Engine base URL must use HTTPS except for localhost loopback testing.');
  }

  return parsed;
}

export function createPublishEngineConfig(input: {
  baseUrl: string;
  scope: string;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  maxWaitMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  retryJitterRatio?: number;
}): PublishEngineConfig {
  const parsed = configSchema.safeParse({
    ...input,
    baseUrl: input.baseUrl,
    scope: input.scope
  });

  if (!parsed.success) {
    throw new PublishEngineConfigurationError('Publish Engine configuration is invalid.', {
      issues: parsed.error.issues
    });
  }

  const baseUrl = normalizeBaseUrl(parsed.data.baseUrl);

  return {
    baseUrl,
    scope: parsed.data.scope,
    requestTimeoutMs: parsed.data.requestTimeoutMs,
    pollIntervalMs: parsed.data.pollIntervalMs,
    maxWaitMs: parsed.data.maxWaitMs,
    maxRetries: parsed.data.maxRetries,
    retryBaseDelayMs: parsed.data.retryBaseDelayMs,
    retryMaxDelayMs: parsed.data.retryMaxDelayMs,
    retryJitterRatio: parsed.data.retryJitterRatio
  };
}

export function createPublishEngineConfigFromEnvironment(env: NodeJS.ProcessEnv): PublishEngineConfig {
  const baseUrl = env.PUBLISH_ENGINE_BASE_URL;
  const scope = env.PUBLISH_ENGINE_SCOPE;

  if (!baseUrl || baseUrl.trim().length === 0) {
    throw new PublishEngineConfigurationError('PUBLISH_ENGINE_BASE_URL is required.');
  }

  if (!scope || scope.trim().length === 0) {
    throw new PublishEngineConfigurationError('PUBLISH_ENGINE_SCOPE is required.');
  }

  const parseNumber = (value: string | undefined): number | undefined => {
    if (value === undefined || value.trim().length === 0) {
      return undefined;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : NaN;
  };

  const requestTimeoutMs = parseNumber(env.PUBLISH_ENGINE_REQUEST_TIMEOUT_MS);
  const pollIntervalMs = parseNumber(env.PUBLISH_ENGINE_POLL_INTERVAL_MS);
  const maxWaitMs = parseNumber(env.PUBLISH_ENGINE_MAX_WAIT_MS);
  const maxRetries = parseNumber(env.PUBLISH_ENGINE_MAX_RETRIES);
  const retryBaseDelayMs = parseNumber(env.PUBLISH_ENGINE_RETRY_BASE_DELAY_MS);
  const retryMaxDelayMs = parseNumber(env.PUBLISH_ENGINE_RETRY_MAX_DELAY_MS);

  return createPublishEngineConfig({
    baseUrl,
    scope,
    ...(requestTimeoutMs === undefined
      ? {}
      : { requestTimeoutMs }),
    ...(pollIntervalMs === undefined
      ? {}
      : { pollIntervalMs }),
    ...(maxWaitMs === undefined
      ? {}
      : { maxWaitMs }),
    ...(maxRetries === undefined
      ? {}
      : { maxRetries }),
    ...(retryBaseDelayMs === undefined
      ? {}
      : { retryBaseDelayMs }),
    ...(retryMaxDelayMs === undefined
      ? {}
      : { retryMaxDelayMs })
  });
}
