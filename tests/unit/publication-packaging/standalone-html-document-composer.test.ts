import { describe, expect, it } from 'vitest';

import {
  StandaloneHtmlDocumentComposer,
  canonicalHtmlDoctype,
  type SerializedHtmlDocument
} from '../../../src/application/publication-packaging/index.js';

function createSerializedDocument(overrides?: Partial<SerializedHtmlDocument>): SerializedHtmlDocument {
  return {
    doctype: canonicalHtmlDoctype,
    htmlAttributes: [{ name: 'lang', value: 'en' }],
    head: {
      title: 'Title & <Guide> "Test"',
      metadata: [
        { name: 'description', content: 'Description' },
        { name: 'viewport', content: 'bad-duplicate' }
      ]
    },
    bodyHtml: '<article class="publication"><main class="publication-main"><p class="publication-paragraph">Body</p></main></article>',
    ...overrides
  };
}

describe('standalone html document composer', () => {
  it('composes a deterministic standalone document with embedded css and body hooks', () => {
    const composer = new StandaloneHtmlDocumentComposer();

    const html = composer.compose({
      document: createSerializedDocument(),
      reservedMetadataPolicy: 'exclude',
      colorScheme: 'dark',
      embeddedStylesheetCss: ':root {\n  --pub-color-text: #fff;\n}\n',
      bodyAttributes: [
        { name: 'data-publication-theme', value: 'dark' },
        { name: 'data-publication-density', value: 'standard' },
        { name: 'data-publication-layout', value: 'single-column' }
      ]
    });

    expect(html.startsWith('<!doctype html>\n')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('<meta name="color-scheme" content="dark">');
    expect(html).toContain('<title>Title &amp; &lt;Guide&gt; "Test"</title>');
    expect(html).toContain('<style>:root {\n  --pub-color-text: #fff;\n}\n</style>');
    expect(html).toContain('<body data-publication-theme="dark" data-publication-density="standard" data-publication-layout="single-column">');
    expect(html).not.toContain('bad-duplicate');
    expect(html.endsWith('</html>\n')).toBe(true);
  });

  it('preserves reserved metadata when requested for serializer-compatible output', () => {
    const composer = new StandaloneHtmlDocumentComposer();
    const html = composer.compose({
      document: createSerializedDocument(),
      reservedMetadataPolicy: 'preserve'
    });

    expect(html).toContain('<meta name="viewport" content="bad-duplicate">');
  });

  it('rejects invalid body html and embedded closing style tags', () => {
    const composer = new StandaloneHtmlDocumentComposer();

    expect(() => composer.compose({
      document: createSerializedDocument({ bodyHtml: '<script>alert(1)</script>' })
    })).toThrow('Standalone document body content is invalid.');

    expect(() => composer.compose({
      document: createSerializedDocument(),
      embeddedStylesheetCss: 'body{} </style>'
    })).toThrow('Embedded stylesheet content is invalid.');
  });
});
