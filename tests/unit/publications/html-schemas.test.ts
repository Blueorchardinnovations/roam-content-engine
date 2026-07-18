import { describe, expect, it } from 'vitest';

import { PublicationHtmlComposer } from '../../../src/application/publications/html-composer.js';
import { htmlDocumentSchema } from '../../../src/schemas/publications/html-document-schema.js';
import type { Publication } from '../../../src/schemas/publications/publication-schema.js';

function createPublication(): Publication {
  return {
    metadata: {
      publicationId: 'pub_schema_01',
      publicationType: 'cta-guide',
      title: 'Schema Test',
      subtitle: null,
      author: 'RoaM Content Engine',
      organization: null,
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceVersionId: 'srcver_schema_01',
      sourceContentHash: 'hash_schema_01',
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
      title: 'Schema Test',
      subtitle: null,
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
        }
      ]
    },
    sections: [
      {
        id: 'cover',
        title: 'Cover',
        slug: 'cover',
        order: 1,
        blocks: [{ id: 'cover-h1', type: 'heading', level: 1, text: 'Schema Test' }]
      },
      {
        id: 'table-of-contents',
        title: 'Table of Contents',
        slug: 'table-of-contents',
        order: 2,
        blocks: [{ id: 'toc-h1', type: 'heading', level: 1, text: 'Table of Contents' }]
      },
      {
        id: 'message-summary',
        title: 'Message Summary',
        slug: 'message-summary',
        order: 3,
        blocks: [
          { id: 'summary-h1', type: 'heading', level: 1, text: 'Message Summary' },
          { id: 'summary-body', type: 'paragraph', text: 'Body', attribution: null },
          { id: 'summary-image', type: 'image-placeholder', image: { assetId: 'asset-cover', caption: null } }
        ]
      }
    ],
    references: [],
    citations: [],
    footnotes: [],
    assets: [{ id: 'asset-cover', type: 'image', uri: 'asset://cover', altText: 'Cover alt', mimeType: null }],
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

function createDocument() {
  return new PublicationHtmlComposer().compose(createPublication());
}

describe('html document schema', () => {
  it('accepts valid html document output', () => {
    expect(htmlDocumentSchema.safeParse(createDocument()).success).toBe(true);
  });

  it('rejects skip target values that are not element IDs', () => {
    const document = createDocument();
    const duplicate = {
      ...document,
      body: {
        ...document.body,
        skipNavigationTargetId: 'document-root'
      }
    };

    expect(htmlDocumentSchema.safeParse(duplicate).success).toBe(false);
  });

  it('rejects unsafe URL schemes and disallowed link attributes', () => {
    const document = createDocument();
    const mutated = structuredClone(document);

    const article = mutated.body.sections[0]?.elements[0];
    if (!article || article.nodeType !== 'element') {
      throw new Error('Expected article root element.');
    }

    const header = article.children.find((child) => child.nodeType === 'element' && child.id === 'document-header');
    if (!header || header.nodeType !== 'element') {
      throw new Error('Expected header element.');
    }

    const invalidLink = {
      nodeType: 'element' as const,
      elementType: 'generic' as const,
      id: 'bad-link',
      tag: 'a' as const,
      attributes: {
        href: 'javascript:alert(1)',
        target: '_blank' as const,
        rel: 'noopener'
      },
      classList: [],
      ariaLabel: null,
      role: null,
      styleTokens: [],
      children: [{ nodeType: 'text' as const, text: 'Bad' }]
    };

    header.children.push(invalidLink);

    expect(htmlDocumentSchema.safeParse(mutated).success).toBe(false);
  });

  it('rejects malformed and credentialed URLs', () => {
    const document = createDocument();
    const mutated = structuredClone(document);

    const article = mutated.body.sections[0]?.elements[0];
    if (!article || article.nodeType !== 'element') {
      throw new Error('Expected article root element.');
    }

    const header = article.children.find((child) => child.nodeType === 'element' && child.id === 'document-header');
    if (!header || header.nodeType !== 'element') {
      throw new Error('Expected header element.');
    }

    header.children.push({
      nodeType: 'element',
      elementType: 'generic',
      id: 'malformed-link',
      tag: 'a',
      attributes: {
        href: 'https://example.com:99999'
      },
      classList: [],
      ariaLabel: null,
      role: null,
      styleTokens: [],
      children: [{ nodeType: 'text', text: 'Bad port' }]
    });

    header.children.push({
      nodeType: 'element',
      elementType: 'generic',
      id: 'credential-link',
      tag: 'a',
      attributes: {
        href: 'https://user:pass@example.com/'
      },
      classList: [],
      ariaLabel: null,
      role: null,
      styleTokens: [],
      children: [{ nodeType: 'text', text: 'Bad creds' }]
    });

    expect(htmlDocumentSchema.safeParse(mutated).success).toBe(false);
  });

  it('rejects invalid attributes on elements', () => {
    const document = createDocument();
    const mutated = structuredClone(document);

    const article = mutated.body.sections[0]?.elements[0];
    if (!article || article.nodeType !== 'element') {
      throw new Error('Expected article root element.');
    }

    const header = article.children.find((child) => child.nodeType === 'element' && child.id === 'document-header');
    if (!header || header.nodeType !== 'element') {
      throw new Error('Expected header element.');
    }

    const heading = header.children.find((child) => child.nodeType === 'element' && child.elementType === 'heading');
    if (!heading || heading.nodeType !== 'element') {
      throw new Error('Expected heading element.');
    }

    (heading.attributes as Record<string, string>).style = 'color:red';
    (heading.attributes as Record<string, string>).onload = 'alert(1)';

    expect(htmlDocumentSchema.safeParse(mutated).success).toBe(false);
  });

  it('rejects multiple main elements', () => {
    const document = createDocument();
    const mutated = structuredClone(document);

    const article = mutated.body.sections[0]?.elements[0];
    if (!article || article.nodeType !== 'element') {
      throw new Error('Expected article root element.');
    }

    article.children.push({
      nodeType: 'element',
      elementType: 'generic',
      id: 'secondary-main',
      tag: 'main',
      attributes: {},
      classList: [],
      ariaLabel: null,
      role: null,
      styleTokens: [],
      children: []
    });

    expect(htmlDocumentSchema.safeParse(mutated).success).toBe(false);
  });

  it('rejects an empty main element', () => {
    const document = createDocument();
    const mutated = structuredClone(document);

    const article = mutated.body.sections[0]?.elements[0];
    if (!article || article.nodeType !== 'element') {
      throw new Error('Expected article root element.');
    }

    const main = article.children.find((child) => child.nodeType === 'element' && child.tag === 'main');
    if (!main || main.nodeType !== 'element') {
      throw new Error('Expected main element.');
    }

    main.children = [];

    expect(htmlDocumentSchema.safeParse(mutated).success).toBe(false);
  });
});
