import type { RetryPolicyConfig } from '../../application/workers/retry-policy.js';
import { createHash } from 'node:crypto';
import { sleep, type Sleep } from '../../platform/foundation/sleep.js';
import {
  publishEngineJobSchema,
  publishEngineDownloadSchema,
  publishEngineRemoteErrorBodySchema,
  publishEngineJobIdSchema,
  publishEngineRequestOptionsSchema,
  submitCtaRenderRequestSchema,
  submitRenderRequestSchema,
  waitForPublishEngineJobOptionsSchema
} from './publish-engine-schemas.js';
import type {
  PublishEngineConfig,
  PublishEngineJob,
  PublishEngineRequestOptions,
  SubmitCtaRenderRequest,
  SubmitRenderRequest,
  WaitForPublishEngineJobOptions,
  PublishEngineFetch,
  PublishEngineLogger,
  PublishEngineDownload,
  PublishEngineRemoteErrorBody
} from './publish-engine-types.js';
import type { PublishEngineAccessTokenProvider } from './publish-engine-access-token-provider.js';
import type { PublishEngineClient } from './publish-engine-client.js';
import {
  PublishEngineAuthenticationError,
  PublishEngineCancelledError,
  PublishEngineJobCancelledError,
  PublishEngineJobFailedError,
  PublishEngineProtocolError,
  PublishEngineRemoteRequestError,
  PublishEngineRetryExhaustedError,
  PublishEngineTimeoutError,
  PublishEngineWaitTimeoutError,
  PublishEngineIdempotencyConflictError,
  PublishEngineTransportError
} from './publish-engine-errors.js';
import {
  isRetryableStatus,
  parseRetryAfterMs,
  resolveRetryDelayMs,
  shouldRetryOperation,
  type PublishEngineRetryContext,
  type RetryableOperationType
} from './publish-engine-retry-policy.js';
import { validatePublishEngineStyledHtmlSource } from './publish-engine-artifact-validator.js';

export type HttpPublishEngineClientDependencies = {
  readonly config: PublishEngineConfig;
  readonly accessTokenProvider: PublishEngineAccessTokenProvider;
  readonly fetch?: PublishEngineFetch;
  readonly now?: () => Date;
  readonly sleep?: Sleep;
  readonly random?: () => number;
  readonly logger?: PublishEngineLogger;
};

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ETIMEDOUT'
]);

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unknown error';
}

function hashForLogs(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}

function resolvePath(baseUrl: URL, path: string): URL {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const resolved = new URL(normalizedPath, baseUrl);

  if (resolved.origin !== baseUrl.origin) {
    throw new PublishEngineProtocolError('Publish Engine endpoint resolution escaped the configured origin.');
  }

  return resolved;
}

function normalizeJobId(jobId: string): string {
  const parsed = publishEngineJobIdSchema.safeParse(jobId);
  if (!parsed.success) {
    throw new PublishEngineProtocolError('Publish Engine job ID is invalid.', {
      issues: parsed.error.issues
    });
  }

  return parsed.data;
}

function normalizeRequestOptions(options?: PublishEngineRequestOptions): PublishEngineRequestOptions {
  if (!options) {
    return {};
  }

  const parsed = publishEngineRequestOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw new PublishEngineProtocolError('Publish Engine request options are invalid.', {
      issues: parsed.error.issues
    });
  }

  return {
    ...(parsed.data.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: parsed.data.idempotencyKey }),
    ...(parsed.data.correlationId === undefined
      ? {}
      : { correlationId: parsed.data.correlationId }),
    ...(parsed.data.signal === undefined
      ? {}
      : { signal: parsed.data.signal }),
    ...(parsed.data.timeoutMs === undefined
      ? {}
      : { timeoutMs: parsed.data.timeoutMs })
  };
}

function normalizeWaitOptions(options?: WaitForPublishEngineJobOptions): WaitForPublishEngineJobOptions {
  if (!options) {
    return {};
  }

  const parsed = waitForPublishEngineJobOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw new PublishEngineProtocolError('Publish Engine wait options are invalid.', {
      issues: parsed.error.issues
    });
  }

  return {
    ...(parsed.data.idempotencyKey === undefined
      ? {}
      : { idempotencyKey: parsed.data.idempotencyKey }),
    ...(parsed.data.correlationId === undefined
      ? {}
      : { correlationId: parsed.data.correlationId }),
    ...(parsed.data.signal === undefined
      ? {}
      : { signal: parsed.data.signal }),
    ...(parsed.data.timeoutMs === undefined
      ? {}
      : { timeoutMs: parsed.data.timeoutMs }),
    ...(parsed.data.pollIntervalMs === undefined
      ? {}
      : { pollIntervalMs: parsed.data.pollIntervalMs }),
    ...(parsed.data.maxWaitMs === undefined
      ? {}
      : { maxWaitMs: parsed.data.maxWaitMs })
  };
}

