import { createHash } from 'node:crypto';

import type {
  RenderArtifact,
  RenderFormat,
  RenderRequest,
  RenderTheme,
  RendererCapabilities
} from '../../domain/rendering/types.js';
import { assertSafeAssetUrl } from '../../platform/security/url-safety.js';
import { renderRequestSchema } from '../../schemas/rendering/rendering-schema.js';
import { HtmlMarkupSerializer } from './html-markup-serializer.js';
import type { PublicationRenderer } from './publication-renderer.js';
import {
  InvalidRenderAssetError,
  RenderCancelledError,
  RenderFailedError,
  RenderValidationError,
  UnsupportedRenderFormatError,
  UnsupportedRenderThemeError
} from './renderer-errors.js';

export type HtmlMarkupRendererDependencies = {
  readonly now: () => Date;
  readonly createArtifactId: () => string;
  readonly serializer?: HtmlMarkupSerializer;
};

const CAPABILITIES: RendererCapabilities = {
  renderer: 'html-markup',
  formats: ['html'],
  themes: ['classic', 'modern', 'ministry', 'workbook', 'magazine', 'minimal', 'dark'],
  supportedTokenCategories: [
    'spacing',
    'typography',
    'color-intent',
    'font-role',
    'border-intent',
    'shadow-intent',
    'radius',
    'callout-type',
    'page-intent',
    'section-intent',
    'heading-intent',
    'content-width',
    'image-alignment'
  ]
};

function collectTokenCategories(request: RenderRequest): Set<string> {
  const categories = new Set<string>();

  const visitNode = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const record = node as Record<string, unknown>;
    const tokens = record.styleTokens;
    if (Array.isArray(tokens)) {
      for (const token of tokens) {
        if (token && typeof token === 'object') {
          const category = (token as Record<string, unknown>).category;
          if (typeof category === 'string') {
            categories.add(category);
          }
        }
      }
    }

    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          visitNode(entry);
        }
      } else {
        visitNode(value);
      }
    }
  };

  visitNode(request.htmlDocument);
  return categories;
}

export class HtmlMarkupRenderer implements PublicationRenderer {
  private readonly now: () => Date;
  private readonly createArtifactId: () => string;
  private readonly serializer: HtmlMarkupSerializer;

  constructor(dependencies?: HtmlMarkupRendererDependencies) {
    if (!dependencies?.now || !dependencies?.createArtifactId) {
      throw new Error('HtmlMarkupRenderer requires deterministic now and createArtifactId dependencies.');
    }

    this.now = dependencies.now;
    this.createArtifactId = dependencies.createArtifactId;
    this.serializer = dependencies.serializer ?? new HtmlMarkupSerializer();
  }

  getCapabilities(): RendererCapabilities {
    return {
      renderer: CAPABILITIES.renderer,
      formats: [...CAPABILITIES.formats],
      themes: [...CAPABILITIES.themes],
      supportedTokenCategories: [...CAPABILITIES.supportedTokenCategories]
    };
  }

  supports(format: RenderFormat): boolean {
    return CAPABILITIES.formats.includes(format);
  }

  supportedThemes(): readonly RenderTheme[] {
    return CAPABILITIES.themes;
  }

  supportedFormats(): readonly RenderFormat[] {
    return CAPABILITIES.formats;
  }

  validate(request: RenderRequest): void {
    if (!this.supports(request.options.format)) {
      throw new UnsupportedRenderFormatError();
    }

    if (!CAPABILITIES.themes.includes(request.options.theme)) {
      throw new UnsupportedRenderThemeError();
    }

    const parsed = renderRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new RenderValidationError();
    }

    if (request.metadata.theme !== request.options.theme) {
      throw new RenderValidationError('Metadata theme and render option theme must match.');
    }

    const tokenCategories = collectTokenCategories(request);
    for (const category of tokenCategories) {
      if (!CAPABILITIES.supportedTokenCategories.includes(category as (typeof CAPABILITIES.supportedTokenCategories)[number])) {
        throw new RenderValidationError(`Unsupported style token category: ${category}`);
      }
    }

    for (const reference of request.htmlDocument.metadata.assetReferences) {
      try {
        assertSafeAssetUrl(reference.uri);
      } catch {
        throw new InvalidRenderAssetError();
      }
    }

    if (request.metadata.coverImageReference) {
      try {
        assertSafeAssetUrl(request.metadata.coverImageReference);
      } catch {
        throw new InvalidRenderAssetError();
      }
    }
  }

  render(request: RenderRequest, signal?: AbortSignal): RenderArtifact {
    if (signal?.aborted) {
      throw new RenderCancelledError();
    }

    this.validate(request);

    try {
      const serializedDocument = this.serializer.serialize(request.htmlDocument);
      const bytes = Buffer.from(serializedDocument, 'utf8');
      const checksumSha256 = createHash('sha256').update(bytes).digest('hex');

      return {
        metadata: {
          artifactId: this.createArtifactId(),
          status: 'ready',
          format: request.options.format,
          payloadRepresentation: 'html-markup',
          mimeType: 'text/html; charset=utf-8',
          fileExtension: '.html',
          checksumSha256,
          byteSize: bytes.byteLength,
          createdAt: this.now().toISOString(),
          warnings: [],
          errors: []
        },
        content: {
          kind: 'inline',
          encoding: 'utf-8',
          bytesBase64: bytes.toString('base64'),
          serializedDocument
        },
        storage: {
          kind: 'none'
        }
      };
    } catch (error) {
      if (
        error instanceof RenderCancelledError ||
        error instanceof RenderValidationError ||
        error instanceof UnsupportedRenderFormatError ||
        error instanceof UnsupportedRenderThemeError ||
        error instanceof InvalidRenderAssetError
      ) {
        throw error;
      }

      throw new RenderFailedError('HTML markup rendering failed.', { cause: error });
    }
  }
}
