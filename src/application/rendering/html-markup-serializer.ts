import type {
  HtmlDocument,
  HtmlElement,
  HtmlNode,
  HtmlStyleToken
} from '../../domain/publications/html-types.js';
import {
  assertSafeAssetUrl,
  assertSafeExternalUrl,
  assertSafeInternalHref
} from '../../platform/security/url-safety.js';
import { escapeAttribute, escapeText, escapeTitle } from './html-escaping.js';

const VOID_TAGS = new Set(['hr', 'img']);

const TAG_BASE_CLASS_MAP: Readonly<Record<string, readonly string[]>> = {
  article: ['publication'],
  main: ['publication-main'],
  section: ['publication-section'],
  nav: ['publication-navigation'],
  p: ['publication-paragraph'],
  figure: ['publication-figure'],
  figcaption: ['publication-caption'],
  ul: ['publication-list'],
  ol: ['publication-list'],
  table: ['publication-table'],
  h1: ['publication-heading'],
  h2: ['publication-heading'],
  h3: ['publication-heading'],
  h4: ['publication-heading'],
  h5: ['publication-heading'],
  h6: ['publication-heading']
};

const BLOCK_HOOKS: Readonly<Record<string, readonly string[]>> = {
  reflection: ['publication-block', 'publication-reflection'],
  'call-to-action': ['publication-block', 'publication-call-to-action'],
  prayer: ['publication-block', 'publication-prayer'],
  'journal-prompt': ['publication-block', 'publication-journal-prompt'],
  sidebar: ['publication-block', 'publication-sidebar'],
  'key-takeaway': ['publication-block', 'publication-key-takeaway'],
  warning: ['publication-block', 'publication-warning'],
  highlight: ['publication-block', 'publication-highlight'],
  scripture: ['publication-block', 'publication-scripture']
};

const CONTROLLED_ATTRIBUTE_ORDER: readonly string[] = [
  'id',
  'class',
  'lang',
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'href',
  'src',
  'alt',
  'title',
  'target',
  'rel',
  'scope',
  'colspan',
  'rowspan',
  'loading',
  'decoding',
  'referrerpolicy',
  'data-publication-block',
  'data-reference-id',
  'data-citation-id',
  'data-footnote-id'
];

type OutputAttributeMap = Partial<Record<(typeof CONTROLLED_ATTRIBUTE_ORDER)[number], string>>;

function normalizeClasses(classes: readonly string[]): string[] {
  return [...new Set(classes)].sort((a, b) => a.localeCompare(b));
}

function normalizeStyleTokenClasses(tokens: readonly HtmlStyleToken[]): string[] {
  const tokenClasses = tokens.map((token) => {
    const category = token.category.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const value = String(token.value).replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    return `token-${category}-${value}`;
  });

  return normalizeClasses(tokenClasses);
}

function validateAndNormalizeUrl(input: { tag: string; attribute: 'href' | 'src'; value: string }): string {
  const { tag, attribute, value } = input;

  if (attribute === 'href') {
    if (value.startsWith('#')) {
      return assertSafeInternalHref(value);
    }

    return assertSafeExternalUrl(value);
  }

  if (tag === 'img') {
    return assertSafeAssetUrl(value);
  }

  return assertSafeExternalUrl(value);
}

function createControlledAttributes(input: {
  node: HtmlElement;
  language: string;
  idSet: Set<string>;
}): OutputAttributeMap {
  const { node, language, idSet } = input;
  const attributes: OutputAttributeMap = {};

  if (node.id !== null) {
    if (idSet.has(node.id)) {
      throw new Error('Duplicate HTML ID detected during serialization.');
    }

    idSet.add(node.id);
    attributes.id = node.id;
  }

  const controlledClasses: string[] = [];

  const baseClasses = TAG_BASE_CLASS_MAP[node.tag];
  if (baseClasses) {
    controlledClasses.push(...baseClasses);
  }

  const blockType = node.attributes.dataPublicationBlock;
  if (blockType) {
    controlledClasses.push(...(BLOCK_HOOKS[blockType] ?? []));
  }

  controlledClasses.push(...node.classList.map((entry) => `class-${entry}`));
  controlledClasses.push(...normalizeStyleTokenClasses(node.styleTokens));

  const normalizedClasses = normalizeClasses(controlledClasses);
  if (normalizedClasses.length > 0) {
    attributes.class = normalizedClasses.join(' ');
  }

  if (node.tag === 'html') {
    attributes.lang = language;
  }

  if (node.role) {
    attributes.role = node.role;
  }

  if (node.ariaLabel) {
    attributes['aria-label'] = node.ariaLabel;
  }

  if (node.attributes.ariaLabelledBy) {
    attributes['aria-labelledby'] = node.attributes.ariaLabelledBy;
  }

  if (node.attributes.ariaDescribedBy) {
    attributes['aria-describedby'] = node.attributes.ariaDescribedBy;
  }

  if (node.attributes.href) {
    attributes.href = validateAndNormalizeUrl({
      tag: node.tag,
      attribute: 'href',
      value: node.attributes.href
    });
  }

  if (node.attributes.src) {
    attributes.src = validateAndNormalizeUrl({
      tag: node.tag,
      attribute: 'src',
      value: node.attributes.src
    });
  }

  if (node.attributes.alt) {
    attributes.alt = node.attributes.alt;
  }

  if (node.attributes.title) {
    attributes.title = node.attributes.title;
  }

  if (node.attributes.target) {
    attributes.target = node.attributes.target;
  }

  if (node.attributes.rel) {
    attributes.rel = node.attributes.rel;
  }

  if (node.attributes.scope) {
    attributes.scope = node.attributes.scope;
  }

  if (node.attributes.colspan) {
    attributes.colspan = node.attributes.colspan;
  }

  if (node.attributes.rowspan) {
    attributes.rowspan = node.attributes.rowspan;
  }

  if (node.attributes.loading) {
    attributes.loading = node.attributes.loading;
  }

  if (node.attributes.decoding) {
    attributes.decoding = node.attributes.decoding;
  }

  if (node.attributes.referrerpolicy) {
    attributes.referrerpolicy = node.attributes.referrerpolicy;
  }

  if (node.attributes.dataPublicationBlock) {
    attributes['data-publication-block'] = node.attributes.dataPublicationBlock;
  }

  if (node.attributes.dataReferenceId) {
    attributes['data-reference-id'] = node.attributes.dataReferenceId;
  }

  if (node.attributes.dataCitationId) {
    attributes['data-citation-id'] = node.attributes.dataCitationId;
  }

  if (node.attributes.dataFootnoteId) {
    attributes['data-footnote-id'] = node.attributes.dataFootnoteId;
  }

  return attributes;
}

