import { htmlDocumentSchema } from '../../schemas/publications/html-document-schema.js';
import {
  PublicationCssPackager,
  PublicationThemeRegistry,
  ThemeModuleError,
  publicationCssPackager,
  publicationThemeRegistry
} from '../themes/index.js';
import { HtmlMarkupSerializer } from '../rendering/html-markup-serializer.js';
import {
  CssPackagingError,
  HtmlSerializationError,
  InvalidPublicationPackageCompositionInputError,
  InvalidSerializedHtmlDocumentError,
  InvalidStandaloneHtmlDocumentInvariantError,
  InvalidPublicationLanguageError,
  MissingPublicationTitleError
} from './errors.js';
import { resolvePublicationPresentation } from './defaults.js';
import { StandaloneHtmlDocumentComposer } from './standalone-html-document-composer.js';
import type {
  ComposedPublicationPackage,
  PublicationPackageCompositionInput,
  SerializedHtmlDocument
} from './types.js';

export type PublicationPackageComposerDependencies = {
  readonly serializer?: HtmlMarkupSerializer;
  readonly themeRegistry?: PublicationThemeRegistry;
  readonly cssPackager?: PublicationCssPackager;
  readonly standaloneComposer?: StandaloneHtmlDocumentComposer;
};

const HTML_FORBIDDEN_PATTERNS = [
  /<script\b/i,
  /\son[a-z]+\s*=/i,
  /<link\b[^>]*rel\s*=\s*["']?stylesheet/i,
  /<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i
] as const;

function countMatches(input: string, pattern: RegExp): number {
  return [...input.matchAll(new RegExp(pattern.source, `${pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`}`))].length;
}

function assertValidCompositionInput(input: PublicationPackageCompositionInput): void {
  const parsed = htmlDocumentSchema.safeParse(input.document);
  if (!parsed.success) {
    throw new InvalidPublicationPackageCompositionInputError(undefined, { cause: parsed.error });
  }

  if (input.document.head.title.length === 0) {
    throw new MissingPublicationTitleError();
  }

  if (input.document.head.lang.length < 2) {
    throw new InvalidPublicationLanguageError();
  }
}

function assertSerializedDocumentParts(parts: SerializedHtmlDocument): void {
  if (parts.doctype !== '<!doctype html>') {
    throw new InvalidSerializedHtmlDocumentError('Serialized HTML doctype is invalid.');
  }

  if (parts.head.title.length === 0) {
    throw new MissingPublicationTitleError();
  }

  const htmlLang = parts.htmlAttributes.find((attribute) => attribute.name === 'lang');
  if (!htmlLang || htmlLang.value.length < 2) {
    throw new InvalidPublicationLanguageError();
  }
}

function assertStandaloneHtmlInvariants(html: string): void {
  const invariants = [
    { pattern: /<!doctype html>/i, count: 1, message: 'Standalone HTML must contain exactly one doctype.' },
    { pattern: /<html\b/gi, count: 1, message: 'Standalone HTML must contain exactly one html element.' },
    { pattern: /<head>/gi, count: 1, message: 'Standalone HTML must contain exactly one head element.' },
    { pattern: /<body\b/gi, count: 1, message: 'Standalone HTML must contain exactly one body element.' },
    { pattern: /<title>/gi, count: 1, message: 'Standalone HTML must contain exactly one title element.' },
    { pattern: /<style>/gi, count: 1, message: 'Standalone HTML must contain exactly one embedded style element.' }
  ] as const;

  for (const invariant of invariants) {
    if (countMatches(html, invariant.pattern) !== invariant.count) {
      throw new InvalidStandaloneHtmlDocumentInvariantError(invariant.message);
    }
  }

  for (const pattern of HTML_FORBIDDEN_PATTERNS) {
    if (pattern.test(html)) {
      throw new InvalidStandaloneHtmlDocumentInvariantError('Standalone HTML contains prohibited active content or external resource tags.');
    }
  }

  if (html.includes('\r')) {
    throw new InvalidStandaloneHtmlDocumentInvariantError('Standalone HTML must use LF newlines only.');
  }

  const lines = html.split('\n');
  for (const line of lines) {
    if (/[ \t]+$/.test(line)) {
      throw new InvalidStandaloneHtmlDocumentInvariantError('Standalone HTML must not contain trailing whitespace.');
    }
  }
}

export class PublicationPackageComposer {
  private readonly serializer: HtmlMarkupSerializer;
  private readonly themeRegistry: PublicationThemeRegistry;
  private readonly cssPackager: PublicationCssPackager;
  private readonly standaloneComposer: StandaloneHtmlDocumentComposer;

  public constructor(dependencies?: PublicationPackageComposerDependencies) {
    this.serializer = dependencies?.serializer ?? new HtmlMarkupSerializer();
    this.themeRegistry = dependencies?.themeRegistry ?? publicationThemeRegistry;
    this.cssPackager = dependencies?.cssPackager ?? publicationCssPackager;
    this.standaloneComposer = dependencies?.standaloneComposer ?? new StandaloneHtmlDocumentComposer();
  }

  public compose(input: PublicationPackageCompositionInput): ComposedPublicationPackage {
    assertValidCompositionInput(input);

    const presentation = resolvePublicationPresentation({
      composition: input,
      colorScheme: this.themeRegistry.getTheme(input.themeId ?? input.document.theme).colorScheme
    });

    let serializedParts: SerializedHtmlDocument;
    try {
      serializedParts = this.serializer.serializeDocumentParts(input.document);
    } catch (error) {
      throw new HtmlSerializationError({ cause: error });
    }

    assertSerializedDocumentParts(serializedParts);

    const serializedHtmlDocument = this.standaloneComposer.compose({
      document: serializedParts,
      reservedMetadataPolicy: 'preserve'
    });

    let packagedStylesheetCss: string;
    try {
      packagedStylesheetCss = this.cssPackager.package({
        themeId: presentation.themeId,
        densityId: presentation.densityId,
        layoutId: presentation.layoutId
      });
    } catch (error) {
      if (error instanceof ThemeModuleError) {
        throw error;
      }

      throw new CssPackagingError({ cause: error });
    }

    const standaloneHtmlDocument = this.standaloneComposer.compose({
      document: serializedParts,
      reservedMetadataPolicy: 'exclude',
      colorScheme: presentation.colorScheme,
      embeddedStylesheetCss: packagedStylesheetCss,
      bodyAttributes: [
        { name: 'data-publication-theme', value: presentation.themeId },
        { name: 'data-publication-density', value: presentation.densityId },
        { name: 'data-publication-layout', value: presentation.layoutId }
      ]
    });

    assertStandaloneHtmlInvariants(standaloneHtmlDocument);

    return {
      serializedHtmlDocument,
      packagedStylesheetCss,
      standaloneHtmlDocument,
      presentation
    };
  }
}

export const publicationPackageComposer = new PublicationPackageComposer();
