import { describe, expect, it } from 'vitest';

import { aiKeywordsSchema } from '../../../src/schemas/ai/keywords-schema.js';
import { aiMetadataSchema } from '../../../src/schemas/ai/metadata-schema.js';
import { aiPipelineResultSchema } from '../../../src/schemas/ai/pipeline-schema.js';
import { aiReflectionsSchema } from '../../../src/schemas/ai/reflections-schema.js';
import { aiScriptureSchema } from '../../../src/schemas/ai/scripture-schema.js';
import { aiSummarySchema } from '../../../src/schemas/ai/summary-schema.js';

const validPipelineResult = {
  pipelineVersion: '1.0.0',
  provider: 'mock',
  model: 'test-model',
  generatedAt: '2026-01-01T00:00:00.000Z',
  metadata: {
    title: 'Title',
    description: 'Description',
    language: 'en',
    audience: 'general'
  },
  summary: {
    shortSummary: 'Short summary',
    detailedSummary: 'Detailed summary'
  },
  keywords: {
    keywords: ['faith', 'community']
  },
  scripture: {
    references: [
      {
        book: 'John',
        chapter: 3,
        verseStart: 16,
        verseEnd: 17
      }
    ]
  },
  reflections: {
    reflections: ['Reflection one']
  },
  promptExecutions: [
    {
      stage: 'metadata',
      promptKey: 'metadata',
      promptVersion: '1.0',
      pipelineVersion: '1.0.0',
      provider: 'mock',
      model: 'test-model',
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
  }
};

describe('ai schemas', () => {
  it('accepts valid metadata output', () => {
    expect(aiMetadataSchema.safeParse({
      title: 'Title',
      description: 'Description',
      language: 'en',
      audience: 'general'
    }).success).toBe(true);
  });

  it('rejects unknown metadata keys and whitespace-only strings', () => {
    expect(aiMetadataSchema.safeParse({
      title: '   ',
      description: 'Description',
      language: 'en',
      audience: 'general',
      extra: true
    }).success).toBe(false);
  });

  it('accepts valid summary output', () => {
    expect(aiSummarySchema.safeParse({
      shortSummary: 'Short summary',
      detailedSummary: 'Detailed summary'
    }).success).toBe(true);
  });

  it('rejects unknown summary keys and empty text', () => {
    expect(aiSummarySchema.safeParse({
      shortSummary: '',
      detailedSummary: 'Detailed summary',
      extra: true
    }).success).toBe(false);
  });

  it('accepts valid keyword output and normalizes values', () => {
    const parsed = aiKeywordsSchema.safeParse({
      keywords: [' Faith ', 'Community']
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.keywords).toEqual(['faith', 'community']);
  });

  it('rejects over-limit keyword arrays and nested extras', () => {
    expect(aiKeywordsSchema.safeParse({
      keywords: Array.from({ length: 21 }, () => 'word')
    }).success).toBe(false);
  });

  it('accepts valid scripture output', () => {
    expect(aiScriptureSchema.safeParse({
      references: [
        {
          book: 'John',
          chapter: 3,
          verseStart: 16,
          verseEnd: 17
        }
      ]
    }).success).toBe(true);
  });

  it('rejects malformed scripture objects', () => {
    expect(aiScriptureSchema.safeParse({
      references: [
        {
          book: 'John',
          chapter: -1,
          verseStart: 16,
          verseEnd: 17,
          extra: true
        }
      ],
      extra: true
    }).success).toBe(false);
  });

  it('accepts valid reflections output', () => {
    expect(aiReflectionsSchema.safeParse({
      reflections: ['Reflection one']
    }).success).toBe(true);
  });

  it('rejects malformed reflections output', () => {
    expect(aiReflectionsSchema.safeParse({
      reflections: ['', 'Reflection two'],
      extra: true
    }).success).toBe(false);
  });

  it('accepts a strict pipeline result shape', () => {
    expect(aiPipelineResultSchema.safeParse(validPipelineResult).success).toBe(true);
  });

  it('rejects unexpected pipeline result fields', () => {
    expect(aiPipelineResultSchema.safeParse({
      ...validPipelineResult,
      extra: true
    }).success).toBe(false);
  });

  it('rejects negative usage values and missing numeric bounds', () => {
    expect(aiPipelineResultSchema.safeParse({
      ...validPipelineResult,
      usageTotals: {
        inputTokens: -1,
        outputTokens: 2,
        totalTokens: 1,
        estimatedCostUsd: null,
        latencyMs: 1
      }
    }).success).toBe(false);
  });

  it('rejects usage totals where totalTokens does not equal inputTokens + outputTokens', () => {
    expect(aiPipelineResultSchema.safeParse({
      ...validPipelineResult,
      usageTotals: {
        inputTokens: 2,
        outputTokens: 3,
        totalTokens: 999,
        estimatedCostUsd: null,
        latencyMs: 1
      }
    }).success).toBe(false);
  });

  it('rejects unsafe integer usage token counts', () => {
    expect(aiPipelineResultSchema.safeParse({
      ...validPipelineResult,
      usageTotals: {
        inputTokens: Number.MAX_SAFE_INTEGER + 1,
        outputTokens: 2,
        totalTokens: Number.MAX_SAFE_INTEGER + 3,
        estimatedCostUsd: null,
        latencyMs: 1
      }
    }).success).toBe(false);
  });
});
