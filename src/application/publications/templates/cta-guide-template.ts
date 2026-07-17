import type { AIPipelineResult } from '../../../schemas/ai/pipeline-schema.js';
import type {
  Publication,
  PublicationAudience,
  PublicationBlock,
  PublicationReference,
  PublicationSection,
  PublicationTheme
} from '../../../domain/publications/types.js';

type BuildCTAGuideInput = {
  readonly publicationId: string;
  readonly sourceVersionId: string;
  readonly sourceContentHash: string;
  readonly generatedAt: string;
  readonly ai: AIPipelineResult;
  readonly audience: PublicationAudience;
  readonly theme: PublicationTheme;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeScriptureKey(reference: AIPipelineResult['scripture']['references'][number]): string {
  return [
    normalizeWhitespace(reference.book).toLowerCase(),
    String(reference.chapter),
    String(reference.verseStart),
    reference.verseEnd === null ? '' : String(reference.verseEnd)
  ].join('|');
}

export function deduplicateScriptureReferences(
  references: readonly AIPipelineResult['scripture']['references'][number][]
): AIPipelineResult['scripture']['references'] {
  const seen = new Set<string>();
  const deduplicated: AIPipelineResult['scripture']['references'] = [];

  for (const reference of references) {
    const key = normalizeScriptureKey(reference);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduplicated.push(reference);
  }

  return deduplicated;
}

function normalizeReferenceKey(reference: PublicationReference): string {
  if (reference.referenceType === 'internal') {
    return `internal|${reference.targetId ?? ''}`;
  }

  if (reference.referenceType === 'external') {
    return `external|${normalizeWhitespace(reference.url ?? reference.label).toLowerCase()}`;
  }

  return `bible|${normalizeWhitespace(reference.label).toLowerCase()}`;
}

export function deduplicatePublicationReferences(references: readonly PublicationReference[]): PublicationReference[] {
  const seen = new Set<string>();
  const deduplicated: PublicationReference[] = [];

  for (const reference of references) {
    const key = normalizeReferenceKey(reference);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduplicated.push(reference);
  }

  return deduplicated;
}

function createTextBlock(
  id: string,
  type: 'paragraph' | 'reflection' | 'prayer' | 'journal-prompt' | 'key-takeaway' | 'warning' | 'highlight' | 'quote',
  text: string,
  attribution: string | null = null
): PublicationBlock {
  return {
    id,
    type,
    text,
    attribution
  };
}

function createHeading(id: string, text: string, level: 1 | 2 | 3): PublicationBlock {
  return {
    id,
    type: 'heading',
    level,
    text
  };
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    const key = normalized.toLowerCase();

    if (normalized.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function createSections(ai: AIPipelineResult, references: readonly PublicationReference[]): PublicationSection[] {
  const scriptureLines = references.map((reference) => reference.label);
  const keywords = uniqueNonEmpty(ai.keywords.keywords);
  const reflections = uniqueNonEmpty(ai.reflections.reflections);

  const sections: PublicationSection[] = [
    {
      id: 'cover',
      title: 'Cover',
      slug: 'cover',
      order: 1,
      blocks: [
        createHeading('cover-h1', ai.metadata.title, 1),
        createTextBlock('cover-subtitle', 'paragraph', ai.summary.shortSummary)
      ]
    },
    {
      id: 'table-of-contents',
      title: 'Table of Contents',
      slug: 'table-of-contents',
      order: 2,
      blocks: [
        createHeading('toc-h1', 'Table of Contents', 1),
        createTextBlock('toc-note', 'paragraph', 'Entries are generated from section and heading hierarchy.')
      ]
    },
    {
      id: 'message-summary',
      title: 'Message Summary',
      slug: 'message-summary',
      order: 3,
      blocks: [
        createHeading('summary-h1', 'Message Summary', 1),
        createHeading('summary-h2-detail', 'Detailed Summary', 2),
        createTextBlock('summary-short', 'key-takeaway', ai.summary.shortSummary),
        createTextBlock('summary-detailed', 'paragraph', ai.summary.detailedSummary)
      ]
    }
  ];

  if (keywords.length > 0) {
    sections.push({
      id: 'key-themes',
      title: 'Key Themes',
      slug: 'key-themes',
      order: 0,
      blocks: [
        createHeading('themes-h1', 'Key Themes', 1),
        createHeading('themes-h2-list', 'Theme Highlights', 2),
        {
          id: 'themes-list',
          type: 'bullet-list',
          items: keywords
        }
      ]
    });
  }

  if (scriptureLines.length > 0) {
    sections.push({
      id: 'scripture-references',
      title: 'Scripture References',
      slug: 'scripture-references',
      order: 0,
      blocks: [
        createHeading('scripture-h1', 'Scripture References', 1),
        createHeading('scripture-h2-passages', 'Referenced Passages', 2),
        {
          id: 'scripture-block',
          type: 'scripture',
          references: scriptureLines,
          text: scriptureLines.join('; ')
        }
      ]
    });
  }

  if (reflections.length > 0) {
    sections.push({
      id: 'reflection-questions',
      title: 'Reflection Questions',
      slug: 'reflection-questions',
      order: 0,
      blocks: [
        createHeading('reflection-h1', 'Reflection Questions', 1),
        createHeading('reflection-h2-questions', 'Questions', 2),
        {
          id: 'reflection-list',
          type: 'numbered-list',
          items: reflections
        }
      ]
    });
  }

  if (references.length > 0) {
    sections.push({
      id: 'references',
      title: 'References',
      slug: 'references',
      order: 0,
      blocks: [
        createHeading('references-h1', 'References', 1),
        {
          id: 'references-table',
          type: 'table',
          table: {
            headers: ['Type', 'Reference'],
            rows: references.map((reference) => [reference.referenceType, reference.label])
          }
        }
      ]
    });
  }

  return sections.map((section, index) => ({
    ...section,
    order: index + 1
  }));
}

function createReferences(ai: AIPipelineResult): PublicationReference[] {
  const deduplicatedScripture = deduplicateScriptureReferences(ai.scripture.references);

  const bibleReferences = deduplicatedScripture.map((reference, index) => {
    const label = reference.verseEnd === null
      ? `${normalizeWhitespace(reference.book)} ${reference.chapter}:${reference.verseStart}`
      : `${normalizeWhitespace(reference.book)} ${reference.chapter}:${reference.verseStart}-${reference.verseEnd}`;

    return {
      id: `ref-scripture-${index + 1}`,
      referenceType: 'bible' as const,
      label,
      detail: `Scripture reference extracted from transcript context (${ai.pipelineVersion}).`,
      url: null,
      targetId: null
    };
  });

  const deduplicated = deduplicatePublicationReferences(bibleReferences);

  return deduplicated.map((reference, index) => ({
    ...reference,
    id: `ref-scripture-${index + 1}`
  }));
}

function normalizeHeadingLevel(previousLevel: 1 | 2 | 3, requested: 1 | 2 | 3): 2 | 3 {
  if (requested <= 1) {
    return 2;
  }

  const nextMax = Math.min(3, previousLevel + 1);

  if (requested > nextMax) {
    return nextMax as 2 | 3;
  }

  return requested as 2 | 3;
}

export function createTocEntriesForSections(sections: readonly PublicationSection[]): Publication['toc']['entries'] {
  const entries: Array<Publication['toc']['entries'][number]> = [];

  for (const section of sections) {
    if (section.id === 'cover' || section.id === 'table-of-contents') {
      continue;
    }

    const sectionEntryId = `toc-${section.id}`;

    entries.push({
      id: sectionEntryId,
      targetId: section.id,
      title: section.title,
      level: 1,
      anchor: section.slug,
      parentId: null,
      pageNumber: null
    });

    let previousLevel: 1 | 2 | 3 = 1;
    let parentLevel2Id: string | null = null;

    for (const block of section.blocks) {
      if (block.type === 'heading' && block.level > 1) {
        const normalizedLevel = normalizeHeadingLevel(previousLevel, block.level);
        const entryId = `toc-${block.id}`;

        const parentId = normalizedLevel === 2
          ? sectionEntryId
          : (parentLevel2Id ?? sectionEntryId);

        entries.push({
          id: entryId,
          targetId: block.id,
          title: block.text,
          level: normalizedLevel,
          anchor: `${section.slug}-${slugify(block.id)}`,
          parentId,
          pageNumber: null
        });

        if (normalizedLevel === 2) {
          parentLevel2Id = entryId;
        }

        previousLevel = normalizedLevel;
      }
    }
  }

  return entries;
}

export function buildCtaGuidePublication(input: BuildCTAGuideInput): Publication {
  const references = createReferences(input.ai);
  const sections = createSections(input.ai, references);

  return {
    metadata: {
      publicationId: input.publicationId,
      publicationType: 'cta-guide',
      title: input.ai.metadata.title,
      subtitle: input.ai.summary.shortSummary,
      author: 'RoaM Content Engine',
      organization: null,
      generatedAt: input.generatedAt,
      sourceVersionId: input.sourceVersionId,
      sourceContentHash: input.sourceContentHash,
      pipelineVersion: input.ai.pipelineVersion,
      audience: input.audience,
      theme: input.theme,
      style: {
        tone: 'pastoral guidance',
        readingLevel: 'introductory',
        voice: 'reflective'
      }
    },
    cover: {
      title: input.ai.metadata.title,
      subtitle: input.ai.summary.shortSummary,
      author: 'RoaM Content Engine',
      organization: null,
      coverImageAssetId: null,
      branding: 'RoaM',
      generatedDate: input.generatedAt,
      publicationType: 'cta-guide'
    },
    toc: {
      entries: createTocEntriesForSections(sections)
    },
    sections,
    references,
    citations: references.map((reference, index) => ({
      id: `citation-${index + 1}`,
      label: `Citation ${index + 1}`,
      text: reference.label,
      referenceId: reference.id
    })),
    footnotes: [],
    assets: [
      {
        id: 'cover-image-placeholder',
        type: 'image',
        uri: 'asset://cover-image-placeholder',
        altText: 'Cover image placeholder',
        mimeType: null
      }
    ],
    document: {
      schemaVersion: '1.0',
      layoutIntent: 'digital-first',
      language: input.ai.metadata.language
    },
    renderOptions: {
      preferredTargets: ['cta-guide'],
      includeCover: true,
      includeToc: true
    }
  };
}
