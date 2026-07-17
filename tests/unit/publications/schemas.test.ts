import { describe, expect, it } from 'vitest';

import { publicationSchema } from '../../../src/schemas/publications/publication-schema.js';

type Publication = ReturnType<typeof createValidPublication>;

function createValidPublication(): {
  metadata: {
    publicationId: string;
    publicationType: 'cta-guide';
    title: string;
    subtitle: string;
    author: string;
    organization: null;
    generatedAt: string;
    sourceVersionId: string;
    sourceContentHash: string;
    pipelineVersion: string;
    audience: 'general';
    theme: 'classic';
    style: {
      tone: string;
      readingLevel: 'introductory';
      voice: 'reflective';
    };
  };
  cover: {
    title: string;
    subtitle: string;
    author: string;
    organization: null;
    coverImageAssetId: string;
    branding: string;
    generatedDate: string;
    publicationType: 'cta-guide';
  };
  toc: {
    entries: Array<{
      id: string;
      targetId: string;
      title: string;
      level: 1 | 2 | 3;
      anchor: string;
      parentId: string | null;
      pageNumber: null;
    }>;
  };
  sections: Array<{
    id: string;
    title: string;
    slug: string;
    order: number;
    blocks: Array<any>;
  }>;
  references: Array<{
    id: string;
    referenceType: 'bible' | 'internal' | 'external';
    label: string;
    detail: string;
    url: string | null;
    targetId: string | null;
  }>;
  citations: Array<{
    id: string;
    label: string;
    text: string;
    referenceId: string | null;
  }>;
  footnotes: Array<{
    id: string;
    marker: string;
    text: string;
  }>;
  assets: Array<{
    id: string;
    type: 'image';
    uri: string;
    altText: string;
    mimeType: null;
  }>;
  document: {
    schemaVersion: '1.0';
    layoutIntent: 'digital-first';
    language: string;
  };
  renderOptions: {
    preferredTargets: ['cta-guide'];
    includeCover: true;
    includeToc: true;
  };
} {
  const publication = {
    metadata: {
      publicationId: 'pub_01',
      publicationType: 'cta-guide' as const,
      title: 'Title',
      subtitle: 'Subtitle',
      author: 'RoaM Content Engine',
      organization: null,
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceVersionId: 'srcver_01',
      sourceContentHash: 'hash_01',
      pipelineVersion: '1.0.0',
      audience: 'general' as const,
      theme: 'classic' as const,
      style: {
        tone: 'pastoral',
        readingLevel: 'introductory' as const,
        voice: 'reflective' as const
      }
    },
    cover: {
      title: 'Title',
      subtitle: 'Subtitle',
      author: 'RoaM Content Engine',
      organization: null,
      coverImageAssetId: 'asset-cover',
      branding: 'RoaM',
      generatedDate: '2026-01-01T00:00:00.000Z',
      publicationType: 'cta-guide' as const
    },
    toc: {
      entries: [
        {
          id: 'toc-message-summary',
          targetId: 'message-summary',
          title: 'Message Summary',
          level: 1 as const,
          anchor: 'message-summary',
          parentId: null,
          pageNumber: null
        },
        {
          id: 'toc-summary-h2-detail',
          targetId: 'summary-h2-detail',
          title: 'Detailed Summary',
          level: 2 as const,
          anchor: 'message-summary-summary-h2-detail',
          parentId: 'toc-message-summary',
          pageNumber: null
        },
        {
          id: 'toc-reflection-questions',
          targetId: 'reflection-questions',
          title: 'Reflection Questions',
          level: 1 as const,
          anchor: 'reflection-questions',
          parentId: null,
          pageNumber: null
        }
      ]
    },
    sections: [
      {
        id: 'cover',
        title: 'Cover',
        slug: 'cover',
        order: 1,
        blocks: [
          {
            id: 'cover-h1',
            type: 'heading',
            level: 1,
            text: 'Title'
          }
        ]
      },
      {
        id: 'table-of-contents',
        title: 'Table of Contents',
        slug: 'table-of-contents',
        order: 2,
        blocks: [
          {
            id: 'toc-h1',
            type: 'heading',
            level: 1,
            text: 'Table of Contents'
          }
        ]
      },
      {
        id: 'message-summary',
        title: 'Message Summary',
        slug: 'message-summary',
        order: 3,
        blocks: [
          {
            id: 'summary-h1',
            type: 'heading',
            level: 1,
            text: 'Message Summary'
          },
          {
            id: 'summary-h2-detail',
            type: 'heading',
            level: 2,
            text: 'Detailed Summary',
            citationIds: ['citation-1'],
            footnoteIds: ['footnote-1']
          },
          {
            id: 'summary-body',
            type: 'paragraph',
            text: 'Body text',
            attribution: null,
            citationIds: ['citation-1'],
            footnoteIds: ['footnote-1']
          }
        ]
      },
      {
        id: 'reflection-questions',
        title: 'Reflection Questions',
        slug: 'reflection-questions',
        order: 4,
        blocks: [
          {
            id: 'reflection-h1',
            type: 'heading',
            level: 1,
            text: 'Reflection Questions'
          },
          {
            id: 'reflection-list',
            type: 'numbered-list',
            items: ['Question one']
          },
          {
            id: 'image-placeholder-1',
            type: 'image-placeholder',
            image: {
              assetId: 'asset-cover',
              caption: 'Image caption'
            }
          },
          {
            id: 'table-1',
            type: 'table',
            table: {
              headers: ['Type', 'Value'],
              rows: [['bible', 'John 3:16']]
            }
          }
        ]
      }
    ],
    references: [
      {
        id: 'ref-1',
        referenceType: 'bible' as const,
        label: 'John 3:16',
        detail: 'Bible reference',
        url: null,
        targetId: null
      },
      {
        id: 'ref-internal-1',
        referenceType: 'internal' as const,
        label: 'Summary',
        detail: 'Internal reference',
        url: null,
        targetId: 'message-summary'
      }
    ],
    citations: [
      {
        id: 'citation-1',
        label: 'Citation 1',
        text: 'John 3:16',
        referenceId: 'ref-1'
      }
    ],
    footnotes: [
      {
        id: 'footnote-1',
        marker: '1',
        text: 'Footnote text'
      }
    ],
    assets: [
      {
        id: 'asset-cover',
        type: 'image' as const,
        uri: 'asset://cover-image',
        altText: 'Cover',
        mimeType: null
      }
    ],
    document: {
      schemaVersion: '1.0' as const,
      layoutIntent: 'digital-first' as const,
      language: 'en'
    },
    renderOptions: {
      preferredTargets: ['cta-guide'] as const,
      includeCover: true,
      includeToc: true
    }
  };

  return publication;
}

