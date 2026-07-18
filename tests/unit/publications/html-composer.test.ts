import { describe, expect, it } from 'vitest';

import {
  HtmlValidationError,
  PublicationHtmlComposer,
  mapThemeToDesignTokens
} from '../../../src/application/publications/index.js';
import type { HtmlElement } from '../../../src/domain/publications/html-types.js';
import type { Publication } from '../../../src/schemas/publications/publication-schema.js';
import { htmlDocumentSchema } from '../../../src/schemas/publications/html-document-schema.js';

function createPublication(): Publication {
  return {
    metadata: {
      publicationId: 'pub_01',
      publicationType: 'cta-guide',
      title: 'The Narrow Way',
      subtitle: 'A study guide',
      author: 'RoaM Content Engine',
      organization: null,
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceVersionId: 'srcver_01',
      sourceContentHash: 'hash_01',
      pipelineVersion: '1.0.0',
      audience: 'general',
      theme: 'ministry',
      style: {
        tone: 'pastoral',
        readingLevel: 'introductory',
        voice: 'reflective'
      }
    },
    cover: {
      title: 'The Narrow Way',
      subtitle: 'A study guide',
      author: 'RoaM Content Engine',
      organization: null,
      coverImageAssetId: 'asset-cover',
      branding: 'RoaM',
      generatedDate: '2026-01-01T00:00:00.000Z',
      publicationType: 'cta-guide'
    },
    toc: {
      entries: [
        {
          id: 'toc-message-summary',
          targetId: 'message-summary',
          title: 'Message Summary',
          level: 1,
          anchor: 'message-summary',
          parentId: null,
          pageNumber: null
        },
        {
          id: 'toc-summary-h2',
          targetId: 'summary-h2',
          title: 'Detailed Summary',
          level: 2,
          anchor: 'message-summary-summary-h2',
          parentId: 'toc-message-summary',
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
          { id: 'cover-h1', type: 'heading', level: 1, text: 'The Narrow Way' }
        ]
      },
      {
        id: 'table-of-contents',
        title: 'Table of Contents',
        slug: 'table-of-contents',
        order: 2,
        blocks: [
          { id: 'toc-h1', type: 'heading', level: 1, text: 'Table of Contents' }
        ]
      },
      {
        id: 'message-summary',
        title: 'Message Summary',
        slug: 'message-summary',
        order: 3,
        blocks: [
          { id: 'summary-h1', type: 'heading', level: 1, text: 'Message Summary' },
          { id: 'summary-h2', type: 'heading', level: 2, text: 'Detailed Summary' },
          { id: 'paragraph-1', type: 'paragraph', text: 'Body paragraph', attribution: null, citationIds: ['citation-1'], footnoteIds: ['footnote-1'] },
          { id: 'quote-1', type: 'quote', text: 'Quote text', attribution: 'Speaker' },
          { id: 'reflection-1', type: 'reflection', text: 'Reflect here', attribution: null },
          { id: 'prayer-1', type: 'prayer', text: 'Pray here', attribution: null },
          { id: 'journal-1', type: 'journal-prompt', text: 'Write this down', attribution: null },
          { id: 'takeaway-1', type: 'key-takeaway', text: 'Takeaway', attribution: null },
          { id: 'warning-1', type: 'warning', text: 'Warning text', attribution: null },
          { id: 'highlight-1', type: 'highlight', text: 'Highlight text', attribution: null },
          { id: 'cta-1', type: 'call-to-action', title: 'Do this', description: 'Action detail', action: 'Begin now' },
          { id: 'scripture-1', type: 'scripture', references: ['John 3:16'], text: 'John 3:16' },
          { id: 'checklist-1', type: 'checklist', items: ['Check item'] },
          { id: 'bullet-1', type: 'bullet-list', items: ['Bullet item'] },
          { id: 'numbered-1', type: 'numbered-list', items: ['Numbered item'] },
          { id: 'sidebar-1', type: 'sidebar', sidebar: { title: 'Sidebar', body: 'Sidebar body' } },
          { id: 'image-1', type: 'image-placeholder', image: { assetId: 'asset-cover', caption: 'Cover caption' } },
          { id: 'table-1', type: 'table', table: { headers: ['A', 'B'], rows: [['1', '2']] } },
          { id: 'divider-1', type: 'divider' }
        ]
      }
    ],
    references: [
      { id: 'ref-1', referenceType: 'external', label: 'Open source', detail: 'Reference detail', url: 'https://example.com', targetId: null }
    ],
    citations: [
      { id: 'citation-1', label: 'Citation 1', text: 'John 3:16', referenceId: 'ref-1' }
    ],
    footnotes: [
      { id: 'footnote-1', marker: '1', text: 'Footnote body' }
    ],
    assets: [
      { id: 'asset-cover', type: 'image', uri: 'asset://cover-image', altText: null, mimeType: null }
    ],
    document: {
      schemaVersion: '1.0',
      layoutIntent: 'digital-first',
      language: 'en'
    },
    renderOptions: {
      preferredTargets: ['cta-guide'],
      includeCover: true,
      includeToc: true
    }
  };
}

