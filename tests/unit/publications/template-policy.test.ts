import { describe, expect, it } from 'vitest';

import type { AIPipelineResult } from '../../../src/schemas/ai/pipeline-schema.js';
import type { PublicationSection } from '../../../src/domain/publications/types.js';
import {
  buildCtaGuidePublication,
  createTocEntriesForSections,
  deduplicatePublicationReferences,
  deduplicateScriptureReferences
} from '../../../src/application/publications/templates/cta-guide-template.js';

function createAiResult(overrides?: Partial<AIPipelineResult>): AIPipelineResult {
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
    },
    ...overrides
  };
}

function buildPublication(ai: AIPipelineResult) {
  return buildCtaGuidePublication({
    publicationId: 'pub_srcver_1',
    sourceVersionId: 'srcver_1',
    sourceContentHash: 'hash_1',
    generatedAt: '2026-01-01T00:00:00.000Z',
    ai,
    audience: 'church',
    theme: 'ministry'
  });
}

describe('CTA template policy', () => {
  it('omits key themes when keywords are empty', () => {
    const publication = buildPublication(createAiResult({ keywords: { keywords: [] } }));
    expect(publication.sections.some((section) => section.id === 'key-themes')).toBe(false);
  });

  it('omits scripture references section when scripture input is empty', () => {
    const publication = buildPublication(createAiResult({ scripture: { references: [] } }));
    expect(publication.sections.some((section) => section.id === 'scripture-references')).toBe(false);
    expect(publication.sections.some((section) => section.id === 'references')).toBe(false);
  });

  it('omits reflection and journal sections when reflections are empty', () => {
    const publication = buildPublication(createAiResult({ reflections: { reflections: [] } }));
    expect(publication.sections.some((section) => section.id === 'reflection-questions')).toBe(false);
    expect(publication.sections.some((section) => section.id === 'journal-prompts')).toBe(false);
  });

  it('keeps required structural sections when optional arrays are empty', () => {
    const publication = buildPublication(createAiResult({
      keywords: { keywords: [] },
      scripture: { references: [] },
      reflections: { reflections: [] }
    }));

    expect(publication.sections.map((section) => section.id)).toEqual([
      'cover',
      'table-of-contents',
      'message-summary'
    ]);
  });

  it('includes only sections with meaningful content under mixed optional input', () => {
    const publication = buildPublication(createAiResult({
      keywords: { keywords: ['  service  ', 'SERVICE'] },
      scripture: { references: [] },
      reflections: { reflections: ['Question 1'] }
    }));

    expect(publication.sections.map((section) => section.id)).toEqual([
      'cover',
      'table-of-contents',
      'message-summary',
      'key-themes',
      'reflection-questions'
    ]);
  });

  it('keeps TOC aligned with actual section inclusion policy', () => {
    const publication = buildPublication(createAiResult({
      keywords: { keywords: [] },
      scripture: { references: [] },
      reflections: { reflections: ['Question 1'] }
    }));

    expect(publication.toc.entries.every((entry) => entry.targetId !== 'cover')).toBe(true);
    expect(publication.toc.entries.every((entry) => entry.targetId !== 'table-of-contents')).toBe(true);

    const sectionTargetIds = new Set(publication.sections.map((section) => section.id));
    for (const entry of publication.toc.entries.filter((entry) => entry.level === 1)) {
      expect(sectionTargetIds.has(entry.targetId)).toBe(true);
    }
  });

  it('never emits empty list blocks', () => {
    const publication = buildPublication(createAiResult({
      keywords: { keywords: [] },
      scripture: { references: [] },
      reflections: { reflections: [] }
    }));

    for (const section of publication.sections) {
      for (const block of section.blocks) {
        if (block.type === 'checklist' || block.type === 'bullet-list' || block.type === 'numbered-list') {
          expect(block.items.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('does not invent CTA, prayer, journal, or next-step prose', () => {
    const publication = buildPublication(createAiResult());
    const ids = publication.sections.map((section) => section.id);

    expect(ids).not.toContain('call-to-action');
    expect(ids).not.toContain('prayer');
    expect(ids).not.toContain('journal-prompts');
    expect(ids).not.toContain('next-steps');
  });

  it('scripture deduplication handles exact and case/whitespace equivalents', () => {
    const scripture = deduplicateScriptureReferences([
      { book: 'James', chapter: 1, verseStart: 5, verseEnd: 6 },
      { book: '  james  ', chapter: 1, verseStart: 5, verseEnd: 6 },
      { book: 'James', chapter: 1, verseStart: 7, verseEnd: null }
    ]);

    expect(scripture).toHaveLength(2);
    expect(scripture[0].verseStart).toBe(5);
    expect(scripture[1].verseStart).toBe(7);
  });

  it('deduplicates external and internal references deterministically', () => {
    const references = deduplicatePublicationReferences([
      {
        id: 'ref-1',
        referenceType: 'external',
        label: 'Site',
        detail: 'External',
        url: 'https://example.com',
        targetId: null
      },
      {
        id: 'ref-2',
        referenceType: 'external',
        label: 'Site',
        detail: 'External',
        url: 'https://example.com',
        targetId: null
      },
      {
        id: 'ref-3',
        referenceType: 'internal',
        label: 'Summary',
        detail: 'Internal',
        url: null,
        targetId: 'message-summary'
      },
      {
        id: 'ref-4',
        referenceType: 'internal',
        label: 'Summary duplicate',
        detail: 'Internal',
        url: null,
        targetId: 'message-summary'
      }
    ]);

    expect(references.map((reference) => reference.id)).toEqual(['ref-1', 'ref-3']);
  });

  it('does not mutate AI input during deduplication and generation', () => {
    const ai = createAiResult({
      scripture: {
        references: [
          { book: 'James', chapter: 1, verseStart: 5, verseEnd: 6 },
          { book: 'James', chapter: 1, verseStart: 5, verseEnd: 6 }
        ]
      }
    });

    const before = JSON.parse(JSON.stringify(ai));
    buildPublication(ai);
    expect(ai).toEqual(before);
  });
});

describe('TOC policy', () => {
  it('excludes cover and TOC sections', () => {
    const sections: PublicationSection[] = [
      {
        id: 'cover',
        title: 'Cover',
        slug: 'cover',
        order: 1,
        blocks: [{ id: 'cover-h1', type: 'heading', level: 1, text: 'Cover' }]
      },
      {
        id: 'table-of-contents',
        title: 'Table of Contents',
        slug: 'table-of-contents',
        order: 2,
        blocks: [{ id: 'toc-h1', type: 'heading', level: 1, text: 'TOC' }]
      },
      {
        id: 'section-a',
        title: 'Section',
        slug: 'section',
        order: 3,
        blocks: [
          { id: 'section-a-h1', type: 'heading', level: 1, text: 'Section' },
          { id: 'section-a-h2', type: 'heading', level: 2, text: 'Nested' }
        ]
      }
    ];

    const entries = createTocEntriesForSections(sections);
    expect(entries.some((entry) => entry.targetId === 'cover')).toBe(false);
    expect(entries.some((entry) => entry.targetId === 'table-of-contents')).toBe(false);
    expect(entries.every((entry) => entry.pageNumber === null)).toBe(true);
  });

  it('handles duplicate titles via stable target IDs', () => {
    const sections: PublicationSection[] = [
      {
        id: 'section-a',
        title: 'Repeated',
        slug: 'repeated-a',
        order: 1,
        blocks: [{ id: 'section-a-h1', type: 'heading', level: 1, text: 'Repeated' }]
      },
      {
        id: 'section-b',
        title: 'Repeated',
        slug: 'repeated-b',
        order: 2,
        blocks: [{ id: 'section-b-h1', type: 'heading', level: 1, text: 'Repeated' }]
      }
    ];

    const entries = createTocEntriesForSections(sections);
    expect(entries.filter((entry) => entry.title === 'Repeated')).toHaveLength(2);
    expect(entries[0].targetId).not.toBe(entries[1].targetId);
  });

  it('normalizes invalid heading-level jumps deterministically', () => {
    const sections: PublicationSection[] = [
      {
        id: 'section-a',
        title: 'Section A',
        slug: 'section-a',
        order: 1,
        blocks: [
          { id: 'a-h1', type: 'heading', level: 1, text: 'Section A' },
          { id: 'a-h3', type: 'heading', level: 3, text: 'Jumped' }
        ]
      }
    ];

    const entries = createTocEntriesForSections(sections);
    const nested = entries.find((entry) => entry.targetId === 'a-h3');
    expect(nested?.level).toBe(2);
    expect(nested?.parentId).toBe('toc-section-a');

    const secondRun = createTocEntriesForSections(sections);
    expect(secondRun).toEqual(entries);
  });
}
);
