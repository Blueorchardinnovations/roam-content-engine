import { describe, expect, it } from 'vitest';

import { HtmlMarkupSerializer } from '../../../src/application/rendering/html-markup-serializer.js';
import type { HtmlDocument } from '../../../src/domain/publications/html-types.js';

function createDocument(overrides?: Partial<HtmlDocument>): HtmlDocument {
  return {
    schemaVersion: '1.0',
    metadata: {
      publicationId: 'pub_1',
      publicationType: 'cta-guide',
      title: 'RoaM <Guide> & Study',
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
      title: 'RoaM <Guide> & Study',
      lang: 'en',
      metadata: [
        { name: 'description', content: 'Desc "quoted"' }
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
                  id: 'table-of-contents',
                  tag: 'nav',
                  attributes: {},
                  classList: ['toc'],
                  ariaLabel: 'Table of contents',
                  role: 'navigation',
                  styleTokens: [],
                  children: [
                    {
                      nodeType: 'element',
                      elementType: 'list',
                      id: 'toc-list',
                      tag: 'ol',
                      ordered: true,
                      attributes: {},
                      classList: ['toc-list'],
                      ariaLabel: null,
                      role: null,
                      styleTokens: [],
                      children: [
                        {
                          nodeType: 'element',
                          elementType: 'generic',
                          id: 'toc-item-1',
                          tag: 'li',
                          attributes: {},
                          classList: ['toc-item'],
                          ariaLabel: null,
                          role: null,
                          styleTokens: [],
                          children: [
                            {
                              nodeType: 'element',
                              elementType: 'generic',
                              id: 'toc-link-1',
                              tag: 'a',
                              attributes: { href: '#section-1' },
                              classList: [],
                              ariaLabel: null,
                              role: null,
                              styleTokens: [],
                              children: [{ nodeType: 'text', text: 'Section 1' }]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
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
                      id: 'section-1',
                      tag: 'section',
                      attributes: {},
                      classList: ['section'],
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
                          children: [{ nodeType: 'text', text: 'Heading <One>' }]
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
                          children: [{ nodeType: 'text', text: 'Body <script>alert(1)</script> & text' }]
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
                          elementType: 'image',
                          id: 'image-1',
                          tag: 'figure',
                          assetId: 'asset-1',
                          src: 'asset://cover',
                          alt: 'Cover "image"',
                          caption: 'Caption <safe>',
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
                              attributes: { src: 'asset://cover', alt: 'Cover "image"' },
                              classList: [],
                              ariaLabel: null,
                              role: null,
                              styleTokens: [],
                              children: []
                            },
                            {
                              nodeType: 'element',
                              elementType: 'generic',
                              id: 'caption-1',
                              tag: 'figcaption',
                              attributes: {},
                              classList: [],
                              ariaLabel: null,
                              role: null,
                              styleTokens: [],
                              children: [{ nodeType: 'text', text: 'Caption <safe>' }]
                            }
                          ]
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
        { role: 'navigation', sectionId: 'document-root', label: 'Table of contents' },
        { role: 'main', sectionId: 'document-root', label: null },
        { role: 'contentinfo', sectionId: 'document-root', label: null }
      ]
    },
    ...overrides
  };
}

describe('html markup serializer', () => {
  it('produces complete deterministic html5 document with canonical doctype', () => {
    const serializer = new HtmlMarkupSerializer();
    const html = serializer.serialize(createDocument());

    expect(html.startsWith('<!doctype html>\n')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
    expect(html.endsWith('</html>\n')).toBe(true);
  });

  it('escapes title, text nodes and attributes', () => {
    const serializer = new HtmlMarkupSerializer();
    const html = serializer.serialize(createDocument());

    expect(html).toContain('<title>RoaM &lt;Guide&gt; &amp; Study</title>');
    expect(html).toContain('Body &lt;script&gt;alert(1)&lt;/script&gt; &amp; text');
    expect(html).toContain('alt="Cover &quot;image&quot;"');
    expect(html).toContain('Caption &lt;safe&gt;');
  });

  it('preserves semantic block identity and stable css hooks', () => {
    const serializer = new HtmlMarkupSerializer();
    const html = serializer.serialize(createDocument());

    expect(html).toContain('data-publication-block="reflection"');
    expect(html).toContain('publication-block');
    expect(html).toContain('publication-reflection');
    expect(html).toContain('publication-main');
    expect(html).toContain('publication-section');
    expect(html).toContain('publication-heading');
    expect(html).toContain('publication-paragraph');
  });

  it('preserves stable ids and rejects duplicate ids', () => {
    const serializer = new HtmlMarkupSerializer();
    const html = serializer.serialize(createDocument());
    expect(html).toContain('id="main-content"');

    const duplicate = createDocument();
    (duplicate.body.sections[0]!.elements[0]!.children[1]!.children[0]! as any).id = 'heading-1';

    expect(() => serializer.serialize(duplicate)).toThrow('Duplicate HTML ID detected during serialization.');
  });

  it('serializes toc navigation only when non-empty', () => {
    const serializer = new HtmlMarkupSerializer();
    const withToc = serializer.serialize(createDocument());
    expect(withToc).toContain('<nav');

    const noToc = createDocument();
    (noToc.body.sections[0]!.elements[0]!.children[0]! as any).children = [];
    const withoutToc = serializer.serialize(noToc);
    expect(withoutToc).not.toContain('<nav');
  });

  it('rejects empty main content and unsupported active tags', () => {
    const serializer = new HtmlMarkupSerializer();
    const emptyMain = createDocument();
    (emptyMain.body.sections[0]!.elements[0]!.children[1]! as any).children = [];

    expect(() => serializer.serialize(emptyMain)).toThrow('Serialized HTML main element must contain meaningful content.');

    const withScript = createDocument();
    ((withScript.body.sections[0]!.elements[0]!.children[1]! as any).children as any[]).push({
      nodeType: 'element',
      elementType: 'generic',
      id: 'script-node',
      tag: 'script',
      attributes: {},
      classList: [],
      ariaLabel: null,
      role: null,
      styleTokens: [],
      children: []
    });

    expect(() => serializer.serialize(withScript as any)).toThrow('Active content elements are not allowed.');
  });

  it('rejects unsafe urls and preserves safe urls', () => {
    const serializer = new HtmlMarkupSerializer();
    const safe = serializer.serialize(createDocument());
    expect(safe).toContain('href="#section-1"');
    expect(safe).toContain('src="asset://cover"');

    const unsafe = createDocument();
    ((unsafe.body.sections[0]!.elements[0]!.children[1]! as any).children[0] as any).attributes.href = 'javascript:alert(1)';

    expect(() => serializer.serialize(unsafe)).toThrow();
  });

  it('uses deterministic LF formatting and does not mutate input', () => {
    const serializer = new HtmlMarkupSerializer();
    const doc = createDocument();
    const original = structuredClone(doc);

    const one = serializer.serialize(doc);
    const two = serializer.serialize(createDocument());

    expect(one).toBe(two);
    expect(one.includes('\r\n')).toBe(false);
    expect(doc).toEqual(original);
  });

  it('does not require clock or id generator dependencies', () => {
    const serializer = new HtmlMarkupSerializer();
    expect(typeof serializer.serialize).toBe('function');
  });
});