function collectElements(elements: readonly HtmlElement[]): HtmlElement[] {
  const collected: HtmlElement[] = [];

  for (const element of elements) {
    collected.push(element);

    if (element.children.length > 0) {
      const childrenElements = element.children.filter((child) => child.nodeType === 'element') as HtmlElement[];
      collected.push(...collectElements(childrenElements));
    }
  }

  return collected;
}

describe('publication html composer', () => {
  it('composes strict semantic html with one main and safe links', () => {
    const composer = new PublicationHtmlComposer();
    const document = composer.compose(createPublication());

    expect(htmlDocumentSchema.safeParse(document).success).toBe(true);
    expect(document.body.skipNavigationTargetId).toBe('main-content');

    const elements = collectElements(document.body.sections.flatMap((section) => section.elements));
    const mainCount = elements.filter((element) => element.tag === 'main').length;
    expect(mainCount).toBe(1);

    const tocLink = elements.find((element) => element.id === 'toc-link-toc-message-summary');
    expect(tocLink?.attributes.href).toBe('#message-summary');

    const referenceLink = elements.find((element) => element.id === 'appendix-reference-link-ref-1');
    expect(referenceLink?.attributes.target).toBe('_blank');
    expect(referenceLink?.attributes.rel).toBe('noopener noreferrer');

    const image = elements.find((element) => element.id === 'image-1-img');
    expect(image?.attributes.src).toBe('asset://cover-image');
    expect(image?.attributes.alt).toBe('Image description pending.');

    const allHeadings = elements.filter((element) => element.elementType === 'heading') as Array<HtmlElement & { level: number }>;
    const summaryHeading = allHeadings.find((heading) => heading.id === 'summary-h1');
    const detailedHeading = allHeadings.find((heading) => heading.id === 'summary-h2');
    expect(summaryHeading?.level).toBe(3);
    expect(detailedHeading?.level).toBe(3);
  });

  it('is deterministic and does not mutate the input publication', () => {
    const composer = new PublicationHtmlComposer();
    const publication = createPublication();
    const original = structuredClone(publication);

    const first = composer.compose(publication);
    const second = composer.compose(publication);

    expect(first).toEqual(second);
    expect(publication).toEqual(original);
  });

  it('throws sanitized validation errors for unsafe publication content', () => {
    const composer = new PublicationHtmlComposer();
    const publication = createPublication();
    publication.references[0] = {
      ...publication.references[0]!,
      url: 'javascript:alert(1)'
    };

    expect(() => composer.compose(publication)).toThrow(HtmlValidationError);
    expect(() => composer.compose(publication)).toThrow('HTML document failed validation.');
  });

  it('does not leak privacy sentinel values in html validation errors', () => {
    const composer = new PublicationHtmlComposer();
    const publication = createPublication();
    const sentinel = 'PRIVATE_HTML_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST';

    publication.references[0] = {
      ...publication.references[0]!,
      url: `javascript:${sentinel}`
    };

    try {
      composer.compose(publication);
      throw new Error('Expected HtmlValidationError to be thrown.');
    } catch (error) {
      expect(error).toBeInstanceOf(HtmlValidationError);
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(sentinel);
    }
  });

  it('omits table of contents nav when toc has no entries', () => {
    const composer = new PublicationHtmlComposer();
    const publication = createPublication();
    publication.toc.entries = [];

    const document = composer.compose(publication);
    const elements = collectElements(document.body.sections.flatMap((section) => section.elements));
    const hasTocNav = elements.some((element) => element.id === 'table-of-contents' && element.tag === 'nav');

    expect(hasTocNav).toBe(false);
    expect(document.body.landmarks.some((landmark) => landmark.role === 'navigation')).toBe(false);
  });

  it('preserves unique semantic identities for all callout-capable publication blocks', () => {
    const composer = new PublicationHtmlComposer();
    const document = composer.compose(createPublication());
    expect(htmlDocumentSchema.safeParse(document).success).toBe(true);

    const elements = collectElements(document.body.sections.flatMap((section) => section.elements));

    const callouts = elements
      .filter((element) => element.elementType === 'callout')
      .map((element) => {
        const paragraphText = element.children
          .filter((child) => child.nodeType === 'element' && child.tag === 'p')
          .flatMap((child) => child.children)
          .filter((child) => child.nodeType === 'text')
          .map((child) => child.text)
          .join(' ');

        return {
          id: element.id,
          tag: element.tag,
          blockType: element.attributes.dataPublicationBlock,
          calloutType: element.calloutType,
          text: paragraphText
        };
      });

    const calloutByBlockType = new Map(callouts.map((callout) => [callout.blockType, callout]));

    expect(calloutByBlockType.get('reflection')?.calloutType).toBe('reflection');
    expect(calloutByBlockType.get('call-to-action')?.calloutType).toBe('call-to-action');
    expect(calloutByBlockType.get('prayer')?.calloutType).toBe('prayer');
    expect(calloutByBlockType.get('journal-prompt')?.calloutType).toBe('journal-prompt');
    expect(calloutByBlockType.get('sidebar')?.calloutType).toBe('sidebar');
    expect(calloutByBlockType.get('key-takeaway')?.calloutType).toBe('key-takeaway');
    expect(calloutByBlockType.get('warning')?.calloutType).toBe('warning');
    expect(calloutByBlockType.get('highlight')?.calloutType).toBe('highlight');

    expect(calloutByBlockType.get('journal-prompt')?.calloutType).not.toBe('reflection');
    expect(calloutByBlockType.get('call-to-action')?.calloutType).not.toBe('key-takeaway');
    expect(calloutByBlockType.get('sidebar')?.calloutType).not.toBe('highlight');
    expect(calloutByBlockType.get('warning')?.calloutType).not.toBe('highlight');
    expect(calloutByBlockType.get('prayer')?.calloutType).not.toBe('journal-prompt');

    expect(calloutByBlockType.get('reflection')?.text).toContain('Reflect here');
    expect(calloutByBlockType.get('prayer')?.text).toContain('Pray here');
    expect(calloutByBlockType.get('journal-prompt')?.text).toContain('Write this down');
    expect(calloutByBlockType.get('key-takeaway')?.text).toContain('Takeaway');
    expect(calloutByBlockType.get('warning')?.text).toContain('Warning text');
    expect(calloutByBlockType.get('highlight')?.text).toContain('Highlight text');
    expect(calloutByBlockType.get('call-to-action')?.text).toContain('Action detail Begin now');
    expect(calloutByBlockType.get('sidebar')?.text).toContain('Sidebar body');

    for (const callout of callouts) {
      if (!callout.id) {
        continue;
      }

      expect(callout.tag).toBe('aside');
    }
  });

  it('maps themes to deterministic normalized design tokens', () => {
    const classicA = mapThemeToDesignTokens('classic');
    const classicB = mapThemeToDesignTokens('classic');
    const dark = mapThemeToDesignTokens('dark');

    expect(classicA).toEqual(classicB);
    expect(classicA).not.toEqual(dark);
    expect(new Set(classicA.map((token) => token.category)).size).toBe(classicA.length);
  });
});