function toPublishEngineJob(input: {
  jobId: string;
  state: 'queued' | 'accepted' | 'running' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  outputFormat: 'html' | 'pdf' | 'epub';
  correlationId?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  error?: {
    code: string;
    message: string;
    correlationId?: string | undefined;
  } | undefined;
}): PublishEngineJob {
  return {
    jobId: input.jobId,
    state: input.state,
    outputFormat: input.outputFormat,
    ...(input.correlationId === undefined
      ? {}
      : { correlationId: input.correlationId }),
    ...(input.createdAt === undefined
      ? {}
      : { createdAt: input.createdAt }),
    ...(input.updatedAt === undefined
      ? {}
      : { updatedAt: input.updatedAt }),
    ...(input.error === undefined
      ? {}
      : {
          error: {
            code: input.error.code,
            message: input.error.message,
            ...(input.error.correlationId === undefined
              ? {}
              : { correlationId: input.error.correlationId })
          }
        })
  };
}

function toPublishEngineDownload(input: {
  jobId: string;
  fileName: string;
  mimeType: string;
  byteSize?: number | undefined;
  checksumSha256?: string | undefined;
  downloadUrl?: string | undefined;
  expiresAt?: string | undefined;
}): PublishEngineDownload {
  return {
    jobId: input.jobId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    ...(input.byteSize === undefined
      ? {}
      : { byteSize: input.byteSize }),
    ...(input.checksumSha256 === undefined
      ? {}
      : { checksumSha256: input.checksumSha256 }),
    ...(input.downloadUrl === undefined
      ? {}
      : { downloadUrl: input.downloadUrl }),
    ...(input.expiresAt === undefined
      ? {}
      : { expiresAt: input.expiresAt })
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === 'AbortError' || /abort/i.test(error.message));
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as Error & { code?: string }).code;
  if (code && RETRYABLE_NETWORK_ERROR_CODES.has(code)) {
    return true;
  }

  return /network|socket|timeout|timed out|connection/i.test(error.message);
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (raw.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new PublishEngineProtocolError('Publish Engine response body is not valid JSON.');
  }
}

function validateToken(token: string): string {
  const normalized = token.trim();

  if (normalized.length === 0) {
    throw new PublishEngineAuthenticationError('Publish Engine access token is empty.');
  }

  if (CONTROL_CHARACTERS.test(normalized)) {
    throw new PublishEngineAuthenticationError('Publish Engine access token contains invalid control characters.');
  }

  if (normalized !== token) {
    throw new PublishEngineAuthenticationError('Publish Engine access token must not contain surrounding whitespace.');
  }

  return normalized;
}

function createAbortController(input: {
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
}): {
  readonly signal: AbortSignal;
  readonly clear: () => void;
  readonly didTimeout: () => boolean;
  readonly didCancel: () => boolean;
} {
  const controller = new AbortController();
  let timeoutTriggered = false;
  let cancelTriggered = false;

  const timeout = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort();
  }, input.timeoutMs);

  const onAbort = () => {
    cancelTriggered = true;
    controller.abort();
  };

  if (input.signal) {
    if (input.signal.aborted) {
      cancelTriggered = true;
      controller.abort();
    } else {
      input.signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timeout);
      if (input.signal) {
        input.signal.removeEventListener('abort', onAbort);
      }
    },
    didTimeout: () => timeoutTriggered,
    didCancel: () => cancelTriggered || Boolean(input.signal?.aborted)
  };
}

export class HttpPublishEngineClient implements PublishEngineClient {
  private readonly fetch: PublishEngineFetch;
  private readonly now: () => Date;
  private readonly sleep: Sleep;
  private readonly random: () => number;
  private readonly logger: PublishEngineLogger | undefined;

