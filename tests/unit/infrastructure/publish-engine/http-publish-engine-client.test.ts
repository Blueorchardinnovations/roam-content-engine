import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { HttpPublishEngineClient } from '../../../../src/infrastructure/publish-engine/http-publish-engine-client.js';
import {
  PublishEngineAuthenticationError,
  PublishEngineIdempotencyConflictError,
  PublishEngineJobFailedError,
  PublishEngineRemoteRequestError
} from '../../../../src/infrastructure/publish-engine/publish-engine-errors.js';
import type {
  PublishEngineConfig,
  PublishEngineFetch,
  PublishEngineLogger,
  PublishEngineStyledHtmlSource
} from '../../../../src/infrastructure/publish-engine/publish-engine-types.js';

function createConfig(overrides?: Partial<PublishEngineConfig>): PublishEngineConfig {
  return {
    baseUrl: new URL('https://publish.example.com'),
    scope: 'api://publish/.default',
    requestTimeoutMs: 5_000,
    pollIntervalMs: 50,
    maxWaitMs: 500,
    maxRetries: 2,
    retryBaseDelayMs: 25,
    retryMaxDelayMs: 100,
    retryJitterRatio: 0,
    ...overrides
  };
}

function createSource(payload = '<!doctype html><html><body>hello</body></html>'): PublishEngineStyledHtmlSource {
  const bytes = Buffer.from(payload, 'utf8');

  return {
    payloadRepresentation: 'styled-html',
    mimeType: 'text/html; charset=utf-8',
    fileExtension: '.html',
    payload,
    byteSize: bytes.byteLength,
    checksumSha256: createHash('sha256').update(bytes).digest('hex')
  };
}

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers
    }
  });
}

