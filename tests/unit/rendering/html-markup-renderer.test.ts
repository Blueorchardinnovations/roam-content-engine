import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  HtmlMarkupRenderer,
  HtmlMarkupSerializer,
  InvalidRenderAssetError,
  RenderValidationError,
  UnsupportedRenderFormatError,
  UnsupportedRenderThemeError
} from '../../../src/application/rendering/index.js';
import type { RenderRequest } from '../../../src/domain/rendering/types.js';

function createHtmlDocument() {
  return {
    schemaVersion: '1.0' as const,
    metadata: {
      publicationId: 'pub_1',
      publicationType: 'cta-guide' as const,
      title: 'Title',
      description: 'Description',
      language: 'en',
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceVersionId: 'srcver_01TEST',
      sourceContentHash: 'hash_1',
      audience: 'general',
      theme: 'classic' as const,
      styleTokens: [{ category: 'page-intent' as const, value: 'reading' as const }],
      assetReferences: [
        {
          id: 'asset-ref-1',
          assetId: 'asset-1',
          uri: 'asset://cover-image',
          mimeType: null,
          altText: 'Cover image'
        }
      ]
    },
    theme: 'classic' as const,
    head: {
      title: 'Title',
      lang: 'en',
      metadata: [{ name: 'description', content: 'Description' }],
      styleTokens: [{ category: 'page-intent' as const, value: 'reading' as const }]
    },
    body: {
      skipNavigationTargetId: 'main-content',
      sections: [
        {
          id: 'document-root',
          title: 'Title',
          role: 'content' as const,
          styleTokens: [{ category: 'section-intent' as const, value: 'content' as const }],
          elements: [
            {
              nodeType: 'element' as const,
              elementType: 'generic' as const,
              id: 'document-article',
              tag: 'article' as const,
              attributes: {},
              classList: ['document'] as const,
              ariaLabel: null,
              role: null,
              styleTokens: [],
              children: [
                {
                  nodeType: 'element' as const,
                  elementType: 'generic' as const,
                  id: 'main-content',
                  tag: 'main' as const,
                  attributes: {},
                  classList: ['document-main'] as const,
                  ariaLabel: null,
                  role: null,
                  styleTokens: [],
                  children: [
                    {
                      nodeType: 'element' as const,
                      elementType: 'generic' as const,
                      id: 'paragraph-1',
                      tag: 'p' as const,
                      attributes: {},
                      classList: ['content-block'] as const,
                      ariaLabel: null,
                      role: null,
                      styleTokens: [{ category: 'typography' as const, value: 'body' as const }],
                      children: [{ nodeType: 'text' as const, text: 'Body text' }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ],
      landmarks: [
        { role: 'banner' as const, sectionId: 'document-root', label: 'Document header' },
        { role: 'main' as const, sectionId: 'document-root', label: null },
        { role: 'contentinfo' as const, sectionId: 'document-root', label: null }
      ]
    }
  };
}

function createRequest(overrides?: Partial<RenderRequest>): RenderRequest {
  return {
    htmlDocument: createHtmlDocument(),
    metadata: {
      title: 'Title',
      subtitle: 'Subtitle',
      author: 'Author',
      speaker: null,
      organization: 'Org',
      publicationDate: '2026-01-01T00:00:00.000Z',
      language: 'en',
      theme: 'classic',
      keywords: ['one', 'two'],
      description: 'Description',
      coverImageReference: 'asset://cover-image',
      copyright: null,
      license: null
    },
    options: {
      format: 'html',
      theme: 'classic'
    },
    ...overrides
  };
}

describe('html markup renderer', () => {
  it('requires deterministic dependencies', () => {
    expect(() => new HtmlMarkupRenderer()).toThrow(
      'HtmlMarkupRenderer requires deterministic now and createArtifactId dependencies.'
    );
  });

  it('invokes serializer and produces html-markup artifact metadata', () => {
    const serializer = {
      serialize: vi.fn(() => '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Title</title></head><body><article id="a"><main id="main-content"><p>Body text</p></main></article></body>\n</html>\n')
    } as unknown as HtmlMarkupSerializer;

    const renderer = new HtmlMarkupRenderer({
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      createArtifactId: () => 'artifact_fixed_10',
      serializer
    });

    const request = createRequest();
    const artifact = renderer.render(request);

    expect(serializer.serialize).toHaveBeenCalledTimes(1);
    expect(artifact.metadata.format).toBe('html');
    expect(artifact.metadata.payloadRepresentation).toBe('html-markup');
    expect(artifact.metadata.mimeType).toBe('text/html; charset=utf-8');
    expect(artifact.metadata.fileExtension).toBe('.html');
    expect(artifact.metadata.artifactId).toBe('artifact_fixed_10');
    expect(artifact.metadata.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(artifact.content?.serializedDocument.startsWith('<!doctype html>')).toBe(true);
    expect(() => JSON.parse(artifact.content?.serializedDocument ?? '')).toThrow();

    const bytes = Buffer.from(artifact.content?.serializedDocument ?? '', 'utf8');
    const checksum = createHash('sha256').update(bytes).digest('hex');
    expect(artifact.metadata.checksumSha256).toBe(checksum);
    expect(artifact.metadata.byteSize).toBe(bytes.byteLength);
    expect(artifact.content?.bytesBase64).toBe(bytes.toString('base64'));
  });

  it('rejects unsupported formats', () => {
    const renderer = new HtmlMarkupRenderer({
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      createArtifactId: () => 'artifact_fixed_11'
    });

    expect(() => renderer.validate(createRequest({ options: { format: 'markdown', theme: 'classic' } }))).toThrow(UnsupportedRenderFormatError);
    expect(() => renderer.validate(createRequest({ options: { format: 'pdf', theme: 'classic' } }))).toThrow(UnsupportedRenderFormatError);
    expect(() => renderer.validate(createRequest({ options: { format: 'epub', theme: 'classic' } }))).toThrow(UnsupportedRenderFormatError);
    expect(() => renderer.validate(createRequest({ options: { format: 'docx', theme: 'classic' } }))).toThrow(UnsupportedRenderFormatError);
  });

  it('rejects unsupported themes, metadata mismatch, token incompatibility, and invalid assets', () => {
    const renderer = new HtmlMarkupRenderer({
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      createArtifactId: () => 'artifact_fixed_12'
    });

    expect(() => renderer.validate(createRequest({ options: { format: 'html', theme: 'unknown-theme' as never } }))).toThrow(UnsupportedRenderThemeError);

    expect(() => renderer.validate(createRequest({
      metadata: { ...createRequest().metadata, theme: 'modern' },
      options: { format: 'html', theme: 'classic' }
    }))).toThrow(RenderValidationError);

    const badToken = createRequest();
    (badToken.htmlDocument.metadata.styleTokens as Array<{ category: string; value: string }>).push({
      category: 'unsupported-category',
      value: 'x'
    });
    expect(() => renderer.validate(badToken)).toThrow(RenderValidationError);

    const badAsset = createRequest();
    badAsset.metadata.coverImageReference = 'javascript:alert(1)';
    expect(() => renderer.validate(badAsset)).toThrow(InvalidRenderAssetError);
  });

  it('does not fall back to structured-json representation', () => {
    const renderer = new HtmlMarkupRenderer({
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      createArtifactId: () => 'artifact_fixed_13'
    });

    const artifact = renderer.render(createRequest());
    expect(artifact.metadata.payloadRepresentation).not.toBe('structured-json');
    expect(artifact.metadata.mimeType).not.toBe('application/json');
    expect(artifact.metadata.fileExtension).not.toBe('.json');
  });
});
