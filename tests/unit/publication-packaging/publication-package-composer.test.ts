import { describe, expect, it } from 'vitest';

import {
  PublicationPackageComposer,
  InvalidPublicationPackageCompositionInputError
} from '../../../src/application/publication-packaging/index.js';
import type { HtmlDocument } from '../../../src/domain/publications/html-types.js';

function createDocument(overrides?: Partial<HtmlDocument>): HtmlDocument {
  return {
    schemaVersion: '1.0',
    metadata: {
      publicationId: 'pub_1',
      publicationType: 'cta-guide',
      title: 'RoaM & Review مرحبا ✅',
      description: 'Desc',
      language: 'en',
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceVersionId: 'srcver_01',
      sourceContentHash: 'hash',
      audience: 'general',
      theme: 'classic',
      styleTokens: [{ category: 'page-intent', value: 'reading' }],
      assetReferences: [
        {
          id: 'asset-ref-1',
          assetId: 'asset-1',
          uri: 'asset://cover',
          mimeType: null,
          altText: 'Cover'
        }
      ]
    },
    theme: 'classic',
    head: {
      title: 'RoaM & Review مرحبا ✅',
      lang: 'en',
      metadata: [
        { name: 'description', content: 'Desc "quoted"' },
        { name: 'viewport', content: 'duplicate-viewport' },
        { name: 'color-scheme', content: 'duplicate-color-scheme' }
      ],
      styleTokens: [{ category: 'page-intent', value: 'reading' }]
    },
    body: {
      skipNavigationTargetId: 'main-content',
      sections: [
        {
          id: 'document-root',
          title: 'Root',
          role: 'content',
          styleTokens: [{ category: 'section-intent', value: 'content' }],
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
                      elementType: 'heading',
                      id: 'heading-1',
                      tag: 'h1',
                      level: 1,
                      attributes: {},
                      classList: ['section-title'],
                      ariaLabel: null,
                      role: null,
                      styleTokens: [{ category: 'heading-intent', value: 'document-title' }],
                      children: [{ nodeType: 'text', text: 'Heading ✅' }]
                    },
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
                      children: [{ nodeType: 'text', text: 'Body with Unicode مرحبا and safe link.' }]
                    },
                    {
                      nodeType: 'element',
                      elementType: 'callout',
                      id: 'reflection-1',
                      tag: 'aside',
                      calloutType: 'reflection',
                      attributes: { dataPublicationBlock: 'reflection' },
                      classList: ['callout'],
                      ariaLabel: null,
                      role: 'note',
                      styleTokens: [{ category: 'callout-type', value: 'reflection' }],
                      children: [{ nodeType: 'text', text: 'Reflect & pray' }]
                    },
                    {
                      nodeType: 'element',
                      elementType: 'generic',
                      id: 'safe-link',
                      tag: 'a',
                      attributes: { href: 'https://example.com/resource', target: '_blank', rel: 'noopener noreferrer', title: 'Go' },
                      classList: [],
                      ariaLabel: null,
                      role: null,
                      styleTokens: [],
                      children: [{ nodeType: 'text', text: 'External resource' }]
                    },
                    {
                      nodeType: 'element',
                      elementType: 'image',
                      id: 'image-1',
                      tag: 'figure',
                      assetId: 'asset-1',
                      src: 'asset://cover',
                      alt: 'Cover image',
                      caption: 'Caption',
                      attributes: {},
                      classList: ['content-block'],
                      ariaLabel: null,
                      role: null,
                      styleTokens: [{ category: 'image-alignment', value: 'center' }],
                      children: [
                        {
                          nodeType: 'element',
                          elementType: 'generic',
                          id: 'img-1',
                          tag: 'img',
                          attributes: { src: 'asset://cover', alt: 'Cover image' },
                          classList: [],
                          ariaLabel: null,
                          role: null,
                          styleTokens: [],
                          children: []
                        }
                      ]
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
    },
    ...overrides
  };
}

describe('publication package composer', () => {
  it('composes a valid styled standalone html document with resolved presentation metadata', () => {
    const composer = new PublicationPackageComposer();
    const document = createDocument();
    const original = structuredClone(document);

    const result = composer.compose({
      document,
      themeId: 'dark',
      densityId: 'compact',
      layoutId: 'wide-content'
    });

    expect(result.presentation).toEqual({
      themeId: 'dark',
      densityId: 'compact',
      layoutId: 'wide-content',
      colorScheme: 'dark'
    });

    expect(result.serializedHtmlDocument).toContain('<html lang="en">');
    expect(result.serializedHtmlDocument).not.toContain('<style>');
    expect(result.standaloneHtmlDocument).toContain('<style>/* layer:tokens-primitives */');
    expect(result.standaloneHtmlDocument).toContain('data-publication-theme="dark"');
    expect(result.standaloneHtmlDocument).toContain('data-publication-density="compact"');
    expect(result.standaloneHtmlDocument).toContain('data-publication-layout="wide-content"');
    expect(result.standaloneHtmlDocument).toContain('<meta name="color-scheme" content="dark">');
    expect(result.standaloneHtmlDocument).toContain('Reflect &amp; pray');
    expect(result.standaloneHtmlDocument).toContain('Body with Unicode مرحبا and safe link.');
    expect(result.standaloneHtmlDocument).toContain('href="https://example.com/resource"');
    expect(result.standaloneHtmlDocument).toContain('src="asset://cover"');
    expect(result.standaloneHtmlDocument).not.toContain('duplicate-viewport');
    expect(result.standaloneHtmlDocument).not.toContain('duplicate-color-scheme');
    expect(document).toEqual(original);
  });

  it('uses document theme and centralized defaults when optional presentation ids are omitted', () => {
    const composer = new PublicationPackageComposer();
    const result = composer.compose({ document: createDocument() });

    expect(result.presentation).toEqual({
      themeId: 'classic',
      densityId: 'standard',
      layoutId: 'single-column',
      colorScheme: 'light'
    });
  });

  it('is deterministic and output changes across theme, density, and layout variants', () => {
    const composer = new PublicationPackageComposer();
    const input = { document: createDocument() };

    const one = composer.compose(input);
    const two = composer.compose(input);

    expect(one).toEqual(two);
    expect(one.standaloneHtmlDocument.includes('\r')).toBe(false);

    expect(composer.compose({ document: createDocument(), themeId: 'dark' }).standaloneHtmlDocument).not.toBe(one.standaloneHtmlDocument);
    expect(composer.compose({ document: createDocument(), densityId: 'compact' }).standaloneHtmlDocument).not.toBe(one.standaloneHtmlDocument);
    expect(composer.compose({ document: createDocument(), layoutId: 'two-column' }).standaloneHtmlDocument).not.toBe(one.standaloneHtmlDocument);
  });

  it('rejects invalid inputs through controlled errors', () => {
    const composer = new PublicationPackageComposer();
    const invalid = createDocument({
      head: {
        title: 'Title',
        lang: 'x',
        metadata: [],
        styleTokens: []
      }
    });

    expect(() => composer.compose({ document: invalid as HtmlDocument })).toThrow(InvalidPublicationPackageCompositionInputError);
  });
});