describe('http publish engine client', () => {
  it('submits render with strict headers and endpoint', async () => {
    const fetchMock = vi.fn<PublishEngineFetch>(async (_input, init) => {
      const request = init as RequestInit;
      const headers = request.headers as Headers;
      expect(request.method).toBe('POST');
      expect(headers.get('authorization')).toBe('Bearer token_abc');
      expect(headers.get('idempotency-key')).toBe('idem_1');
      expect(headers.get('x-correlation-id')).toBe('corr_1');

      return jsonResponse(200, {
        jobId: 'job_001',
        state: 'accepted',
        outputFormat: 'pdf'
      });
    });

    const client = new HttpPublishEngineClient({
      config: createConfig(),
      fetch: fetchMock,
      accessTokenProvider: {
        getAccessToken: async () => 'token_abc'
      }
    });

    const result = await client.submitRender({
      source: createSource(),
      outputFormat: 'pdf'
    }, {
      idempotencyKey: 'idem_1',
      correlationId: 'corr_1'
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.jobId).toBe('job_001');
  });

  it('retries idempotent submission on retryable status and succeeds', async () => {
    const sleepMock = vi.fn(async () => undefined);
    let attempt = 0;

    const fetchMock = vi.fn<PublishEngineFetch>(async () => {
      attempt += 1;

      if (attempt === 1) {
        return jsonResponse(503, {
          code: 'TEMP_UNAVAILABLE',
          message: 'temporary'
        }, {
          'retry-after': '1'
        });
      }

      return jsonResponse(200, {
        jobId: 'job_002',
        state: 'accepted',
        outputFormat: 'pdf'
      });
    });

    const client = new HttpPublishEngineClient({
      config: createConfig(),
      fetch: fetchMock,
      sleep: sleepMock,
      accessTokenProvider: {
        getAccessToken: async () => 'token_abc'
      }
    });

    const result = await client.submitRender({
      source: createSource(),
      outputFormat: 'pdf'
    }, {
      idempotencyKey: 'idem_retry'
    });

    expect(result.jobId).toBe('job_002');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(100);
  });

  it('does not retry non-idempotent submission', async () => {
    const fetchMock = vi.fn<PublishEngineFetch>(async () => jsonResponse(503, {
      code: 'TEMP_UNAVAILABLE',
      message: 'temporary'
    }));

    const client = new HttpPublishEngineClient({
      config: createConfig(),
      fetch: fetchMock,
      accessTokenProvider: {
        getAccessToken: async () => 'token_abc'
      }
    });

    await expect(client.submitRender({
      source: createSource(),
      outputFormat: 'pdf'
    })).rejects.toBeInstanceOf(PublishEngineRemoteRequestError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps idempotency conflict to dedicated error', async () => {
    const fetchMock = vi.fn<PublishEngineFetch>(async () => jsonResponse(409, {
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'duplicate'
    }));

    const client = new HttpPublishEngineClient({
      config: createConfig(),
      fetch: fetchMock,
      accessTokenProvider: {
        getAccessToken: async () => 'token_abc'
      }
    });

    await expect(client.submitRender({
      source: createSource(),
      outputFormat: 'pdf'
    }, {
      idempotencyKey: 'idem_1'
    })).rejects.toBeInstanceOf(PublishEngineIdempotencyConflictError);
  });

  it('maps unauthorized responses to authentication error', async () => {
    const fetchMock = vi.fn<PublishEngineFetch>(async () => jsonResponse(401, {
      code: 'UNAUTHORIZED',
      message: 'bad token'
    }));

    const client = new HttpPublishEngineClient({
      config: createConfig(),
      fetch: fetchMock,
      accessTokenProvider: {
        getAccessToken: async () => 'token_abc'
      }
    });

    await expect(client.getJob('job_123')).rejects.toBeInstanceOf(PublishEngineAuthenticationError);
  });

  it('polls until job is succeeded', async () => {
    let nowMs = 0;
    const sleepMock = vi.fn(async (delayMs: number) => {
      nowMs += delayMs;
    });

    const fetchMock = vi.fn<PublishEngineFetch>(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return jsonResponse(200, {
          jobId: 'job_300',
          state: 'running',
          outputFormat: 'pdf'
        });
      }

      return jsonResponse(200, {
        jobId: 'job_300',
        state: 'succeeded',
        outputFormat: 'pdf'
      });
    });

    const client = new HttpPublishEngineClient({
      config: createConfig({
        pollIntervalMs: 30,
        maxWaitMs: 500
      }),
      fetch: fetchMock,
      sleep: sleepMock,
      now: () => new Date(nowMs),
      accessTokenProvider: {
        getAccessToken: async () => 'token_abc'
      }
    });

    const result = await client.waitForJob('job_300');

    expect(result.state).toBe('succeeded');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledWith(30);
  });

  it('throws when wait loop reaches failed terminal state', async () => {
    const fetchMock = vi.fn<PublishEngineFetch>(async () => jsonResponse(200, {
      jobId: 'job_400',
      state: 'failed',
      outputFormat: 'pdf',
      error: {
        code: 'RENDER_FAILED',
        message: 'failed remotely'
      }
    }));

    const client = new HttpPublishEngineClient({
      config: createConfig(),
      fetch: fetchMock,
      accessTokenProvider: {
        getAccessToken: async () => 'token_abc'
      }
    });

    await expect(client.waitForJob('job_400')).rejects.toBeInstanceOf(PublishEngineJobFailedError);
  });

  it('redacts idempotency key in logs', async () => {
    const logger: PublishEngineLogger = {
      warn: vi.fn()
    };

    const fetchMock = vi.fn<PublishEngineFetch>(async () => jsonResponse(503, {
      code: 'TEMP_UNAVAILABLE',
      message: 'temporary'
    }));

    const client = new HttpPublishEngineClient({
      config: createConfig({ maxRetries: 0 }),
      fetch: fetchMock,
      logger,
      accessTokenProvider: {
        getAccessToken: async () => 'token_abc'
      }
    });

    await expect(client.submitRender({
      source: createSource(),
      outputFormat: 'pdf'
    }, {
      idempotencyKey: 'idem_private_value'
    })).rejects.toThrow('retry attempts were exhausted');

    const call = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    const fields = call[1] as Record<string, unknown>;

    expect(typeof fields.idempotencyKeyHash).toBe('string');
    expect(fields.idempotencyKeyHash).not.toBe('idem_private_value');
  });
});
