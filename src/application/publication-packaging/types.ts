import type { HtmlDocument } from '../../domain/publications/html-types.js';
import type {
  PublicationDensityId,
  PublicationLayoutId,
  PublicationThemeId,
  ThemeColorScheme
} from '../themes/types.js';

export const canonicalHtmlDoctype = '<!doctype html>' as const;

export type SerializedHtmlAttribute = {
  readonly name: string;
  readonly value: string;
};

export type SerializedHtmlMetadata = {
  readonly name: string;
  readonly content: string;
};

export type SerializedHtmlDocument = {
  readonly doctype: typeof canonicalHtmlDoctype;
  readonly htmlAttributes: readonly SerializedHtmlAttribute[];
  readonly head: {
    readonly title: string;
    readonly metadata: readonly SerializedHtmlMetadata[];
  };
  readonly bodyHtml: string;
};

export type PublicationPackageCompositionInput = {
  readonly document: HtmlDocument;
  readonly themeId?: PublicationThemeId;
  readonly densityId?: PublicationDensityId;
  readonly layoutId?: PublicationLayoutId;
};

export type ResolvedPublicationPresentation = {
  readonly themeId: PublicationThemeId;
  readonly densityId: PublicationDensityId;
  readonly layoutId: PublicationLayoutId;
  readonly colorScheme: ThemeColorScheme;
};

export type ComposedPublicationPackage = {
  readonly serializedHtmlDocument: string;
  readonly packagedStylesheetCss: string;
  readonly standaloneHtmlDocument: string;
  readonly presentation: ResolvedPublicationPresentation;
};
