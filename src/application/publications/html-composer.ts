import type {
  HtmlCallout,
  HtmlClassList,
  HtmlElement,
  HtmlHeading,
  HtmlImage,
  HtmlList,
  HtmlSection,
  HtmlStyleToken,
  HtmlTable
} from '../../domain/publications/html-types.js';
import type { PublicationTheme } from '../../domain/publications/types.js';
import { htmlDocumentSchema, type HtmlDocument } from '../../schemas/publications/html-document-schema.js';
import { publicationSchema, type Publication } from '../../schemas/publications/publication-schema.js';
import { assertSafeAssetUrl, assertSafeExternalUrl, assertSafeInternalHref } from '../../platform/security/url-safety.js';

import {
  HtmlCancelledError,
  HtmlCompositionError,
  HtmlValidationError,
  UnsupportedHtmlElementError
} from './html-errors.js';

export interface HtmlComposer {
  compose(publication: Publication, signal?: AbortSignal): HtmlDocument;
}

const SINGLE_VALUE_TOKEN_CATEGORIES = new Set<HtmlStyleToken['category']>([
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
]);

const THEME_TOKEN_MAP: Readonly<Record<PublicationTheme, readonly HtmlStyleToken[]>> = {
  classic: [
    { category: 'page-intent', value: 'reading' },
    { category: 'font-role', value: 'reading' },
    { category: 'color-intent', value: 'neutral' },
    { category: 'spacing', value: 'comfortable' },
    { category: 'content-width', value: 'standard' }
  ],
  modern: [
    { category: 'page-intent', value: 'reading' },
    { category: 'font-role', value: 'display' },
    { category: 'color-intent', value: 'accent' },
    { category: 'spacing', value: 'expanded' },
    { category: 'content-width', value: 'wide' }
  ],
  ministry: [
    { category: 'page-intent', value: 'study' },
    { category: 'font-role', value: 'reading' },
    { category: 'color-intent', value: 'brand' },
    { category: 'spacing', value: 'comfortable' },
    { category: 'content-width', value: 'standard' }
  ],
  workbook: [
    { category: 'page-intent', value: 'study' },
    { category: 'font-role', value: 'default' },
    { category: 'color-intent', value: 'neutral' },
    { category: 'spacing', value: 'expanded' },
    { category: 'content-width', value: 'wide' }
  ],
  magazine: [
    { category: 'page-intent', value: 'reading' },
    { category: 'font-role', value: 'display' },
    { category: 'color-intent', value: 'emphasis' },
    { category: 'spacing', value: 'comfortable' },
    { category: 'content-width', value: 'wide' }
  ],
  minimal: [
    { category: 'page-intent', value: 'reference' },
    { category: 'font-role', value: 'default' },
    { category: 'color-intent', value: 'neutral' },
    { category: 'spacing', value: 'compact' },
    { category: 'content-width', value: 'narrow' }
  ],
  dark: [
    { category: 'page-intent', value: 'reading' },
    { category: 'font-role', value: 'reading' },
    { category: 'color-intent', value: 'contrast' },
    { category: 'spacing', value: 'comfortable' },
    { category: 'content-width', value: 'standard' }
  ]
};

function textNode(text: string) {
  return {
    nodeType: 'text' as const,
    text
  };
}