  public constructor(private readonly dependencies: HttpPublishEngineClientDependencies) {
    this.fetch = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = dependencies.now ?? (() => new Date());
    this.sleep = dependencies.sleep ?? sleep;
    this.random = dependencies.random ?? Math.random;
    this.logger = dependencies.logger;
  }

  public async submitRender(
    request: SubmitRenderRequest,
    options?: PublishEngineRequestOptions
  ): Promise<PublishEngineJob> {
    const parsed = submitRenderRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new PublishEngineProtocolError('Publish Engine submitRender request is invalid.', {
        issues: parsed.error.issues
      });
    }

    validatePublishEngineStyledHtmlSource(parsed.data.source);
    const normalizedOptions = normalizeRequestOptions(options);

    return await this.requestWithRetry<PublishEngineJob>({
      operation: 'submitRender',
      operationType: 'submission',
      method: 'POST',
      path: '/v1/render-jobs',
      body: parsed.data,
      options: normalizedOptions,
      parseSuccess: (body) => {
        const parsedJob = publishEngineJobSchema.safeParse(body);
        if (!parsedJob.success) {
          throw new PublishEngineProtocolError('Publish Engine submitRender response schema is invalid.', {
            issues: parsedJob.error.issues
          });
        }

        return toPublishEngineJob(parsedJob.data);
      }
    });
  }

  public async submitCtaRender(
    request: SubmitCtaRenderRequest,
    options?: PublishEngineRequestOptions
  ): Promise<PublishEngineJob> {
    const parsed = submitCtaRenderRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new PublishEngineProtocolError('Publish Engine submitCtaRender request is invalid.', {
        issues: parsed.error.issues
      });
    }

    validatePublishEngineStyledHtmlSource(parsed.data.source);
    const normalizedOptions = normalizeRequestOptions(options);

    return await this.requestWithRetry<PublishEngineJob>({
      operation: 'submitCtaRender',
      operationType: 'submission',
      method: 'POST',
      path: '/v1/cta-render-jobs',
      body: parsed.data,
      options: normalizedOptions,
      parseSuccess: (body) => {
        const parsedJob = publishEngineJobSchema.safeParse(body);
        if (!parsedJob.success) {
          throw new PublishEngineProtocolError('Publish Engine submitCtaRender response schema is invalid.', {
            issues: parsedJob.error.issues
          });
        }

        return toPublishEngineJob(parsedJob.data);
      }
    });
  }

  public async getJob(
    jobId: string,
    options?: PublishEngineRequestOptions
  ): Promise<PublishEngineJob> {
    const normalizedJobId = normalizeJobId(jobId);
    const normalizedOptions = normalizeRequestOptions(options);

    return await this.requestWithRetry<PublishEngineJob>({
      operation: 'getJob',
      operationType: 'read',
      method: 'GET',
      path: `/v1/render-jobs/${encodeURIComponent(normalizedJobId)}`,
      options: normalizedOptions,
      parseSuccess: (body) => {
        const parsedJob = publishEngineJobSchema.safeParse(body);
        if (!parsedJob.success) {
          throw new PublishEngineProtocolError('Publish Engine getJob response schema is invalid.', {
            issues: parsedJob.error.issues
          });
        }

        return toPublishEngineJob(parsedJob.data);
      }
    });
  }

  public async getDownload(
    jobId: string,
    options?: PublishEngineRequestOptions
  ): Promise<PublishEngineDownload> {
    const normalizedJobId = normalizeJobId(jobId);
    const normalizedOptions = normalizeRequestOptions(options);

    return await this.requestWithRetry<PublishEngineDownload>({
      operation: 'getDownload',
      operationType: 'read',
      method: 'GET',
      path: `/v1/render-jobs/${encodeURIComponent(normalizedJobId)}/download`,
      options: normalizedOptions,
      parseSuccess: (body) => {
        const parsedDownload = publishEngineDownloadSchema.safeParse(body);
        if (!parsedDownload.success) {
          throw new PublishEngineProtocolError('Publish Engine getDownload response schema is invalid.', {
            issues: parsedDownload.error.issues
          });
        }

        return toPublishEngineDownload(parsedDownload.data);
      }
    });
  }

  public async waitForJob(
    jobId: string,
    options?: WaitForPublishEngineJobOptions
  ): Promise<PublishEngineJob> {
    const normalizedJobId = normalizeJobId(jobId);
    const normalizedOptions = normalizeWaitOptions(options);

    const pollIntervalMs = normalizedOptions.pollIntervalMs
      ?? this.dependencies.config.pollIntervalMs;
    const maxWaitMs = normalizedOptions.maxWaitMs
      ?? this.dependencies.config.maxWaitMs;

    const startedAtMs = this.now().getTime();

    while (true) {
      if (normalizedOptions.signal?.aborted) {
        throw new PublishEngineCancelledError('Publish Engine waitForJob operation was cancelled by caller.', {
          operation: 'waitForJob',
          jobId: normalizedJobId
        });
      }

      const job = await this.getJob(normalizedJobId, normalizedOptions);
      if (job.state === 'succeeded') {
        return job;
      }

      if (job.state === 'failed') {
        throw new PublishEngineJobFailedError('Publish Engine render job failed.', {
          jobId: normalizedJobId,
          state: job.state,
          remoteCode: job.error?.code,
          correlationId: job.correlationId ?? job.error?.correlationId
        });
      }

      if (job.state === 'cancelled') {
        throw new PublishEngineJobCancelledError('Publish Engine render job was cancelled.', {
          jobId: normalizedJobId,
          state: job.state,
          remoteCode: job.error?.code,
          correlationId: job.correlationId ?? job.error?.correlationId
        });
      }

      const elapsedMs = this.now().getTime() - startedAtMs;
      const remainingMs = maxWaitMs - elapsedMs;
      if (remainingMs <= 0) {
        throw new PublishEngineWaitTimeoutError('Publish Engine waitForJob exceeded the maximum wait time.', {
          jobId: normalizedJobId,
          elapsedMs,
          maxWaitMs
        });
      }

      const delayMs = Math.min(pollIntervalMs, remainingMs);
      await this.sleep(delayMs);
    }
  }

  private async requestWithRetry<T>(input: {
    operation: string;
    operationType: RetryableOperationType;
    method: 'GET' | 'POST';
    path: string;
    body?: unknown;
    options: PublishEngineRequestOptions;
    parseSuccess: (body: unknown) => T;
  }): Promise<T> {
    const retryContext: PublishEngineRetryContext = {
      operationType: input.operationType,
      hasIdempotencyKey: input.options.idempotencyKey !== undefined
    };

    const retryPolicy: RetryPolicyConfig = {
      baseDelayMs: this.dependencies.config.retryBaseDelayMs,
      maxDelayMs: this.dependencies.config.retryMaxDelayMs,
      maxAttempts: this.dependencies.config.maxRetries + 1,
      jitterRatio: this.dependencies.config.retryJitterRatio,
      random: this.random
    };

    const startedAtMs = this.now().getTime();
    const totalTimeoutMs = input.options.timeoutMs ?? this.dependencies.config.requestTimeoutMs;

    let lastError: unknown;

    for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt += 1) {
      const elapsedMs = this.now().getTime() - startedAtMs;
      const remainingBudgetMs = totalTimeoutMs - elapsedMs;
      if (remainingBudgetMs <= 0) {
        throw new PublishEngineTimeoutError('Publish Engine request exceeded total timeout budget.', {
          operation: input.operation,
          attempts: attempt - 1,
          timeoutMs: totalTimeoutMs
        }, lastError);
      }

      try {
        const result = await this.performHttpRequest<T>({
          ...input,
          timeoutMs: remainingBudgetMs,
          attempt
        });

        this.logger?.info?.('publish_engine_request_succeeded', {
          operation: input.operation,
          method: input.method,
          endpoint: input.path,
          attempt
        });

        return result;
      } catch (error) {
        lastError = error;

        const retryDecision = this.classifyRetry({
          error,
          retryContext,
          attempt,
          maxAttempts: retryPolicy.maxAttempts
        });

        this.logger?.warn?.('publish_engine_request_failed', {
          operation: input.operation,
          method: input.method,
          endpoint: input.path,
          attempt,
          retryable: retryDecision.retryable,
          status: retryDecision.status,
          reason: retryDecision.reason,
          idempotencyKeyHash: input.options.idempotencyKey
            ? hashForLogs(input.options.idempotencyKey)
            : undefined
        });

        if (!retryDecision.retryable) {
          throw error;
        }

        if (attempt >= retryPolicy.maxAttempts) {
          throw new PublishEngineRetryExhaustedError('Publish Engine retry attempts were exhausted.', {
            operation: input.operation,
            attempts: attempt,
            status: retryDecision.status,
            reason: retryDecision.reason
          }, error);
        }

        const elapsedAfterErrorMs = this.now().getTime() - startedAtMs;
        const remainingAfterErrorMs = totalTimeoutMs - elapsedAfterErrorMs;
        if (remainingAfterErrorMs <= 0) {
          throw new PublishEngineTimeoutError('Publish Engine request exceeded timeout budget before retry could run.', {
            operation: input.operation,
            attempts: attempt,
            timeoutMs: totalTimeoutMs
          }, error);
        }

        const retryAfterMs = retryDecision.retryAfterHeader
          ? parseRetryAfterMs(retryDecision.retryAfterHeader, this.now().getTime())
          : undefined;

        const delayMs = resolveRetryDelayMs({
          attemptNumber: attempt,
          ...(retryAfterMs === undefined
            ? {}
            : { retryAfterMs }),
          retryPolicy,
          remainingBudgetMs: remainingAfterErrorMs
        });

        if (delayMs > 0) {
          await this.sleep(delayMs);
        }
      }
    }

    throw new PublishEngineRetryExhaustedError('Publish Engine retry attempts were exhausted.', {
      operation: input.operation,
      attempts: retryPolicy.maxAttempts
    }, lastError);
  }

  private classifyRetry(input: {
    error: unknown;
    retryContext: PublishEngineRetryContext;
    attempt: number;
    maxAttempts: number;
  }): {
    retryable: boolean;
    status?: number;
    reason: string;
    retryAfterHeader?: string;
  } {
    if (input.error instanceof PublishEngineIdempotencyConflictError) {
      return {
        retryable: false,
        status: 409,
        reason: 'idempotency-conflict'
      };
    }

    if (input.error instanceof PublishEngineProtocolError) {
      return {
        retryable: false,
        reason: 'protocol-error'
      };
    }

    if (input.error instanceof PublishEngineAuthenticationError) {
      return {
        retryable: false,
        status: 401,
        reason: 'authentication-error'
      };
    }

    if (input.error instanceof PublishEngineCancelledError) {
      return {
        retryable: false,
        reason: 'cancelled'
      };
    }

    if (input.error instanceof PublishEngineRemoteRequestError) {
      if (input.error.status === 409 || input.error.status === 400 || input.error.status === 401 || input.error.status === 403 || input.error.status === 404 || input.error.status === 422) {
        return {
          retryable: false,
          status: input.error.status,
          reason: `status-${input.error.status}`
        };
      }

      const retryable = isRetryableStatus(input.error.status)
        && shouldRetryOperation(input.retryContext);

      const retryAfterHeader = input.error.details?.retryAfterHeader;

      return {
        retryable,
        status: input.error.status,
        reason: `status-${input.error.status}`,
        ...(typeof retryAfterHeader === 'string'
          ? { retryAfterHeader }
          : {})
      };
    }

    if (input.error instanceof PublishEngineTimeoutError) {
      return {
        retryable: shouldRetryOperation(input.retryContext),
        reason: 'request-timeout'
      };
    }

    if (input.error instanceof PublishEngineTransportError) {
      return {
        retryable: shouldRetryOperation(input.retryContext),
        reason: 'transport-error'
      };
    }

    return {
      retryable: false,
      reason: 'unknown-error'
    };
  }

  private async performHttpRequest<T>(input: {
    operation: string;
    operationType: RetryableOperationType;
    method: 'GET' | 'POST';
    path: string;
    body?: unknown;
    options: PublishEngineRequestOptions;
    parseSuccess: (body: unknown) => T;
    timeoutMs: number;
    attempt: number;
  }): Promise<T> {
    if (input.operationType === 'submission' && !input.options.idempotencyKey && this.dependencies.config.maxRetries > 0) {
      // submission retries will still be disabled by retry classification; this guard is intentionally informational.
    }

    const token = await this.acquireAccessToken(input.options.signal);

    const endpoint = resolvePath(this.dependencies.config.baseUrl, input.path);

    const headers = new Headers();
    headers.set('authorization', `Bearer ${token}`);
    headers.set('accept', 'application/json');

    if (input.method === 'POST') {
      headers.set('content-type', 'application/json');
    }

    if (input.options.idempotencyKey) {
      headers.set('idempotency-key', input.options.idempotencyKey);
    }

    if (input.options.correlationId) {
      headers.set('x-correlation-id', input.options.correlationId);
    }

    const abort = createAbortController({
      ...(input.options.signal === undefined
        ? {}
        : { signal: input.options.signal }),
      timeoutMs: input.timeoutMs
    });

    let response: Response;

    try {
      response = await this.fetch(endpoint, {
        method: input.method,
        headers,
        ...(input.body === undefined
          ? {}
          : { body: JSON.stringify(input.body) }),
        signal: abort.signal
      });
    } catch (error) {
      abort.clear();

      if (abort.didCancel()) {
        throw new PublishEngineCancelledError('Publish Engine request was cancelled by caller.', {
          operation: input.operation,
          attempt: input.attempt
        }, error);
      }

      if (abort.didTimeout()) {
        throw new PublishEngineTimeoutError('Publish Engine request timed out.', {
          operation: input.operation,
          timeoutMs: input.timeoutMs,
          attempt: input.attempt
        }, error);
      }

      if (isAbortError(error)) {
        throw new PublishEngineCancelledError('Publish Engine request was aborted.', {
          operation: input.operation,
          attempt: input.attempt
        }, error);
      }

      if (isRetryableNetworkError(error)) {
        throw new PublishEngineTransportError('Publish Engine transport failure occurred.', {
          operation: input.operation,
          attempt: input.attempt
        }, error);
      }

      throw new PublishEngineTransportError('Publish Engine transport request failed.', {
        operation: input.operation,
        attempt: input.attempt
      }, error);
    } finally {
      abort.clear();
    }

    const responseCorrelationId = response.headers.get('x-correlation-id') ?? undefined;

    if (response.status >= 200 && response.status < 300) {
      const body = await parseJsonBody(response);
      return input.parseSuccess(body);
    }

    const body = await this.parseRemoteErrorBody(response);
    const status = response.status;

    if (status === 401) {
      throw new PublishEngineAuthenticationError('Publish Engine authentication failed.', {
        operation: input.operation,
        status,
        ...(body?.code === undefined
          ? {}
          : { remoteCode: body.code }),
        ...((body?.correlationId ?? responseCorrelationId) === undefined
          ? {}
          : { correlationId: body?.correlationId ?? responseCorrelationId })
      });
    }

    if (status === 409 && body?.code === 'IDEMPOTENCY_CONFLICT') {
      const idempotencyKeyHash = input.options.idempotencyKey
        ? hashForLogs(input.options.idempotencyKey)
        : undefined;

      throw new PublishEngineIdempotencyConflictError('Publish Engine idempotency conflict.', {
        operation: input.operation,
        status,
        remoteCode: body.code,
        ...((body.correlationId ?? responseCorrelationId) === undefined
          ? {}
          : { correlationId: body.correlationId ?? responseCorrelationId }),
        ...(idempotencyKeyHash === undefined
          ? {}
          : { idempotencyKeyHash })
      });
    }

    throw new PublishEngineRemoteRequestError('Publish Engine request failed.', {
      status,
      details: {
        operation: input.operation,
        ...(body?.code === undefined
          ? {}
          : { remoteCode: body.code }),
        ...((body?.correlationId ?? responseCorrelationId) === undefined
          ? {}
          : { correlationId: body?.correlationId ?? responseCorrelationId }),
        ...(response.headers.get('retry-after') === null
          ? {}
          : { retryAfterHeader: response.headers.get('retry-after') })
      }
    });
  }

  private async parseRemoteErrorBody(response: Response): Promise<PublishEngineRemoteErrorBody | undefined> {
    try {
      const body = await parseJsonBody(response);
      const parsed = publishEngineRemoteErrorBodySchema.safeParse(body);
      if (!parsed.success) {
        return undefined;
      }

      return {
        code: parsed.data.code,
        message: parsed.data.message,
        ...(parsed.data.correlationId === undefined
          ? {}
          : { correlationId: parsed.data.correlationId })
      };
    } catch {
      return undefined;
    }
  }

  private async acquireAccessToken(signal?: AbortSignal): Promise<string> {
    try {
      const token = await this.dependencies.accessTokenProvider.getAccessToken(
        signal === undefined
          ? {}
          : { signal }
      );
      return validateToken(token);
    } catch (error) {
      if (error instanceof PublishEngineAuthenticationError) {
        throw error;
      }

      throw new PublishEngineAuthenticationError('Publish Engine access token acquisition failed.', undefined, error);
    }
  }
}