function clonePublication(value: Publication): Publication {
  return JSON.parse(JSON.stringify(value)) as Publication;
}

const validByType: Array<{ type: string; block: any; invalid: any }> = [
  {
    type: 'heading',
    block: { id: 'block-heading', type: 'heading', level: 2, text: 'Heading' },
    invalid: { id: 'block-heading', type: 'heading', level: 5, text: 'Heading' }
  },
  {
    type: 'paragraph',
    block: { id: 'block-paragraph', type: 'paragraph', text: 'Paragraph', attribution: null },
    invalid: { id: 'block-paragraph', type: 'paragraph', text: '   ', attribution: null }
  },
  {
    type: 'quote',
    block: { id: 'block-quote', type: 'quote', text: 'Quote', attribution: 'Author' },
    invalid: { id: 'block-quote', type: 'quote', text: '', attribution: 'Author' }
  },
  {
    type: 'reflection',
    block: { id: 'block-reflection', type: 'reflection', text: 'Reflect', attribution: null },
    invalid: { id: 'block-reflection', type: 'reflection', text: ' ', attribution: null }
  },
  {
    type: 'call-to-action',
    block: { id: 'block-cta', type: 'call-to-action', title: 'Title', description: 'Desc', action: 'Act' },
    invalid: { id: 'block-cta', type: 'call-to-action', title: ' ', description: 'Desc', action: 'Act' }
  },
  {
    type: 'prayer',
    block: { id: 'block-prayer', type: 'prayer', text: 'Prayer text', attribution: null },
    invalid: { id: 'block-prayer', type: 'prayer', text: ' ', attribution: null }
  },
  {
    type: 'scripture',
    block: { id: 'block-scripture', type: 'scripture', references: ['John 3:16'], text: 'John 3:16' },
    invalid: { id: 'block-scripture', type: 'scripture', references: [' '], text: 'John 3:16' }
  },
  {
    type: 'journal-prompt',
    block: { id: 'block-journal', type: 'journal-prompt', text: 'Prompt', attribution: null },
    invalid: { id: 'block-journal', type: 'journal-prompt', text: '', attribution: null }
  },
  {
    type: 'checklist',
    block: { id: 'block-checklist', type: 'checklist', items: ['Item'] },
    invalid: { id: 'block-checklist', type: 'checklist', items: [] }
  },
  {
    type: 'bullet-list',
    block: { id: 'block-bullet', type: 'bullet-list', items: ['Item'] },
    invalid: { id: 'block-bullet', type: 'bullet-list', items: [' '] }
  },
  {
    type: 'numbered-list',
    block: { id: 'block-numbered', type: 'numbered-list', items: ['Item'] },
    invalid: { id: 'block-numbered', type: 'numbered-list', items: [] }
  },
  {
    type: 'sidebar',
    block: { id: 'block-sidebar', type: 'sidebar', sidebar: { title: 'Sidebar', body: 'Sidebar text' } },
    invalid: { id: 'block-sidebar', type: 'sidebar', sidebar: { title: ' ', body: 'Sidebar text' } }
  },
  {
    type: 'image-placeholder',
    block: { id: 'block-image', type: 'image-placeholder', image: { assetId: 'asset-cover', caption: null } },
    invalid: { id: 'block-image', type: 'image-placeholder', image: { assetId: 'missing-asset', caption: null } }
  },
  {
    type: 'table',
    block: {
      id: 'block-table',
      type: 'table',
      table: {
        headers: ['A', 'B'],
        rows: [['1', '2']]
      }
    },
    invalid: {
      id: 'block-table',
      type: 'table',
      table: {
        headers: ['A', 'B'],
        rows: [['1']]
      }
    }
  },
  {
    type: 'divider',
    block: { id: 'block-divider', type: 'divider' },
    invalid: { id: 'block-divider', type: 'divider', extra: true }
  },
  {
    type: 'key-takeaway',
    block: { id: 'block-key', type: 'key-takeaway', text: 'Takeaway', attribution: null },
    invalid: { id: 'block-key', type: 'key-takeaway', text: ' ', attribution: null }
  },
  {
    type: 'warning',
    block: { id: 'block-warning', type: 'warning', text: 'Warning', attribution: null },
    invalid: { id: 'block-warning', type: 'warning', text: '', attribution: null }
  },
  {
    type: 'highlight',
    block: { id: 'block-highlight', type: 'highlight', text: 'Highlight', attribution: null },
    invalid: { id: 'block-highlight', type: 'highlight', text: ' ', attribution: null }
  }
];

