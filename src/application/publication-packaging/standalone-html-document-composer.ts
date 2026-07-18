import { escapeAttribute, escapeTitle } from '../rendering/html-escaping.js';
import {
  InvalidSerializedHtmlDocumentError,
  UnsafeStandaloneHtmlError
} from './errors.js';
import type {
  SerializedHtmlAttribute,
  SerializedHtmlDocument,
  SerializedHtmlMetadata
} from './types.js';
import { canonicalHtmlDoctype } from './types.js';

export type ReservedMetadataPolicy = 'preserve' | 'exclude';

export type StandaloneHtmlDocumentCompositionInput = {
  readonly document: SerializedHtmlDocument;
  readonly bodyAttributes?: readonly SerializedHtmlAttribute[];
  readonly embeddedStylesheetCss?: string | null;
  readonly colorScheme?: 'light' | 'dark' | null;
  readonly reservedMetadataPolicy?: ReservedMetadataPolicy;
};

const RESERVED_METADATA_NAMES = new Set(['viewport', 'color-scheme']);
const BODY_FORBIDDEN_HTML_PATTERNS = [
  /<script\b/i,
  /<style\b/i,
  /<link\b/i,
  /<meta\b/i,
  /<html\b/i,
  /<head\b/i,
  /<body\b/i,
  /\son[a-z]+\s*=/i
] as const;

function serializeAttributes(attributes: readonly SerializedHtmlAttribute[]): string {
  if (attributes.length === 0) {
    return '';
  }

  for (const attribute of attributes) {
    if (attribute.name.trim().toLowerCase().startsWith('on')) {
      throw new UnsafeStandaloneHtmlError('Standalone document attributes are invalid.');
    }
  }

  return ` ${attributes.map((attribute) => `${attribute.name}="${escapeAttribute(attribute.value)}"`).join(' ')}`;
}

function normalizeMetadataEntries(
  metadata: readonly SerializedHtmlMetadata[],
  policy: ReservedMetadataPolicy
): readonly SerializedHtmlMetadata[] {
  if (policy === 'preserve') {
    return metadata.map((entry) => ({ name: entry.name, content: entry.content }));
  }

  return metadata
    .filter((entry) => !RESERVED_METADATA_NAMES.has(entry.name.trim().toLowerCase()))
    .map((entry) => ({ name: entry.name, content: entry.content }));
}

function assertSafeBodyHtml(bodyHtml: string): void {
  for (const pattern of BODY_FORBIDDEN_HTML_PATTERNS) {
    if (pattern.test(bodyHtml)) {
      throw new UnsafeStandaloneHtmlError('Standalone document body content is invalid.');
    }
  }
}

function assertSafeEmbeddedCss(css: string): void {
  if (/<\/style/i.test(css)) {
    throw new UnsafeStandaloneHtmlError('Embedded stylesheet content is invalid.');
  }
}

export class StandaloneHtmlDocumentComposer {
  public compose(input: StandaloneHtmlDocumentCompositionInput): string {
    if (input.document.doctype !== canonicalHtmlDoctype) {
      throw new InvalidSerializedHtmlDocumentError('Serialized HTML doctype is invalid.');
    }

    const reservedMetadataPolicy = input.reservedMetadataPolicy ?? 'exclude';
    const htmlAttributes = input.document.htmlAttributes.map((attribute) => ({
      name: attribute.name,
      value: attribute.value
    }));
    const bodyAttributes = (input.bodyAttributes ?? []).map((attribute) => ({
      name: attribute.name,
      value: attribute.value
    }));
    const metadataEntries = normalizeMetadataEntries(input.document.head.metadata, reservedMetadataPolicy);
    const bodyHtml = input.document.bodyHtml;

    assertSafeBodyHtml(bodyHtml);

    const metaTags = [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      ...metadataEntries.map((entry) => `<meta name="${escapeAttribute(entry.name)}" content="${escapeAttribute(entry.content)}">`),
      ...(input.colorScheme ? [`<meta name="color-scheme" content="${escapeAttribute(input.colorScheme)}">`] : [])
    ].join('');

    const embeddedStylesheetCss = input.embeddedStylesheetCss ?? null;
    if (embeddedStylesheetCss !== null) {
      assertSafeEmbeddedCss(embeddedStylesheetCss);
    }

    const styleTag = embeddedStylesheetCss === null
      ? ''
      : `<style>${embeddedStylesheetCss}</style>`;

    return `${canonicalHtmlDoctype}\n`
      + `<html${serializeAttributes(htmlAttributes)}>\n`
      + '<head>'
      + metaTags
      + `<title>${escapeTitle(input.document.head.title)}</title>`
      + styleTag
      + '</head>\n'
      + `<body${serializeAttributes(bodyAttributes)}>`
      + bodyHtml
      + '</body>\n'
      + '</html>\n';
  }
}