function serializeAttributes(attributes: OutputAttributeMap): string {
  const entries: string[] = [];

  for (const key of CONTROLLED_ATTRIBUTE_ORDER) {
    const value = attributes[key];
    if (value === undefined) {
      continue;
    }

    if (key.startsWith('on')) {
      throw new Error('Event handler attributes are not allowed.');
    }

    entries.push(`${key}="${escapeAttribute(value)}"`);
  }

  return entries.length === 0 ? '' : ` ${entries.join(' ')}`;
}

function serializeNode(node: HtmlNode, language: string, idSet: Set<string>): string {
  if (node.nodeType === 'text') {
    return escapeText(node.text);
  }

  if (node.tag === 'script' || node.tag === 'iframe' || node.tag === 'object' || node.tag === 'embed' || node.tag === 'form') {
    throw new Error('Active content elements are not allowed.');
  }

  const attributes = createControlledAttributes({ node, language, idSet });
  const serializedAttributes = serializeAttributes(attributes);
  const open = `<${node.tag}${serializedAttributes}>`;

  if (VOID_TAGS.has(node.tag)) {
    return open;
  }

  const children = node.children.map((child) => serializeNode(child, language, idSet)).join('');
  return `${open}${children}</${node.tag}>`;
}

function extractMainNodes(document: HtmlDocument): readonly HtmlElement[] {
  const mains: HtmlElement[] = [];

  const walk = (node: HtmlNode): void => {
    if (node.nodeType === 'text') {
      return;
    }

    if (node.tag === 'main') {
      mains.push(node);
    }

    for (const child of node.children) {
      walk(child);
    }
  };

  for (const section of document.body.sections) {
    for (const element of section.elements) {
      walk(element);
    }
  }

  return mains;
}

function hasNonEmptyToc(document: HtmlDocument): boolean {
  const isTocNav = (element: HtmlElement): boolean => {
    if (element.tag === 'nav' && (element.id === 'table-of-contents' || element.classList.includes('toc'))) {
      return element.children.length > 0;
    }

    return element.children.some((child) => child.nodeType === 'element' && isTocNav(child));
  };

  return document.body.sections.some((section) => section.elements.some(isTocNav));
}

export class HtmlMarkupSerializer {
  public serialize(document: HtmlDocument): string {
    const idSet = new Set<string>();
    const mainNodes = extractMainNodes(document);

    if (mainNodes.length !== 1) {
      throw new Error('Serialized HTML must contain exactly one main element.');
    }

    const mainNode = mainNodes[0];
    if (!mainNode) {
      throw new Error('Serialized HTML must contain exactly one main element.');
    }
    const hasMeaningfulMainContent = mainNode.children.length > 0;

    if (!hasMeaningfulMainContent) {
      throw new Error('Serialized HTML main element must contain meaningful content.');
    }

    const bodyContent = document.body.sections
      .map((section) => section.elements.map((element) => serializeNode(element, document.head.lang, idSet)).join(''))
      .join('');

    const metaTags = [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      ...document.head.metadata.map((entry) => `<meta name="${escapeAttribute(entry.name)}" content="${escapeAttribute(entry.content)}">`)
    ].join('');

    const title = `<title>${escapeTitle(document.head.title)}</title>`;

    const html =
      '<!doctype html>\n'
      + `<html lang="${escapeAttribute(document.head.lang)}">\n`
      + '<head>'
      + metaTags
      + title
      + '</head>\n'
      + '<body>'
      + bodyContent
      + '</body>\n'
      + '</html>\n';

    if (!hasNonEmptyToc(document)) {
      return html.replace(/<nav[^>]*><\/nav>/g, '');
    }

    return html;
  }
}
