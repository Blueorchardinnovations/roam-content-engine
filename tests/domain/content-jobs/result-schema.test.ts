import { describe, expect, it } from 'vitest';

import { transcriptProcessingResultSchema } from '../../../src/domain/content-jobs/types.js';

describe('transcript processing result schema', () => {
  it('accepts a valid result payload', () => {
    const result = transcriptProcessingResultSchema.safeParse({
      schemaVersion: '1.0',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      contentHash: 'abc123',
      wordCount: 100,
      characterCount: 500,
      paragraphCount: 5,
      lineCount: 12,
      processedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid schemaVersion', () => {
    const result = transcriptProcessingResultSchema.safeParse({
      schemaVersion: '2.0',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      contentHash: 'abc123',
      wordCount: 100,
      characterCount: 500,
      paragraphCount: 5,
      lineCount: 12,
      processedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(result.success).toBe(false);
  });

  it('rejects negative counts', () => {
    const result = transcriptProcessingResultSchema.safeParse({
      schemaVersion: '1.0',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      contentHash: 'abc123',
      wordCount: -1,
      characterCount: 500,
      paragraphCount: 5,
      lineCount: 12,
      processedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid sourceVersionId prefix', () => {
    const result = transcriptProcessingResultSchema.safeParse({
      schemaVersion: '1.0',
      sourceVersionId: 'job_01JXYZ12345678901234567890',
      contentHash: 'abc123',
      wordCount: 100,
      characterCount: 500,
      paragraphCount: 5,
      lineCount: 12,
      processedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid processedAt timestamp', () => {
    const result = transcriptProcessingResultSchema.safeParse({
      schemaVersion: '1.0',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      contentHash: 'abc123',
      wordCount: 100,
      characterCount: 500,
      paragraphCount: 5,
      lineCount: 12,
      processedAt: 'invalid-date'
    });

    expect(result.success).toBe(false);
  });
});
