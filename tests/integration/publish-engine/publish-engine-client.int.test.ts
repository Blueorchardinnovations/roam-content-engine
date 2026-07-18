import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import { HttpPublishEngineClient } from '../../../src/infrastructure/publish-engine/http-publish-engine-client.js';
import type {
  PublishEngineConfig,
  PublishEngineFetch,
  PublishEngineStyledHtmlSource
} from '../../../src/infrastructure/publish-engine/publish-engine-types.js';

function createSource(payload = '<!doctype html><html><body>integration</body></html>'): PublishEngineStyledHtmlSource {
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

function createConfig(): PublishEngineConfig {
  return {
    baseUrl: new URL('https://publish.example.com'),
    scope: 'api://publish/.default',
    requestTimeoutMs: 3000,
    pollIntervalMs: 10,
    maxWaitMs: 1000,
    maxRetries: 1,
    retryBaseDelayMs: 1,
    retryMaxDelayMs: 5,
    retryJitterRatio: 0
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}

describe('publish engine client integration (fake transport)', () => {
  it('submits, polls, and resolves a download link through the typed boundary', async () => {
    const jobState = {
      jobId: 'job_900',
      polls: 0
    };

    const fetch: PublishEngineFetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const method = init?.method ?? 'GET';

      if (method === 'POST' && url.pathname === '/v1/render-jobs') {
        return jsonResponse(200, {
          jobId: jobState.jobId,
          state: 'accepted',
          outputFormat: 'pdf'
        });
      }

      if (method === 'GET' && url.pathname === `/v1/render-jobs/${jobState.jobId}`) {
        jobState.polls += 1;

        if (jobState.polls < 2) {
          return jsonResponse(200, {
            jobId: jobState.jobId,
            state: 'running',
            outputFormat: 'pdf'
          });
        }

        return jsonResponse(200, {
          jobId: jobState.jobId,
          state: 'succeeded',
          outputFormat: 'pdf'
        });
      }

      if (method === 'GET' && url.pathname === `/v1/render-jobs/${jobState.jobId}/download`) {
        return jsonResponse(200, {
          jobId: jobState.jobId,
          fileName: 'publication.pdf',
          mimeType: 'application/pdf',
          byteSize: 1024,
          checksumSha256: '4'.repeat(64),
          downloadUrl: 'https://downloads.example.com/publication.pdf'
        });
      }

      return jsonResponse(404, {
        code: 'NOT_FOUND',
        message: 'unknown route'
      });
    };

    let nowMs = 0;

    const client = new HttpPublishEngineClient({
      config: createConfig(),
      fetch,
      now: () => new Date(nowMs),
      sleep: async (delayMs: number) => {
        nowMs += delayMs;
      },
      accessTokenProvider: {
        getAccessToken: async () => 'token_local'
      }
    });

    const accepted = await client.submitRender({
      source: createSource(),
      outputFormat: 'pdf'
    }, {
      idempotencyKey: 'integration-idem-1'
    });

    const completed = await client.waitForJob(accepted.jobId);
    const download = await client.getDownload(completed.jobId);

    expect(accepted.state).toBe('accepted');
    expect(completed.state).toBe('succeeded');
    expect(download.fileName).toBe('publication.pdf');
  });
});
