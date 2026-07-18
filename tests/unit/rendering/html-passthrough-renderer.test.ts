import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  HtmlPassthroughRenderer,
  InvalidRenderAssetError,
  RenderValidationError,
  UnsupportedRenderFormatError,
  UnsupportedRenderThemeError
} from '../../../src/application/rendering/index.js';
import type { RenderRequest } from '../../../src/domain/rendering/types.js';
import { htmlDocumentSchema } from '../../../src/schemas/publications/html-document-schema.js';

function createRenderer() {
  return new HtmlPassthroughRenderer({
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    createArtifactId: () => 'artifact_fixed_01'
  });
}

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
                  elementType: 'heading' as const,
                  id: 'heading-1',
                  tag: 'h1' as const,
                  level: 1 as const,
                  attributes: {},
                  classList: ['section-title'] as const,
                  ariaLabel: null,
                  role: null,
                  styleTokens: [
                    { category: 'typography' as const, value: 'heading' as const },
                    { category: 'heading-intent' as const, value: 'document-title' as const }
                  ],
                  children: [{ nodeType: 'text' as const, text: 'Title' }]
                },
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

describe('html passthrough renderer', () => {
  it('cannot be constructed without deterministic clock and artifact id dependencies', () => {
    expect(() => new HtmlPassthroughRenderer()).toThrow(
      'HtmlPassthroughRenderer requires deterministic now and createArtifactId dependencies.'
    );
  });

  it('exposes renderer interface contract and capabilities', () => {
    const renderer = createRenderer();
    const capabilities = renderer.getCapabilities();

    expect(typeof renderer.render).toBe('function');
    expect(typeof renderer.validate).toBe('function');
    expect(typeof renderer.supports).toBe('function');
    expect(renderer.supportedFormats()).toEqual(['html']);
    expect(renderer.supportedThemes()).toEqual([
      'classic',
      'modern',
      'ministry',
      'workbook',
      'magazine',
      'minimal',
      'dark'
    ]);
    expect(capabilities.renderer).toBe('html-passthrough');
    expect(capabilities.formats).toEqual(['html']);
    expect(renderer.supports('html')).toBe(true);
    expect(renderer.supports('pdf')).toBe(false);
  });

  it('rejects unsupported pdf format requests', () => {
    const renderer = createRenderer();
    const request = createRequest({
      options: { format: 'pdf', theme: 'classic' }
    });

    expect(() => renderer.validate(request)).toThrow(UnsupportedRenderFormatError);
  });

  it('rejects unsupported epub format requests', () => {
    const renderer = createRenderer();
    const request = createRequest({
      options: { format: 'epub', theme: 'classic' }
    });

    expect(() => renderer.validate(request)).toThrow(UnsupportedRenderFormatError);
  });

  it('rejects unsupported docx format requests', () => {
    const renderer = createRenderer();
    const request = createRequest({
      options: { format: 'docx', theme: 'classic' }
    });

    expect(() => renderer.validate(request)).toThrow(UnsupportedRenderFormatError);
  });

  it('rejects unsupported markdown format requests', () => {
    const renderer = createRenderer();
    const request = createRequest({
      options: { format: 'markdown', theme: 'classic' }
    });

    expect(() => renderer.validate(request)).toThrow(UnsupportedRenderFormatError);
  });

  it('rejects unknown themes', () => {
    const renderer = createRenderer();
    const request = createRequest({
      options: {
        format: 'html',
        theme: 'unknown-theme' as never
      }
    });

    expect(() => renderer.validate(request)).toThrow(UnsupportedRenderThemeError);
  });

  it('rejects metadata/theme mismatch', () => {
    const renderer = createRenderer();
    const request = createRequest({
      metadata: {
        ...createRequest().metadata,
        theme: 'modern'
      },
      options: {
        format: 'html',
        theme: 'classic'
      }
    });

    expect(() => renderer.validate(request)).toThrow(RenderValidationError);
  });

  it('rejects unsupported style token categories', () => {
    const renderer = createRenderer();
    const request = createRequest();
    (request.htmlDocument.metadata.styleTokens as Array<{ category: string; value: string }>).push({
      category: 'unsupported-category',
      value: 'x'
    });

    expect(() => renderer.validate(request)).toThrow(RenderValidationError);
  });

  it('rejects missing required metadata', () => {
    const renderer = createRenderer();
    const request = createRequest({
      metadata: {
        ...createRequest().metadata,
        title: ''
      }
    });

    expect(() => renderer.validate(request)).toThrow(RenderValidationError);
  });

  it('rejects invalid asset references', () => {
    const renderer = createRenderer();
    const request = createRequest();
    request.metadata.coverImageReference = 'javascript:alert(1)';

    expect(() => renderer.validate(request)).toThrow(InvalidRenderAssetError);
  });

  it('rejects malformed asset URLs', () => {
    const renderer = createRenderer();
    const request = createRequest();
    request.metadata.coverImageReference = 'https://example.com:99999';

    expect(() => renderer.validate(request)).toThrow(InvalidRenderAssetError);
  });

  it('serializes validated semantic HTML deterministically as canonical json with exact checksum, byte size, and metadata representation', () => {
    const renderer = createRenderer();

    const request = createRequest();
    const first = renderer.render(request);
    const second = renderer.render(createRequest());

    expect(first).toEqual(second);
    expect(first.metadata.artifactId).toBe('artifact_fixed_01');
    expect(first.metadata.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(first.metadata.format).toBe('html');
    expect(first.metadata.payloadRepresentation).toBe('structured-json');
    expect(first.metadata.mimeType).toBe('application/json');
    expect(first.metadata.fileExtension).toBe('.json');

    const expectedBytes = Buffer.from(first.content?.serializedDocument ?? '', 'utf8');
    const expectedChecksum = createHash('sha256').update(expectedBytes).digest('hex');

    expect(first.content?.encoding).toBe('utf-8');
    expect(first.content?.bytesBase64).toBe(expectedBytes.toString('base64'));
    expect(first.metadata.byteSize).toBe(expectedBytes.byteLength);
    expect(first.metadata.checksumSha256).toBe(expectedChecksum);

    const parsed = JSON.parse(first.content?.serializedDocument ?? '{}');
    expect(htmlDocumentSchema.safeParse(parsed).success).toBe(true);
    expect((first.content?.serializedDocument ?? '').trim().startsWith('<')).toBe(false);
    expect(first.content?.serializedDocument).not.toContain('<html');
  });

  it('does not mutate renderer input', () => {
    const renderer = createRenderer();

    const request = createRequest();
    const original = structuredClone(request);

    renderer.render(request);

    expect(request).toEqual(original);
  });

  it('sanitizes rendering errors and avoids leaking privacy sentinel in output surfaces', () => {
    const renderer = createRenderer();

    const sentinel = 'PRIVATE_RENDER_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST';
    const request = createRequest({
      metadata: {
        ...createRequest().metadata,
        description: sentinel,
        keywords: [sentinel]
      }
    });

    const artifact = renderer.render(request);

    expect(JSON.stringify(artifact.metadata)).not.toContain(sentinel);
    expect(artifact.content?.serializedDocument).not.toContain(sentinel);
    expect(JSON.stringify(artifact.metadata.warnings)).not.toContain(sentinel);
    expect(JSON.stringify(artifact.metadata.errors)).not.toContain(sentinel);

    const checksumFromDocumentOnly = createHash('sha256')
      .update(Buffer.from(artifact.content?.serializedDocument ?? '', 'utf8'))
      .digest('hex');
    expect(artifact.metadata.checksumSha256).toBe(checksumFromDocumentOnly);
  });
});