function normalizeTokens(tokens: readonly HtmlStyleToken[]): readonly HtmlStyleToken[] {
  const seenPairs = new Set<string>();
  const seenCategoryValue = new Map<HtmlStyleToken['category'], HtmlStyleToken['value']>();
  const normalized: HtmlStyleToken[] = [];

  for (const token of tokens) {
    const pairKey = `${token.category}:${token.value}`;

    if (seenPairs.has(pairKey)) {
      continue;
    }

    const existingCategory = seenCategoryValue.get(token.category);

    if (existingCategory !== undefined && existingCategory !== token.value && SINGLE_VALUE_TOKEN_CATEGORIES.has(token.category)) {
      throw new HtmlCompositionError(`Conflicting style token values for category ${token.category}.`);
    }

    const tokenValue = String(token.value).toLowerCase();

    if (/(#|px|rem|rgb\(|hsl\(|font-family|var\()/i.test(tokenValue)) {
      throw new HtmlCompositionError('CSS-like style token values are not allowed.');
    }

    seenPairs.add(pairKey);
    seenCategoryValue.set(token.category, token.value);
    normalized.push(token);
  }

  return normalized;
}

function genericElement(input: {
  id?: string;
  tag: HtmlElement['tag'];
  classList?: HtmlClassList;
  children?: ReadonlyArray<ReturnType<typeof textNode> | HtmlElement>;
  ariaLabel?: string;
  role?: string;
  attributes?: HtmlElement['attributes'];
  styleTokens?: readonly HtmlStyleToken[];
}): HtmlElement {
  return {
    nodeType: 'element',
    elementType: 'generic',
    id: input.id ?? null,
    tag: input.tag,
    attributes: input.attributes ?? {},
    classList: input.classList ?? [],
    ariaLabel: input.ariaLabel ?? null,
    role: input.role ?? null,
    styleTokens: normalizeTokens(input.styleTokens ?? []),
    children: input.children ?? []
  };
}

function headingElement(input: {
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  headingIntent: 'document-title' | 'section-title' | 'subsection-title';
}): HtmlHeading {
  const tag = `h${input.level}` as HtmlHeading['tag'];

  return {
    nodeType: 'element',
    elementType: 'heading',
    id: input.id,
    tag,
    level: input.level,
    attributes: {},
    classList: ['section-title'],
    ariaLabel: null,
    role: null,
    styleTokens: normalizeTokens([
      { category: 'typography', value: input.level <= 2 ? 'heading' : 'body' },
      { category: 'heading-intent', value: input.headingIntent }
    ]),
    children: [textNode(input.text)]
  };
}

function listElement(input: {
  id: string;
  ordered: boolean;
  items: readonly string[];
}): HtmlList {
  return {
    nodeType: 'element',
    elementType: 'list',
    id: input.id,
    tag: input.ordered ? 'ol' : 'ul',
    ordered: input.ordered,
    attributes: {},
    classList: ['list'],
    ariaLabel: null,
    role: null,
    styleTokens: normalizeTokens([{ category: 'spacing', value: 'comfortable' }]),
    children: input.items.map((item, index) => genericElement({
      id: `${input.id}-item-${index + 1}`,
      tag: 'li',
      children: [textNode(item)]
    }))
  };
}

function listContainer(input: {
  id: string;
  ordered: boolean;
  items: readonly HtmlElement[];
  classList?: HtmlClassList;
}): HtmlList {
  return {
    nodeType: 'element',
    elementType: 'list',
    id: input.id,
    tag: input.ordered ? 'ol' : 'ul',
    ordered: input.ordered,
    attributes: {},
    classList: input.classList ?? ['list'],
    ariaLabel: null,
    role: null,
    styleTokens: normalizeTokens([{ category: 'spacing', value: 'comfortable' }]),
    children: input.items
  };
}

function tableElement(input: {
  id: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}): HtmlTable {
  const headerRow = genericElement({
    id: `${input.id}-thead-row`,
    tag: 'tr',
    children: input.headers.map((header, index) => genericElement({
      id: `${input.id}-th-${index + 1}`,
      tag: 'th',
      attributes: { scope: 'col' },
      children: [textNode(header)]
    }))
  });

  const bodyRows = input.rows.map((row, rowIndex) => genericElement({
    id: `${input.id}-row-${rowIndex + 1}`,
    tag: 'tr',
    children: row.map((cell, cellIndex) => genericElement({
      id: `${input.id}-row-${rowIndex + 1}-cell-${cellIndex + 1}`,
      tag: 'td',
      children: [textNode(cell)]
    }))
  }));

  return {
    nodeType: 'element',
    elementType: 'table',
    id: input.id,
    tag: 'table',
    headers: input.headers,
    rows: input.rows,
    attributes: {},
    classList: ['table'],
    ariaLabel: null,
    role: null,
    styleTokens: normalizeTokens([
      { category: 'spacing', value: 'compact' },
      { category: 'content-width', value: 'wide' }
    ]),
    children: [
      genericElement({
        id: `${input.id}-thead`,
        tag: 'thead',
        children: [headerRow]
      }),
      genericElement({
        id: `${input.id}-tbody`,
        tag: 'tbody',
        children: bodyRows
      })
    ]
  };
}

function imageElement(input: {
  blockId: string;
  assetId: string;
  src: string;
  alt: string;
  caption: string | null;
}): HtmlImage {
  const children: HtmlElement[] = [
    genericElement({
      id: `${input.blockId}-img`,
      tag: 'img',
      attributes: {
        src: assertSafeAssetUrl(input.src),
        alt: input.alt,
        loading: 'lazy',
        decoding: 'async',
        referrerpolicy: 'strict-origin-when-cross-origin'
      }
    })
  ];

  if (input.caption !== null) {
    children.push(genericElement({
      id: `${input.blockId}-caption`,
      tag: 'figcaption',
      children: [textNode(input.caption)]
    }));
  }

  return {
    nodeType: 'element',
    elementType: 'image',
    id: input.blockId,
    tag: 'figure',
    assetId: input.assetId,
    src: input.src,
    alt: input.alt,
    caption: input.caption,
    attributes: {},
    classList: ['content-block'],
    ariaLabel: input.caption ?? null,
    role: null,
    styleTokens: normalizeTokens([{ category: 'image-alignment', value: 'center' }]),
    children
  };
}

function calloutElement(input: {
  id: string;
  calloutType: HtmlCallout['calloutType'];
  publicationBlockType: NonNullable<HtmlCallout['attributes']['dataPublicationBlock']>;
  title?: string;
  body: string;
}): HtmlCallout {
  const children: HtmlElement[] = [];

  if (input.title) {
    children.push(headingElement({
      id: `${input.id}-title`,
      level: 3,
      text: input.title,
      headingIntent: 'subsection-title'
    }));
  }

  children.push(genericElement({
    id: `${input.id}-body`,
    tag: 'p',
    children: [textNode(input.body)]
  }));

  return {
    nodeType: 'element',
    elementType: 'callout',
    id: input.id,
    tag: 'aside',
    calloutType: input.calloutType,
    attributes: {
      dataPublicationBlock: input.publicationBlockType
    },
    classList: ['callout', 'content-block'],
    ariaLabel: input.title ?? null,
    role: 'note',
    styleTokens: normalizeTokens([
      { category: 'callout-type', value: input.calloutType },
      { category: 'border-intent', value: 'subtle' },
      { category: 'radius', value: 'soft' }
    ]),
    children
  };
}

function toSubHeadingLevel(level: 1 | 2 | 3): 3 | 4 | 5 {
  if (level === 1) {
    return 3;
  }

  if (level === 2) {
    return 3;
  }

  return 4;
}

function citationLink(id: string): HtmlElement {
  return genericElement({
    tag: 'a',
    attributes: {
      href: assertSafeInternalHref(`#appendix-citation-${id}`),
      dataCitationId: id
    },
    children: [textNode(`[${id}]`)],
    styleTokens: [{ category: 'typography', value: 'caption' }]
  });
}

function footnoteLink(id: string): HtmlElement {
  return genericElement({
    tag: 'a',
    attributes: {
      href: assertSafeInternalHref(`#appendix-footnote-${id}`),
      dataFootnoteId: id
    },
    children: [textNode(`(${id})`)],
    styleTokens: [{ category: 'typography', value: 'caption' }]
  });
}

function appendReferenceLinks(citationIds?: readonly string[], footnoteIds?: readonly string[]): HtmlElement[] {
  const children: HtmlElement[] = [];

  if (citationIds && citationIds.length > 0) {
    children.push(genericElement({
      id: `citations-${citationIds.join('-')}`,
      tag: 'p',
      children: [
        textNode('Citations: '),
        ...citationIds.flatMap((citationId, index) => {
          const nodes: Array<ReturnType<typeof textNode> | HtmlElement> = [citationLink(citationId)];

          if (index < citationIds.length - 1) {
            nodes.push(textNode(', '));
          }

          return nodes;
        })
      ],
      styleTokens: [{ category: 'typography', value: 'caption' }]
    }));
  }

  if (footnoteIds && footnoteIds.length > 0) {
    children.push(genericElement({
      id: `footnotes-${footnoteIds.join('-')}`,
      tag: 'p',
      children: [
        textNode('Footnotes: '),
        ...footnoteIds.flatMap((footnoteId, index) => {
          const nodes: Array<ReturnType<typeof textNode> | HtmlElement> = [footnoteLink(footnoteId)];

          if (index < footnoteIds.length - 1) {
            nodes.push(textNode(', '));
          }

          return nodes;
        })
      ],
      styleTokens: [{ category: 'typography', value: 'caption' }]
    }));
  }

  return children;
}

function composeBlock(block: Publication['sections'][number]['blocks'][number], publication: Publication): HtmlElement[] {
  switch (block.type) {
    case 'heading':
      return [headingElement({
        id: block.id,
        level: toSubHeadingLevel(block.level),
        text: block.text,
        headingIntent: 'subsection-title'
      })];
    case 'paragraph':
      return [
        genericElement({
          id: block.id,
          tag: 'p',
          classList: ['content-block'],
          children: [textNode(block.text)],
          styleTokens: [{ category: 'typography', value: 'body' }]
        }),
        ...appendReferenceLinks(block.citationIds, block.footnoteIds)
      ];
    case 'reflection':
      return [
        calloutElement({
          id: block.id,
          calloutType: 'reflection',
          publicationBlockType: block.type,
          body: block.text
        }),
        ...appendReferenceLinks(block.citationIds, block.footnoteIds)
      ];
    case 'prayer':
      return [
        calloutElement({
          id: block.id,
          calloutType: 'prayer',
          publicationBlockType: block.type,
          body: block.text
        }),
        ...appendReferenceLinks(block.citationIds, block.footnoteIds)
      ];
    case 'journal-prompt':
      return [
        calloutElement({
          id: block.id,
          calloutType: 'journal-prompt',
          publicationBlockType: block.type,
          title: 'Journal Prompt',
          body: block.text
        }),
        ...appendReferenceLinks(block.citationIds, block.footnoteIds)
      ];
    case 'key-takeaway':
      return [
        calloutElement({
          id: block.id,
          calloutType: 'key-takeaway',
          publicationBlockType: block.type,
          body: block.text
        }),
        ...appendReferenceLinks(block.citationIds, block.footnoteIds)
      ];
    case 'warning':
      return [
        calloutElement({
          id: block.id,
          calloutType: 'warning',
          publicationBlockType: block.type,
          body: block.text
        }),
        ...appendReferenceLinks(block.citationIds, block.footnoteIds)
      ];
    case 'highlight':
      return [
        calloutElement({
          id: block.id,
          calloutType: 'highlight',
          publicationBlockType: block.type,
          body: block.text
        }),
        ...appendReferenceLinks(block.citationIds, block.footnoteIds)
      ];
    case 'quote': {
      const quote = genericElement({
        id: block.id,
        tag: 'blockquote',
        classList: ['content-block'],
        children: [textNode(block.text)]
      });

      if (block.attribution) {
        return [
          quote,
          genericElement({
            id: `${block.id}-attribution`,
            tag: 'p',
            children: [textNode(block.attribution)],
            styleTokens: [{ category: 'typography', value: 'caption' }]
          }),
          ...appendReferenceLinks(block.citationIds, block.footnoteIds)
        ];
      }

      return [quote, ...appendReferenceLinks(block.citationIds, block.footnoteIds)];
    }
    case 'call-to-action':
      return [
        calloutElement({
          id: block.id,
          calloutType: 'call-to-action',
          publicationBlockType: block.type,
          title: block.title,
          body: `${block.description} ${block.action}`
        }),
        ...appendReferenceLinks(block.citationIds, block.footnoteIds)
      ];
    case 'scripture':
      return [
        calloutElement({
          id: block.id,
          calloutType: 'note',
          publicationBlockType: block.type,
          title: block.references.join('; '),
          body: block.text
        }),
        ...appendReferenceLinks(block.citationIds, block.footnoteIds)
      ];
    case 'checklist':
      return [listElement({ id: block.id, ordered: false, items: block.items }), ...appendReferenceLinks(block.citationIds, block.footnoteIds)];
    case 'bullet-list':
      return [listElement({ id: block.id, ordered: false, items: block.items }), ...appendReferenceLinks(block.citationIds, block.footnoteIds)];
    case 'numbered-list':
      return [listElement({ id: block.id, ordered: true, items: block.items }), ...appendReferenceLinks(block.citationIds, block.footnoteIds)];
    case 'sidebar':
      return [calloutElement({
        id: block.id,
        calloutType: 'sidebar',
        publicationBlockType: block.type,
        title: block.sidebar.title,
        body: block.sidebar.body
      })];
    case 'image-placeholder': {
      const asset = publication.assets.find((entry) => entry.id === block.image.assetId);

      if (!asset) {
        throw new HtmlValidationError('Image block references unknown asset.');
      }

      return [imageElement({
        blockId: block.id,
        assetId: asset.id,
        src: asset.uri,
        alt: asset.altText ?? 'Image description pending.',
        caption: block.image.caption
      })];
    }
    case 'table':
      return [tableElement({ id: block.id, headers: block.table.headers, rows: block.table.rows })];
    case 'divider':
      return [genericElement({ id: block.id, tag: 'hr', classList: ['content-block'] })];
    default: {
      const exhaustiveCheck: never = block;
      throw new UnsupportedHtmlElementError(`Unsupported publication block type: ${String(exhaustiveCheck)}`);
    }
  }
}

type TocEntry = Publication['toc']['entries'][number];

type TocTreeNode = TocEntry & {
  readonly children: TocTreeNode[];
};

function validateTocEntries(entries: readonly TocEntry[]): readonly TocEntry[] {
  const filtered = entries.filter((entry) => entry.targetId !== 'cover' && entry.targetId !== 'table-of-contents');
  const ids = new Set<string>();

  for (const entry of filtered) {
    if (ids.has(entry.id)) {
      throw new HtmlValidationError('TOC contains duplicate entry IDs.');
    }

    ids.add(entry.id);
  }

  const byId = new Map(filtered.map((entry) => [entry.id, entry]));

  for (const entry of filtered) {
    if (entry.parentId !== null && !byId.has(entry.parentId)) {
      throw new HtmlValidationError('TOC contains orphan entries.');
    }

    const seen = new Set<string>([entry.id]);
    let cursor = entry;

    while (cursor.parentId !== null) {
      const parent = byId.get(cursor.parentId);

      if (!parent) {
        break;
      }

      if (seen.has(parent.id)) {
        throw new HtmlValidationError('TOC contains cyclic parent relationships.');
      }

      seen.add(parent.id);
      cursor = parent;
    }
  }

  return filtered;
}

function buildTocTree(entries: readonly TocEntry[]): TocTreeNode[] {
  const roots: TocTreeNode[] = [];
  const byId = new Map<string, TocTreeNode>();

  for (const entry of entries) {
    byId.set(entry.id, { ...entry, children: [] });
  }

  for (const entry of entries) {
    const node = byId.get(entry.id);

    if (!node) {
      continue;
    }

    if (entry.parentId === null) {
      roots.push(node);
      continue;
    }

    const parent = byId.get(entry.parentId);

    if (!parent) {
      throw new HtmlValidationError('TOC tree could not resolve a parent node.');
    }

    parent.children.push(node);
  }

  return roots;
}

function tocNodeToListItem(node: TocTreeNode): HtmlElement {
  const link = genericElement({
    id: `toc-link-${node.id}`,
    tag: 'a',
    attributes: {
      href: assertSafeInternalHref(`#${node.targetId}`)
    },
    children: [textNode(node.title)]
  });

  const children: Array<ReturnType<typeof textNode> | HtmlElement> = [link];

  if (node.children.length > 0) {
    children.push(listContainer({
      id: `toc-children-${node.id}`,
      ordered: true,
      classList: ['toc-list'],
      items: node.children.map(tocNodeToListItem)
    }));
  }

  return genericElement({
    id: `toc-item-${node.id}`,
    tag: 'li',
    classList: ['toc-item'],
    children
  });
}

function composeReferences(publication: Publication): HtmlElement | null {
  if (publication.references.length === 0) {
    return null;
  }

  return genericElement({
    id: 'appendix-references',
    tag: 'section',
    classList: ['references'],
    children: [
      headingElement({
        id: 'appendix-references-title',
        level: 2,
        text: 'References',
        headingIntent: 'section-title'
      }),
      genericElement({
        id: 'appendix-references-list-container',
        tag: 'section',
        children: [listContainer({
          id: 'appendix-references-list',
          ordered: true,
          items: publication.references.map((reference) => {
          const text = `${reference.label} - ${reference.detail}`;
          const children: Array<ReturnType<typeof textNode> | HtmlElement> = [textNode(text)];

          if (reference.url !== null) {
            children.push(textNode(' - '));
            children.push(genericElement({
              id: `appendix-reference-link-${reference.id}`,
              tag: 'a',
              attributes: {
                href: reference.url.startsWith('#')
                  ? assertSafeInternalHref(reference.url)
                  : assertSafeExternalUrl(reference.url),
                dataReferenceId: reference.id,
                target: '_blank',
                rel: 'noopener noreferrer'
              },
              children: [textNode('Open source')]
            }));
          }

          return genericElement({
            id: `appendix-reference-${reference.id}`,
            tag: 'li',
            children
          });
          })
        })]
      })
    ]
  });
}

function composeCitations(publication: Publication): HtmlElement | null {
  if (publication.citations.length === 0) {
    return null;
  }

  return genericElement({
    id: 'appendix-citations',
    tag: 'section',
    classList: ['references'],
    children: [
      headingElement({
        id: 'appendix-citations-title',
        level: 2,
        text: 'Citations',
        headingIntent: 'section-title'
      }),
      genericElement({
        id: 'appendix-citations-list-container',
        tag: 'section',
        children: [listContainer({
          id: 'appendix-citations-list',
          ordered: true,
          items: publication.citations.map((citation) => genericElement({
            id: `appendix-citation-${citation.id}`,
            tag: 'li',
            children: [textNode(`${citation.label}: ${citation.text}`)]
          }))
        })]
      })
    ]
  });
}

function composeFootnotes(publication: Publication): HtmlElement | null {
  if (publication.footnotes.length === 0) {
    return null;
  }

  return genericElement({
    id: 'appendix-footnotes',
    tag: 'section',
    classList: ['footnotes'],
    children: [
      headingElement({
        id: 'appendix-footnotes-title',
        level: 2,
        text: 'Footnotes',
        headingIntent: 'section-title'
      }),
      genericElement({
        id: 'appendix-footnotes-list-container',
        tag: 'section',
        children: [listContainer({
          id: 'appendix-footnotes-list',
          ordered: true,
          items: publication.footnotes.map((footnote) => genericElement({
            id: `appendix-footnote-${footnote.id}`,
            tag: 'li',
            children: [textNode(`${footnote.marker}. ${footnote.text}`)]
          }))
        })]
      })
    ]
  });
}

function composeBodySection(publicationSection: Publication['sections'][number], publication: Publication): HtmlElement {
  const sectionChildren: HtmlElement[] = [
    headingElement({
      id: `${publicationSection.id}-title`,
      level: 2,
      text: publicationSection.title,
      headingIntent: 'section-title'
    })
  ];

  for (const block of publicationSection.blocks) {
    const mapped = composeBlock(block, publication);

    if (mapped.length === 0) {
      throw new HtmlCompositionError('Every publication block must produce at least one HTML element.');
    }

    sectionChildren.push(...mapped);
  }

  return genericElement({
    id: publicationSection.id,
    tag: 'section',
    classList: ['section'],
    children: sectionChildren,
    styleTokens: [{ category: 'section-intent', value: 'content' }]
  });
}

function composeMain(publication: Publication): HtmlElement {
  const contentSections = publication.sections
    .filter((section) => section.id !== 'cover' && section.id !== 'table-of-contents')
    .map((section) => composeBodySection(section, publication));

  return genericElement({
    id: 'main-content',
    tag: 'main',
    classList: ['document-main'],
    children: contentSections
  });
}

export function mapThemeToDesignTokens(theme: PublicationTheme): readonly HtmlStyleToken[] {
  return normalizeTokens(THEME_TOKEN_MAP[theme]);
}

export class PublicationHtmlComposer implements HtmlComposer {
  public compose(publicationInput: Publication, signal?: AbortSignal): HtmlDocument {
    if (signal?.aborted) {
      throw new HtmlCancelledError();
    }

    try {
      const publication = publicationSchema.parse(publicationInput);
      const styleTokens = mapThemeToDesignTokens(publication.metadata.theme);

      const assetReferences = publication.assets.map((asset, index) => ({
        id: `asset-ref-${index + 1}`,
        assetId: asset.id,
        uri: assertSafeAssetUrl(asset.uri),
        mimeType: asset.mimeType,
        altText: asset.altText ?? 'Image description pending.'
      }));

      const tocEntries = validateTocEntries(publication.toc.entries);
      const tocTree = buildTocTree(tocEntries);

      const header = genericElement({
      id: 'document-header',
      tag: 'header',
      classList: ['document-header'],
      children: [
        headingElement({
          id: 'document-title',
          level: 1,
          text: publication.metadata.title,
          headingIntent: 'document-title'
        }),
        genericElement({
          id: 'document-subtitle',
          tag: 'p',
          children: [textNode(publication.metadata.subtitle ?? publication.metadata.title)]
        })
      ]
    });

      const tocNav = tocTree.length > 0
        ? genericElement({
          id: 'table-of-contents',
          tag: 'nav',
          classList: ['toc'],
          role: 'navigation',
          ariaLabel: 'Table of contents',
          children: [
            headingElement({
              id: 'toc-title',
              level: 2,
              text: 'Table of contents',
              headingIntent: 'section-title'
            }),
            genericElement({
              id: 'toc-root-list-container',
              tag: 'section',
              children: [listContainer({
                id: 'toc-root-list',
                ordered: true,
                classList: ['toc-list'],
                items: tocTree.map(tocNodeToListItem)
              })]
            })
          ]
        })
        : null;

      const main = composeMain(publication);

      if (signal?.aborted) {
        throw new HtmlCancelledError();
      }

      const footerChildren: HtmlElement[] = [];
      const references = composeReferences(publication);
      const citations = composeCitations(publication);
      const footnotes = composeFootnotes(publication);

      if (references) {
        footerChildren.push(references);
      }

      if (citations) {
        footerChildren.push(citations);
      }

      if (footnotes) {
        footerChildren.push(footnotes);
      }

      const footer = genericElement({
      id: 'document-footer',
      tag: 'footer',
      classList: ['document-footer'],
      children: footerChildren
      });

      const article = genericElement({
      id: 'document-article',
      tag: 'article',
      classList: ['document'],
      children: tocNav === null
        ? [header, main, footer]
        : [header, tocNav, main, footer]
      });

      const sections: HtmlSection[] = [
        {
          id: 'document-root',
          title: publication.metadata.title,
          role: 'content',
          styleTokens: normalizeTokens([{ category: 'section-intent', value: 'content' }]),
          elements: [article]
        }
      ];

      const htmlDocument = {
      schemaVersion: '1.0' as const,
      metadata: {
        publicationId: publication.metadata.publicationId,
        publicationType: publication.metadata.publicationType,
        title: publication.metadata.title,
        description: publication.metadata.subtitle,
        language: publication.document.language,
        generatedAt: publication.metadata.generatedAt,
        sourceVersionId: publication.metadata.sourceVersionId,
        sourceContentHash: publication.metadata.sourceContentHash,
        audience: publication.metadata.audience,
        theme: publication.metadata.theme,
        styleTokens,
        assetReferences
      },
      theme: publication.metadata.theme,
      head: {
        title: publication.metadata.title,
        lang: publication.document.language,
        metadata: [
          { name: 'description', content: publication.metadata.subtitle ?? publication.metadata.title },
          { name: 'publication-type', content: publication.metadata.publicationType },
          { name: 'audience', content: publication.metadata.audience },
          { name: 'theme', content: publication.metadata.theme },
          { name: 'source-version-id', content: publication.metadata.sourceVersionId },
          { name: 'source-content-hash', content: publication.metadata.sourceContentHash }
        ],
        styleTokens
      },
      body: {
        skipNavigationTargetId: 'main-content',
        sections,
        landmarks: [
          { role: 'banner' as const, sectionId: 'document-root', label: 'Document header' },
          ...(tocNav === null
            ? []
            : [{ role: 'navigation' as const, sectionId: 'document-root', label: 'Table of contents' }]),
          { role: 'main' as const, sectionId: 'document-root', label: null },
          { role: 'contentinfo' as const, sectionId: 'document-root', label: null }
        ]
      }
      };

      try {
        return htmlDocumentSchema.parse(htmlDocument);
      } catch (error) {
        throw new HtmlValidationError('HTML document failed validation.', { cause: error });
      }
    } catch (error) {
      if (error instanceof HtmlCancelledError || error instanceof HtmlValidationError || error instanceof HtmlCompositionError || error instanceof UnsupportedHtmlElementError) {
        throw error;
      }

      if (signal?.aborted) {
        throw new HtmlCancelledError();
      }

      throw new HtmlValidationError('HTML document failed validation.', { cause: error });
    }
  }
}
