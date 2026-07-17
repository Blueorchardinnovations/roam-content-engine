import { describe, expect, it } from 'vitest';

import { publicationSchema } from '../../../src/schemas/publications/publication-schema.js';
import { PublicationBuilder } from '../../../src/application/publications/publication-builder.js';
import {
  PublicationValidationError,
  UnsupportedPublicationTypeError
} from '../../../src/application/publications/publication-errors.js';
import type { AIPipelineResult } from '../../../src/schemas/ai/pipeline-schema.js';

function createAiResult(): AIPipelineResult {
  return {
    pipelineVersion: '1.0.0',
    provider: 'mock',
    model: 'default',
    generatedAt: '2026-01-01T00:00:00.000Z',
    metadata: {
      title: 'Faithful Leadership',
      description: 'How to lead with clarity and service.',
      language: 'en',
      audience: 'church leaders'
    },
    summary: {
      shortSummary: 'Lead with humility and conviction.',
      detailedSummary: 'This message calls leaders to guide with humility, integrity, and practical action.'
    },
    keywords: {
      keywords: ['leadership', 'humility', 'integrity']
    },
    scripture: {
      references: [
        {
          book: 'James',
          chapter: 1,
          verseStart: 5,
          verseEnd: 6
        }
      ]
    },
    reflections: {
      reflections: [
        'Where do I need wisdom today?',
        'How can I serve my team better?'
      ]
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
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
          estimatedCostUsd: null,
          latencyMs: 5
        }
      }
    ],
    usageTotals: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      estimatedCostUsd: null,
      latencyMs: 5
    }
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('publication builder', () => {
  it('resolves CTA Guide template explicitly', () => {
    const builder = new PublicationBuilder(() => new Date('2026-01-01T00:00:00.000Z'));

    const publication = builder.build({
      sourceVersionId: 'srcver_01TEST',
      sourceContentHash: 'hash_01',
      aiResult: createAiResult(),
      publicationType: 'cta-guide'
    });

    expect(publication.metadata.publicationType).toBe('cta-guide');
    expect(publication.metadata.theme).toBe('ministry');
    expect(publication.metadata.audience).toBe('leadership');
    expect(publicationSchema.safeParse(publication).success).toBe(true);
  });

  it('rejects unsupported publication type without fallback', () => {
    const builder = new PublicationBuilder(() => new Date('2026-01-01T00:00:00.000Z'));

    expect(() =>
      builder.build({
        sourceVersionId: 'srcver_01TEST',
        sourceContentHash: 'hash_01',
        aiResult: createAiResult(),
        publicationType: 'unknown-type'
      })
    ).toThrow(UnsupportedPublicationTypeError);
  });

  it('is deterministic for identical input and fixed clock', () => {
    const builder = new PublicationBuilder(() => new Date('2026-01-01T00:00:00.000Z'));
    const input = {
      sourceVersionId: 'srcver_01TEST',
      sourceContentHash: 'hash_01',
      aiResult: createAiResult(),
      publicationType: 'cta-guide'
    };

    const first = builder.build(input);
    const second = builder.build(input);

    expect(first).toEqual(second);
  });

  it('does not mutate builder input', () => {
    const builder = new PublicationBuilder(() => new Date('2026-01-01T00:00:00.000Z'));
    const input = {
      sourceVersionId: 'srcver_01TEST',
      sourceContentHash: 'hash_01',
      aiResult: createAiResult(),
      publicationType: 'cta-guide'
    };

    const before = clone(input);
    builder.build(input);

    expect(input).toEqual(before);
  });

  it('rejects malformed AI input', () => {
    const builder = new PublicationBuilder(() => new Date('2026-01-01T00:00:00.000Z'));

    expect(() =>
      builder.build({
        sourceVersionId: 'srcver_01TEST',
        sourceContentHash: 'hash_01',
        aiResult: {
          provider: 'mock'
        },
        publicationType: 'cta-guide'
      })
    ).toThrow(PublicationValidationError);
  });

  it('supports cancellation signal', () => {
    const builder = new PublicationBuilder(() => new Date('2026-01-01T00:00:00.000Z'));
    const controller = new AbortController();
    controller.abort();

    expect(() =>
      builder.build(
        {
          sourceVersionId: 'srcver_01TEST',
          sourceContentHash: 'hash_01',
          aiResult: createAiResult(),
          publicationType: 'cta-guide'
        },
        controller.signal
      )
    ).toThrow('Publication generation was cancelled.');
  });
});
