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
  
  it('accepts render artifact output when valid', () => {
    const result = transcriptProcessingResultSchema.safeParse({
      schemaVersion: '1.0',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      contentHash: 'abc123',
      wordCount: 100,
      characterCount: 500,
      paragraphCount: 5,
      lineCount: 12,
      processedAt: '2026-01-01T00:00:00.000Z',
      renderArtifact: {
        metadata: {
          artifactId: 'artifact_1',
          status: 'ready',
          format: 'html',
          payloadRepresentation: 'structured-json',
          mimeType: 'application/json',
          fileExtension: '.json',
          checksumSha256: 'd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2',
          byteSize: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          warnings: [],
          errors: []
        },
        content: {
          kind: 'inline',
          encoding: 'utf-8',
          bytesBase64: 'e30=',
          serializedDocument: '{}'
        },
        storage: {
          kind: 'none'
        }
      }
    });
  
    expect(result.success).toBe(true);
  });

  it('accepts html-markup render artifact output when valid', () => {
    const result = transcriptProcessingResultSchema.safeParse({
      schemaVersion: '1.0',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      contentHash: 'abc123',
      wordCount: 100,
      characterCount: 500,
      paragraphCount: 5,
      lineCount: 12,
      processedAt: '2026-01-01T00:00:00.000Z',
      renderArtifact: {
        metadata: {
          artifactId: 'artifact_2',
          status: 'ready',
          format: 'html',
          payloadRepresentation: 'html-markup',
          mimeType: 'text/html; charset=utf-8',
          fileExtension: '.html',
          checksumSha256: 'd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2',
          byteSize: 20,
          createdAt: '2026-01-01T00:00:00.000Z',
          warnings: [],
          errors: []
        },
        content: {
          kind: 'inline',
          encoding: 'utf-8',
          bytesBase64: 'PCFkb2N0eXBlIGh0bWw+',
          serializedDocument: '<!doctype html>'
        },
        storage: {
          kind: 'none'
        }
      }
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
           payloadRepresentation: 'structured-json',
           mimeType: 'application/json',
           fileExtension: '.json',
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

  it('accepts html document output when valid', () => {
    const result = transcriptProcessingResultSchema.safeParse({
      schemaVersion: '1.0',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      contentHash: 'abc123',
      wordCount: 100,
      characterCount: 500,
      paragraphCount: 5,
      lineCount: 12,
      processedAt: '2026-01-01T00:00:00.000Z',
      htmlDocument: {
        schemaVersion: '1.0',
        metadata: {
          publicationId: 'pub_01',
          publicationType: 'cta-guide',
          title: 'Title',
          description: null,
          language: 'en',
          generatedAt: '2026-01-01T00:00:00.000Z',
          sourceVersionId: 'srcver_01JXYZ12345678901234567890',
          sourceContentHash: 'hash',
          audience: 'general',
          theme: 'classic',
          styleTokens: [{ category: 'page-intent', value: 'reading' }],
          assetReferences: []
        },
        theme: 'classic',
        head: {
          title: 'Title',
          lang: 'en',
          metadata: [{ name: 'description', content: 'Title' }],
          styleTokens: [{ category: 'page-intent', value: 'reading' }]
        },
        body: {
          skipNavigationTargetId: 'main-content',
          sections: [
            {
              id: 'document-root',
              title: 'Document',
              role: 'content',
              styleTokens: [{ category: 'section-intent', value: 'content' }],
              elements: [
                {
                  nodeType: 'element',
                  elementType: 'generic',
                  id: 'main-content',
                  tag: 'main',
                  attributes: {},
                  classList: [],
                  ariaLabel: null,
                  role: null,
                  styleTokens: [],
                  children: [
                    {
                      nodeType: 'element',
                      elementType: 'heading',
                      id: 'cover-title',
                      tag: 'h1',
                      level: 1,
                      attributes: {},
                      classList: [],
                      ariaLabel: null,
                      role: null,
                      styleTokens: [{ category: 'heading-intent', value: 'document-title' }],
                      children: [{ nodeType: 'text', text: 'Title' }]
                    }
                  ]
                }
              ]
            }
          ],
          landmarks: [
            { role: 'banner', sectionId: 'document-root', label: 'Header' },
            { role: 'navigation', sectionId: 'document-root', label: 'TOC' },
            { role: 'main', sectionId: 'document-root', label: null }
          ]
        }
      }
    });

    expect(result.success).toBe(true);
  });

  it('rejects html document with unknown nested fields', () => {
    const result = transcriptProcessingResultSchema.safeParse({
      schemaVersion: '1.0',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      contentHash: 'abc123',
      wordCount: 100,
      characterCount: 500,
      paragraphCount: 5,
      lineCount: 12,
      processedAt: '2026-01-01T00:00:00.000Z',
      htmlDocument: {
        schemaVersion: '1.0',
        metadata: {
          publicationId: 'pub_01',
          publicationType: 'cta-guide',
          title: 'Title',
          description: null,
          language: 'en',
          generatedAt: '2026-01-01T00:00:00.000Z',
          sourceVersionId: 'srcver_01JXYZ12345678901234567890',
          sourceContentHash: 'hash',
          audience: 'general',
          theme: 'classic',
          styleTokens: [{ category: 'page-intent', value: 'reading' }],
          assetReferences: []
        },
        theme: 'classic',
        head: {
          title: 'Title',
          lang: 'en',
          metadata: [{ name: 'description', content: 'Title' }],
          styleTokens: [{ category: 'page-intent', value: 'reading' }]
        },
        body: {
          skipNavigationTargetId: 'main-content',
          sections: [
            {
              id: 'document-root',
              title: 'Document',
              role: 'content',
              styleTokens: [{ category: 'section-intent', value: 'content' }],
              elements: [
                {
                  nodeType: 'element',
                  elementType: 'generic',
                  id: 'main-content',
                  tag: 'main',
                  attributes: {},
                  classList: [],
                  ariaLabel: null,
                  role: null,
                  styleTokens: [],
                  children: [
                    {
                      nodeType: 'element',
                      elementType: 'heading',
                      id: 'cover-title',
                      tag: 'h1',
                      level: 1,
                      attributes: {},
                      classList: [],
                      ariaLabel: null,
                      role: null,
                      styleTokens: [{ category: 'heading-intent', value: 'document-title' }],
                      children: [{ nodeType: 'text', text: 'Title' }]
                    }
                  ],
                  unexpected: true
                }
              ]
            }
          ],
          landmarks: [
            { role: 'banner', sectionId: 'document-root', label: 'Header' },
            { role: 'navigation', sectionId: 'document-root', label: 'TOC' },
            { role: 'main', sectionId: 'document-root', label: null }
          ]
        }
      }
    });

    expect(result.success).toBe(false);
  });
});
