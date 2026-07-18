import { describe, expect, it } from 'vitest';

import { PublicationPackageComposer } from '../../../src/application/publication-packaging/index.js';
import type { HtmlDocument } from '../../../src/domain/publications/html-types.js';

function createDocument(title: string): HtmlDocument {
  return {
    schemaVersion: '1.0',
    metadata: {
      publicationId: 'pub_1',
      publicationType: 'cta-guide',
      title,
      description: 'Desc',
      language: 'en',
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceVersionId: 'srcver_01',
      sourceContentHash: 'hash',
      audience: 'general',
      theme: 'ministry',
      styleTokens: [{ category: 'page-intent', value: 'reading' }],
      assetReferences: []
    },
    theme: 'ministry',
    head: {
      title,
      lang: 'ar',
      metadata: [{ name: 'description', content: 'Desc' }],
      styleTokens: []
    },
    body: {
      skipNavigationTargetId: 'main-content',
      sections: [
        {
          id: 'document-root',
          title: 'Root',
          role: 'content',
          styleTokens: [],
          elements: [
            {
              nodeType: 'element',
              elementType: 'generic',
              id: 'document-article',
              tag: 'article',
              attributes: {},
              classList: ['document'],
              ariaLabel: null,
              role: null,
              styleTokens: [],
              children: [
                {
                  nodeType: 'element',
                  elementType: 'generic',
                  id: 'main-content',
                  tag: 'main',
                  attributes: {},
                  classList: ['document-main'],
                  ariaLabel: null,
                  role: null,
                  styleTokens: [],
                  children: [
                    {
                      nodeType: 'element',
                      elementType: 'generic',
                      id: 'paragraph-1',
                      tag: 'p',
                      attributes: {},
                      classList: ['content-block'],
                      ariaLabel: null,
                      role: null,
                      styleTokens: [{ category: 'typography', value: 'body' }],
                      children: [{ nodeType: 'text', text: 'النص العربي ✅' }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ],
      landmarks: [
        { role: 'banner', sectionId: 'document-root', label: 'Document header' },
        { role: 'main', sectionId: 'document-root', label: null },
        { role: 'contentinfo', sectionId: 'document-root', label: null }
      ]
    }
  };
}

describe('publication package determinism', () => {
  it('preserves unicode title and content and emits canonical newline formatting', () => {
    const composer = new PublicationPackageComposer();
    const result = composer.compose({ document: createDocument('عنوان & ✅') });

    expect(result.standaloneHtmlDocument).toContain('<html lang="ar">');
    expect(result.standaloneHtmlDocument).toContain('<title>عنوان &amp; ✅</title>');
    expect(result.standaloneHtmlDocument).toContain('النص العربي ✅');
    expect(result.standaloneHtmlDocument.includes('\r')).toBe(false);

    const lines = result.standaloneHtmlDocument.split('\n');
    for (const line of lines) {
      expect(/[ \t]+$/.test(line)).toBe(false);
    }
  });

  it('does not add timestamps, random identifiers, or duplicate css embedding', () => {
    const composer = new PublicationPackageComposer();
    const result = composer.compose({ document: createDocument('Title') });

    expect(result.standaloneHtmlDocument).not.toContain('Date.now');
    expect(result.standaloneHtmlDocument).not.toContain('Math.random');
    expect(result.standaloneHtmlDocument).not.toContain('randomUUID');
    expect(result.standaloneHtmlDocument).not.toContain('artifact_');
    expect((result.standaloneHtmlDocument.match(/<style>/g) ?? [])).toHaveLength(1);
  });
});
