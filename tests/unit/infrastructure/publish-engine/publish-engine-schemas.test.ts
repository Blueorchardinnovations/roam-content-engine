import { describe, expect, it } from 'vitest';

import {
  publishEngineDownloadSchema,
  publishEngineIdempotencyKeySchema,
  publishEngineJobIdSchema,
  submitRenderRequestSchema
} from '../../../../src/infrastructure/publish-engine/publish-engine-schemas.js';

describe('publish-engine schemas', () => {
  it('accepts a valid submit render request', () => {
    const parsed = submitRenderRequestSchema.safeParse({
      source: {
        payloadRepresentation: 'styled-html',
        mimeType: 'text/html; charset=utf-8',
        fileExtension: '.html',
        payload: '<!doctype html><html><body>ok</body></html>',
        byteSize: 40,
        checksumSha256: '9a22f63f9d12f84f2f8f22b8b5229b31fb4bb8d57f7de8850f2324d5fdde6f95'
      },
      outputFormat: 'pdf',
      publication: {
        publicationId: 'pub_001',
        title: 'Quarterly Report',
        language: 'en-US',
        theme: 'classic'
      },
      renderOptions: {
        densityId: 'standard',
        layoutId: 'single-column',
        includeToc: true
      }
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects unexpected keys on strict request schema', () => {
    const parsed = submitRenderRequestSchema.safeParse({
      source: {
        payloadRepresentation: 'styled-html',
        mimeType: 'text/html; charset=utf-8',
        fileExtension: '.html',
        payload: '<!doctype html><html></html>',
        byteSize: 29,
        checksumSha256: '1111111111111111111111111111111111111111111111111111111111111111'
      },
      outputFormat: 'html',
      publication: {
        publicationId: 'pub_001'
      },
      attack: true
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects CRLF injection in idempotency key', () => {
    const parsed = publishEngineIdempotencyKeySchema.safeParse('good\r\nbad');
    expect(parsed.success).toBe(false);
  });

  it('validates download url protocol rules', () => {
    const invalid = publishEngineDownloadSchema.safeParse({
      jobId: 'job_abc',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      downloadUrl: 'http://example.com/report.pdf'
    });

    const validLocal = publishEngineDownloadSchema.safeParse({
      jobId: 'job_abc',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      downloadUrl: 'http://localhost:8080/report.pdf'
    });

    expect(invalid.success).toBe(false);
    expect(validLocal.success).toBe(true);
  });

  it('validates job identifier format', () => {
    expect(publishEngineJobIdSchema.safeParse('job_01-abc').success).toBe(true);
    expect(publishEngineJobIdSchema.safeParse('-bad').success).toBe(false);
    expect(publishEngineJobIdSchema.safeParse('bad/slash').success).toBe(false);
  });
});
