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

  it('rejects unknown top-level result fields', () => {
    const result = transcriptProcessingResultSchema.safeParse({
      schemaVersion: '1.0',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      contentHash: 'abc123',
      wordCount: 100,
      characterCount: 500,
      paragraphCount: 5,
      lineCount: 12,
      processedAt: '2026-01-01T00:00:00.000Z',
      unknownField: true
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown nested publication fields', () => {
    const result = transcriptProcessingResultSchema.safeParse({
      schemaVersion: '1.0',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      contentHash: 'abc123',
      wordCount: 100,
      characterCount: 500,
      paragraphCount: 5,
      lineCount: 12,
      processedAt: '2026-01-01T00:00:00.000Z',
      publication: {
        metadata: {
          publicationId: 'pub_1',
          publicationType: 'cta-guide',
          title: 'Title',
          subtitle: 'Subtitle',
          author: 'RoaM Content Engine',
          organization: null,
          generatedAt: '2026-01-01T00:00:00.000Z',
          sourceVersionId: 'srcver_01JXYZ12345678901234567890',
          sourceContentHash: 'hash',
          pipelineVersion: '1.0.0',
          audience: 'general',
          theme: 'classic',
          style: {
            tone: 'pastoral',
            readingLevel: 'introductory',
            voice: 'reflective'
          }
        },
        cover: {
          title: 'Title',
          subtitle: 'Subtitle',
          author: 'RoaM Content Engine',
          organization: null,
          coverImageAssetId: null,
          branding: 'RoaM',
          generatedDate: '2026-01-01T00:00:00.000Z',
          publicationType: 'cta-guide'
        },
        toc: {
          entries: []
        },
        sections: [
          {
            id: 'message-summary',
            title: 'Message Summary',
            slug: 'message-summary',
            order: 1,
            blocks: [
              {
                id: 'summary-h1',
                type: 'heading',
                level: 1,
                text: 'Message Summary'
              }
            ]
          }
        ],
        references: [],
        citations: [],
        footnotes: [],
        assets: [],
        document: {
          schemaVersion: '1.0',
          layoutIntent: 'digital-first',
          language: 'en'
        },
        renderOptions: {
          preferredTargets: ['cta-guide'],
          includeCover: true,
          includeToc: true
        },
        unexpected: true
      }
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown nested AI fields', () => {
    const result = transcriptProcessingResultSchema.safeParse({
      schemaVersion: '1.0',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      contentHash: 'abc123',
      wordCount: 100,
      characterCount: 500,
      paragraphCount: 5,
      lineCount: 12,
      processedAt: '2026-01-01T00:00:00.000Z',
      ai: {
        pipelineVersion: '1.0.0',
        provider: 'mock',
        model: 'default',
        generatedAt: '2026-01-01T00:00:00.000Z',
        metadata: {
          title: 'Title',
          description: 'Description',
          language: 'en',
          audience: 'general'
        },
        summary: {
          shortSummary: 'Summary',
          detailedSummary: 'Detailed'
        },
        keywords: {
          keywords: ['one']
        },
        scripture: {
          references: [{ book: 'John', chapter: 3, verseStart: 16, verseEnd: null }]
        },
        reflections: {
          reflections: ['Question']
        },
        promptExecutions: [
          {
            stage: 'metadata',
            promptKey: 'metadata',
            promptVersion: '1.0',
            pipelineVersion: '1.0.0',
            provider: 'mock',
            model: 'default',
            generatedAt: '2026-01-01T00:00:00.000Z',
            usage: {
              inputTokens: 1,
              outputTokens: 2,
              totalTokens: 3,
              estimatedCostUsd: null,
              latencyMs: 1
            }
          }
        ],
        usageTotals: {
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
          estimatedCostUsd: null,
          latencyMs: 1
        },
        unexpected: true
      }
    });

    expect(result.success).toBe(false);
  });
});
