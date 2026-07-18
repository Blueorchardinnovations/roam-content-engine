import { describe, expect, it } from 'vitest';

import { PublicationHtmlComposer } from '../../../src/application/publications/html-composer.js';
import { PublicationPackageComposer } from '../../../src/application/publication-packaging/index.js';
import type { Publication } from '../../../src/schemas/publications/publication-schema.js';

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
        }
      ]
    },
    sections: [
      {
        id: 'cover',
        title: 'Cover',
        slug: 'cover',
        order: 1,
        blocks: [{ id: 'cover-h1', type: 'heading', level: 1, text: 'The Narrow Way' }]
      },
      {
        id: 'message-summary',
        title: 'Message Summary',
        slug: 'message-summary',
        order: 2,
        blocks: [
          { id: 'summary-h1', type: 'heading', level: 1, text: 'Message Summary' },
          { id: 'summary-body', type: 'paragraph', text: 'Body', attribution: null },
          { id: 'reflection-1', type: 'reflection', text: 'Reflect here', attribution: null },
          { id: 'warning-1', type: 'warning', text: 'Warning text', attribution: null }
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

describe('styled publication package integration', () => {
  it('composes deterministic styled standalone html from publication through html composer', () => {
    const htmlDocument = new PublicationHtmlComposer().compose(createPublication());
    const composer = new PublicationPackageComposer();

    const one = composer.compose({
      document: htmlDocument,
      themeId: 'dark',
      densityId: 'comfortable',
      layoutId: 'two-column'
    });

    const two = composer.compose({
      document: htmlDocument,
      themeId: 'dark',
      densityId: 'comfortable',
      layoutId: 'two-column'
    });

    expect(one).toEqual(two);
    expect(one.standaloneHtmlDocument).toContain('data-publication-theme="dark"');
    expect(one.standaloneHtmlDocument).toContain('data-publication-density="comfortable"');
    expect(one.standaloneHtmlDocument).toContain('data-publication-layout="two-column"');
    expect(one.standaloneHtmlDocument).toContain('publication-reflection');
    expect(one.standaloneHtmlDocument).toContain('publication-warning');
    expect(one.packagedStylesheetCss).toContain('.publication-reflection');
    expect(one.packagedStylesheetCss).toContain('.publication-warning');
    expect(one.standaloneHtmlDocument).toContain('<meta name="color-scheme" content="dark">');
    expect(one.standaloneHtmlDocument).toContain('<title>The Narrow Way</title>');
    expect(one.standaloneHtmlDocument).toContain('<html lang="en">');
    expect(one.standaloneHtmlDocument).not.toMatch(/<script\b/i);
    expect(one.standaloneHtmlDocument).not.toContain('@page');
  });
});