describe('publication schema', () => {
  it('accepts a valid fully linked publication object', () => {
    expect(publicationSchema.safeParse(createValidPublication()).success).toBe(true);
  });

  it('rejects unknown top-level fields', () => {
    const publication = createValidPublication() as any;
    publication.extra = true;
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects unknown nested fields', () => {
    const publication = createValidPublication() as any;
    publication.sections[2].blocks[1].extra = true;
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects invalid block type', () => {
    const publication = createValidPublication() as any;
    publication.sections[2].blocks[0].type = 'unknown-type';
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects duplicate section IDs', () => {
    const publication = createValidPublication();
    publication.sections[3].id = publication.sections[2].id;
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects duplicate block IDs', () => {
    const publication = createValidPublication();
    publication.sections[3].blocks[0].id = publication.sections[2].blocks[0].id;
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects duplicate asset IDs', () => {
    const publication = createValidPublication();
    publication.assets.push({ ...publication.assets[0] });
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects duplicate reference IDs', () => {
    const publication = createValidPublication();
    publication.references.push({ ...publication.references[0] });
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects duplicate citation IDs', () => {
    const publication = createValidPublication();
    publication.citations.push({ ...publication.citations[0] });
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects duplicate footnote IDs', () => {
    const publication = createValidPublication();
    publication.footnotes.push({ ...publication.footnotes[0] });
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects duplicate TOC IDs', () => {
    const publication = createValidPublication();
    publication.toc.entries.push({ ...publication.toc.entries[0] });
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects dangling TOC target', () => {
    const publication = createValidPublication();
    publication.toc.entries[0].targetId = 'missing-target';
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects dangling internal reference', () => {
    const publication = createValidPublication();
    publication.references[1].targetId = 'missing-target';
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects missing image-placeholder asset', () => {
    const publication = createValidPublication();
    publication.sections[3].blocks[2].image.assetId = 'missing-asset';
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects missing cover image asset', () => {
    const publication = createValidPublication();
    publication.cover.coverImageAssetId = 'missing-asset';
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects missing footnote target', () => {
    const publication = createValidPublication();
    publication.sections[2].blocks[1].footnoteIds = ['missing-footnote'];
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects missing citation target', () => {
    const publication = createValidPublication();
    publication.sections[2].blocks[1].citationIds = ['missing-citation'];
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects publication with only cover and TOC sections', () => {
    const publication = createValidPublication();
    publication.sections = publication.sections.slice(0, 2);
    publication.toc.entries = [];
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('validates table row and header consistency', () => {
    const publication = createValidPublication();
    expect(publicationSchema.safeParse(publication).success).toBe(true);
  });

  it('rejects table with too few row cells', () => {
    const publication = createValidPublication();
    publication.sections[3].blocks[3].table.rows = [['only-one-cell']];
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects table with too many row cells', () => {
    const publication = createValidPublication();
    publication.sections[3].blocks[3].table.rows = [['A', 'B', 'C']];
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects table with empty headers', () => {
    const publication = createValidPublication();
    publication.sections[3].blocks[3].table.headers = [' '];
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects table with empty required cells', () => {
    const publication = createValidPublication();
    publication.sections[3].blocks[3].table.rows = [['A', ' ']];
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects table with row limit exceeded', () => {
    const publication = createValidPublication();
    publication.sections[3].blocks[3].table.rows = Array.from({ length: 41 }, () => ['A', 'B']);
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects table with column limit exceeded', () => {
    const publication = createValidPublication();
    publication.sections[3].blocks[3].table.headers = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    publication.sections[3].blocks[3].table.rows = [['1', '2', '3', '4', '5', '6', '7', '8', '9']];
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('rejects unknown nested table fields', () => {
    const publication = createValidPublication() as any;
    publication.sections[3].blocks[3].table.extra = true;
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  for (const definition of validByType) {
    it(`accepts valid ${definition.type} block`, () => {
      const publication = createValidPublication();
      if (definition.type === 'heading') {
        publication.sections[2].blocks = [definition.block];
        publication.toc.entries[1].targetId = definition.block.id;
      } else {
        publication.sections[3].blocks = [definition.block];

        if (definition.type === 'image-placeholder') {
          publication.sections[3].blocks[0].image.assetId = 'asset-cover';
        }
      }

      expect(publicationSchema.safeParse(publication).success).toBe(true);
    });

    it(`rejects invalid ${definition.type} block`, () => {
      const publication = createValidPublication();
      publication.sections[3].blocks = [definition.invalid];
      expect(publicationSchema.safeParse(publication).success).toBe(false);
    });
  }

  it('rejects array bounds violations for list items', () => {
    const publication = createValidPublication();
    publication.sections[3].blocks[1].items = Array.from({ length: 41 }, (_, index) => `Item ${index}`);
    expect(publicationSchema.safeParse(publication).success).toBe(false);
  });

  it('does not mutate source object during parse', () => {
    const publication = createValidPublication();
    const before = clonePublication(publication);
    publicationSchema.safeParse(publication);
    expect(publication).toEqual(before);
  });
});
