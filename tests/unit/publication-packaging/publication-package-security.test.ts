import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PublicationPackageComposer } from '../../../src/application/publication-packaging/index.js';
import type { HtmlDocument } from '../../../src/domain/publications/html-types.js';

function createDocument(): HtmlDocument {
  return {
    schemaVersion: '1.0',
    metadata: {
      publicationId: 'pub_1',
      publicationType: 'cta-guide',
      title: 'Title',
      description: 'Desc',
      language: 'en',
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceVersionId: 'srcver_01',
      sourceContentHash: 'hash',
      audience: 'general',
      theme: 'classic',
      styleTokens: [{ category: 'page-intent', value: 'reading' }],
      assetReferences: []
    },
    theme: 'classic',
    head: {
      title: 'Title',
      lang: 'en',
      metadata: [],
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
                      children: [{ nodeType: 'text', text: 'Safe body' }]
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

describe('publication package security', () => {
  it('produces standalone html without active content or duplicate package shell markers', () => {
    const html = new PublicationPackageComposer().compose({ document: createDocument() }).standaloneHtmlDocument;

    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/<link\b[^>]*rel\s*=\s*["']?stylesheet/i);
    expect(html).not.toMatch(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i);
    expect(html).not.toContain('@page');
    expect((html.match(/<style>/g) ?? [])).toHaveLength(1);
  });

  it('packaging source does not use browser tooling, html reparsing libraries, or filesystem writes', () => {
    const files = [
      resolve(process.cwd(), 'src/application/publication-packaging/standalone-html-document-composer.ts'),
      resolve(process.cwd(), 'src/application/publication-packaging/publication-package-composer.ts')
    ];

    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');

    expect(source).not.toContain('writeFile');
    expect(source).not.toContain('DOMParser');
    expect(source).not.toContain('JSDOM');
    expect(source).not.toContain('parse5');
    expect(source).not.toContain('cheerio');
    expect(source).not.toContain('Playwright');
    expect(source).not.toContain('Puppeteer');
    expect(source).not.toContain('fetch(');
  });
});
