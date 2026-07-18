import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  StyledHtmlRenderer,
  RenderFailedError,
  RenderValidationError,
  UnsupportedRenderFormatError
} from '../../../src/application/rendering/index.js';
import { PublicationPackageComposer } from '../../../src/application/publication-packaging/index.js';
import type { RenderRequest } from '../../../src/domain/rendering/types.js';

function createHtmlDocument() {
  return {
    schemaVersion: '1.0' as const,
    metadata: {
      publicationId: 'pub_1',
      publicationType: 'cta-guide' as const,
      title: 'RoaM & Review café مرحبا ✅',
      description: 'Description',
      language: 'en',
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceVersionId: 'srcver_01TEST',
      sourceContentHash: 'hash_1',
      audience: 'general',
      theme: 'classic' as const,
      styleTokens: [{ category: 'page-intent' as const, value: 'reading' as const }],
      assetReferences: []
    },
    theme: 'classic' as const,
    head: {
      title: 'RoaM & Review café مرحبا ✅',
      lang: 'en',
      metadata: [{ name: 'description', content: 'Description' }],
      styleTokens: [{ category: 'page-intent' as const, value: 'reading' as const }]
    },
    body: {
      skipNavigationTargetId: 'main-content',
      sections: [
        {
          id: 'document-root',
          title: 'Root',
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
                      elementType: 'heading' as const,
                      id: 'heading-1',
                      tag: 'h1' as const,
                      level: 1 as const,
                      attributes: {},
                      classList: ['section-title'] as const,
                      ariaLabel: null,
                      role: null,
                      styleTokens: [{ category: 'heading-intent' as const, value: 'document-title' as const }],
                      children: [{ nodeType: 'text' as const, text: 'Heading ✓' }]
                    },
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
                      children: [{ nodeType: 'text' as const, text: 'Paragraph with emoji 🚀 and RTL مرحبا.' }]
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
      title: 'RoaM & Review café مرحبا ✅',
      subtitle: 'Subtitle',
      author: 'Author',
      speaker: null,
      organization: 'Org',
      publicationDate: '2026-01-01T00:00:00.000Z',
      language: 'en',
      theme: 'classic',
      keywords: ['one', 'two'],
      description: 'Description',
      coverImageReference: null,
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

describe('styled html renderer', () => {
  it('identifies the styled-html representation and delegates to the publication package composer', () => {
    const composer = new PublicationPackageComposer();
    const composeSpy = vi.spyOn(composer, 'compose');
    const renderer = new StyledHtmlRenderer({
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      createArtifactId: () => 'artifact_styled_1',
      packageComposer: composer
    });

    expect(renderer.getCapabilities().renderer).toBe('styled-html');

    const request = createRequest({
      options: {
        format: 'html',
        theme: 'classic',
        presentation: {
          themeId: 'dark',
          densityId: 'compact',
          layoutId: 'two-column'
        }
      }
    });

    const artifact = renderer.render(request);

    expect(composeSpy).toHaveBeenCalledTimes(1);
    expect(composeSpy).toHaveBeenCalledWith({
      document: request.htmlDocument,
      themeId: 'dark',
      densityId: 'compact',
      layoutId: 'two-column'
    });
    expect(artifact.metadata.payloadRepresentation).toBe('styled-html');
    expect(artifact.metadata.mimeType).toBe('text/html; charset=utf-8');
    expect(artifact.metadata.fileExtension).toBe('.html');
    expect(artifact.content?.serializedDocument).toContain('data-publication-theme="dark"');
  });

  it('returns the composed standalone document with exact utf-8 byte accounting', () => {
    const renderer = new StyledHtmlRenderer({
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      createArtifactId: () => 'artifact_styled_2'
    });

    const artifact = renderer.render(createRequest());
    const payload = artifact.content?.serializedDocument ?? '';
    const bytes = Buffer.from(payload, 'utf8');

    expect(payload.startsWith('<!doctype html>')).toBe(true);
    expect((payload.match(/<style>/g) ?? [])).toHaveLength(1);
    expect(payload).toContain('data-publication-theme="classic"');
    expect(payload).toContain('data-publication-density="standard"');
    expect(payload).toContain('data-publication-layout="single-column"');
    expect(payload).toContain('color-scheme');
    expect(payload).not.toContain('<script');
    expect(payload).not.toContain('<link rel="stylesheet"');
    expect(payload).not.toContain('@page');
    expect(payload).toContain('RoaM &amp; Review café مرحبا ✅');

    expect(artifact.metadata.byteSize).toBe(bytes.byteLength);
    expect(artifact.metadata.checksumSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(artifact.content?.bytesBase64).toBe(bytes.toString('base64'));
  });

  it('is deterministic for identical inputs and changes when presentation ids change', () => {
    const renderer = new StyledHtmlRenderer({
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      createArtifactId: () => 'artifact_styled_3'
    });

    const baselineRequest = createRequest();
    const baseline = renderer.render(baselineRequest);
    const repeat = renderer.render(baselineRequest);

    expect(repeat.content?.serializedDocument).toBe(baseline.content?.serializedDocument);
    expect(repeat.metadata.checksumSha256).toBe(baseline.metadata.checksumSha256);
    expect(repeat.metadata.byteSize).toBe(baseline.metadata.byteSize);

    const darkTheme = renderer.render(createRequest({
      options: {
        format: 'html',
        theme: 'classic',
        presentation: { themeId: 'dark' }
      }
    }));

    const compactDensity = renderer.render(createRequest({
      options: {
        format: 'html',
        theme: 'classic',
        presentation: { densityId: 'compact' }
      }
    }));

    const twoColumnLayout = renderer.render(createRequest({
      options: {
        format: 'html',
        theme: 'classic',
        presentation: { layoutId: 'two-column' }
      }
    }));

    expect(darkTheme.content?.serializedDocument).not.toBe(baseline.content?.serializedDocument);
    expect(darkTheme.metadata.checksumSha256).not.toBe(baseline.metadata.checksumSha256);
    expect(compactDensity.content?.serializedDocument).not.toBe(baseline.content?.serializedDocument);
    expect(compactDensity.metadata.checksumSha256).not.toBe(baseline.metadata.checksumSha256);
    expect(twoColumnLayout.content?.serializedDocument).not.toBe(baseline.content?.serializedDocument);
    expect(twoColumnLayout.metadata.checksumSha256).not.toBe(baseline.metadata.checksumSha256);
  });

  it('rejects invalid presentation ids and keeps input immutable', () => {
    const renderer = new StyledHtmlRenderer({
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      createArtifactId: () => 'artifact_styled_4'
    });

    expect(() => renderer.render(createRequest({
      options: {
        format: 'html',
        theme: 'classic',
        presentation: { themeId: 'unknown' as never }
      }
    }))).toThrow(RenderValidationError);

    expect(() => renderer.render(createRequest({
      options: {
        format: 'html',
        theme: 'classic',
        presentation: { densityId: 'unknown' as never }
      }
    }))).toThrow(RenderValidationError);

    expect(() => renderer.render(createRequest({
      options: {
        format: 'html',
        theme: 'classic',
        presentation: { layoutId: 'unknown' as never }
      }
    }))).toThrow(RenderValidationError);

    const request = createRequest();
    const original = structuredClone(request);
    renderer.render(request);
    expect(request).toEqual(original);
  });

  it('surfaces composition failures as controlled render failures', () => {
    const composer = {
      compose: vi.fn(() => {
        throw new Error('composition exploded');
      })
    } as unknown as PublicationPackageComposer;

    const renderer = new StyledHtmlRenderer({
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      createArtifactId: () => 'artifact_styled_5',
      packageComposer: composer
    });

    expect(() => renderer.render(createRequest())).toThrow(RenderFailedError);
  });

  it('rejects unsupported format requests and preserves explicit renderer semantics', () => {
    const renderer = new StyledHtmlRenderer({
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      createArtifactId: () => 'artifact_styled_6'
    });

    expect(renderer.supports('html')).toBe(true);
    expect(renderer.supports('pdf')).toBe(false);
    expect(renderer.supportedFormats()).toEqual(['html']);
    expect(renderer.supportedThemes()).toEqual([
      'classic',
      'modern',
      'ministry',
      'workbook',
      'magazine',
      'dark',
      'minimal'
    ]);

    expect(() => renderer.render(createRequest({
      options: {
        format: 'pdf',
        theme: 'classic'
      }
    }))).toThrow(UnsupportedRenderFormatError);
  });
});