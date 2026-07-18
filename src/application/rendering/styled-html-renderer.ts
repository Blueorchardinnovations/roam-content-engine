import type {
  RenderArtifact,
  RenderFormat,
  RenderRequest,
  RenderTheme,
  RendererCapabilities
} from '../../domain/rendering/types.js';
import { assertSafeAssetUrl } from '../../platform/security/url-safety.js';
import { renderRequestSchema } from '../../schemas/rendering/rendering-schema.js';
import {
  PublicationPackageComposer,
  publicationPackageComposer,
  type PublicationPackageCompositionInput
} from '../publication-packaging/index.js';
import { PublicationPackagingError } from '../publication-packaging/errors.js';
import { ThemeModuleError } from '../themes/errors.js';
import { publicationThemeIds } from '../themes/types.js';
import type { PublicationRenderer } from './publication-renderer.js';
import { createTextRenderArtifact } from './text-render-artifact-builder.js';
import {
  InvalidRenderAssetError,
  RenderCancelledError,
  RenderFailedError,
  RenderValidationError,
  UnsupportedRenderFormatError,
  UnsupportedRenderThemeError
} from './renderer-errors.js';

export type StyledHtmlRendererDependencies = {
  readonly now: () => Date;
  readonly createArtifactId: () => string;
  readonly packageComposer?: PublicationPackageComposer;
};

const CAPABILITIES: RendererCapabilities = {
  renderer: 'styled-html',
  formats: ['html'],
  themes: [...publicationThemeIds],
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

export class StyledHtmlRenderer implements PublicationRenderer {
  private readonly now: () => Date;
  private readonly createArtifactId: () => string;
  private readonly packageComposer: PublicationPackageComposer;

  public constructor(dependencies?: StyledHtmlRendererDependencies) {
    if (!dependencies?.now || !dependencies?.createArtifactId) {
      throw new Error('StyledHtmlRenderer requires deterministic now and createArtifactId dependencies.');
    }

    this.now = dependencies.now;
    this.createArtifactId = dependencies.createArtifactId;
    this.packageComposer = dependencies.packageComposer ?? publicationPackageComposer;
  }

  public getCapabilities(): RendererCapabilities {
    return {
      renderer: CAPABILITIES.renderer,
      formats: [...CAPABILITIES.formats],
      themes: [...CAPABILITIES.themes],
      supportedTokenCategories: [...CAPABILITIES.supportedTokenCategories]
    };
  }

  public supports(format: RenderFormat): boolean {
    return CAPABILITIES.formats.includes(format);
  }

  public supportedThemes(): readonly RenderTheme[] {
    return CAPABILITIES.themes;
  }

  public supportedFormats(): readonly RenderFormat[] {
    return CAPABILITIES.formats;
  }

  public validate(request: RenderRequest): void {
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

  public render(request: RenderRequest, signal?: AbortSignal): RenderArtifact {
    if (signal?.aborted) {
      throw new RenderCancelledError();
    }

    this.validate(request);

    try {
      const compositionInput: PublicationPackageCompositionInput = {
        document: request.htmlDocument,
        ...(request.options.presentation?.themeId !== undefined ? { themeId: request.options.presentation.themeId } : {}),
        ...(request.options.presentation?.densityId !== undefined ? { densityId: request.options.presentation.densityId } : {}),
        ...(request.options.presentation?.layoutId !== undefined ? { layoutId: request.options.presentation.layoutId } : {})
      };

      const composedPackage = this.packageComposer.compose(compositionInput);

      return createTextRenderArtifact({
        artifactId: this.createArtifactId(),
        createdAt: this.now().toISOString(),
        format: request.options.format,
        payloadRepresentation: 'styled-html',
        mimeType: 'text/html; charset=utf-8',
        fileExtension: '.html',
        serializedDocument: composedPackage.standaloneHtmlDocument
      });
    } catch (error) {
      if (
        error instanceof RenderCancelledError ||
        error instanceof RenderValidationError ||
        error instanceof UnsupportedRenderFormatError ||
        error instanceof UnsupportedRenderThemeError ||
        error instanceof InvalidRenderAssetError ||
        error instanceof ThemeModuleError ||
        error instanceof PublicationPackagingError
      ) {
        throw error;
      }

      throw new RenderFailedError('Styled HTML rendering failed.', { cause: error });
    }
  }
}