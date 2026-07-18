import { z } from 'zod';

import {
  assertSafeAssetUrl,
  assertSafeExternalUrl,
  assertSafeInternalHref,
  sanitizeUrlInput
} from '../../platform/security/url-safety.js';

const MAX_TOTAL_ELEMENTS = 2400;
const MAX_TREE_DEPTH = 16;
const MAX_CHILDREN_PER_ELEMENT = 180;

const htmlClassTokenSchema = z.enum([
  'document',
  'document-header',
  'document-main',
  'document-footer',
  'section',
  'section-title',
  'toc',
  'toc-list',
  'toc-item',
  'content-block',
  'callout',
  'list',
  'table',
  'references',
  'footnotes'
]);

const htmlClassListSchema = z.array(htmlClassTokenSchema).max(30);

const htmlAttributesSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  href: z.string().trim().min(1).max(1024).optional(),
  src: z.string().trim().min(1).max(1024).optional(),
  alt: z.string().trim().min(1).max(300).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  role: z.string().trim().min(1).max(120).optional(),
  lang: z.string().trim().min(2).max(20).optional(),
  target: z.literal('_blank').optional(),
  rel: z.string().trim().min(1).max(120).optional(),
  ariaLabel: z.string().trim().min(1).max(240).optional(),
  ariaDescribedBy: z.string().trim().min(1).max(120).optional(),
  ariaLabelledBy: z.string().trim().min(1).max(120).optional(),
  scope: z.enum(['row', 'col']).optional(),
  colspan: z.string().trim().regex(/^\d+$/).optional(),
  rowspan: z.string().trim().regex(/^\d+$/).optional(),
  loading: z.enum(['lazy', 'eager']).optional(),
  decoding: z.enum(['auto', 'sync', 'async']).optional(),
  referrerpolicy: z.enum(['no-referrer', 'strict-origin-when-cross-origin']).optional(),
  dataPublicationBlock: z.enum([
    'reflection',
    'call-to-action',
    'prayer',
    'journal-prompt',
    'sidebar',
    'key-takeaway',
    'warning',
    'highlight',
    'scripture'
  ]).optional(),
  dataReferenceId: z.string().trim().min(1).max(120).optional(),
  dataCitationId: z.string().trim().min(1).max(120).optional(),
  dataFootnoteId: z.string().trim().min(1).max(120).optional()
}).strict();

export const htmlStyleTokenSchema = z.discriminatedUnion('category', [
  z.object({
    category: z.literal('spacing'),
    value: z.enum(['none', 'compact', 'comfortable', 'expanded'])
  }).strict(),
  z.object({
    category: z.literal('typography'),
    value: z.enum(['display', 'heading', 'body', 'caption', 'label'])
  }).strict(),
  z.object({
    category: z.literal('color-intent'),
    value: z.enum(['neutral', 'brand', 'accent', 'emphasis', 'contrast'])
  }).strict(),
  z.object({
    category: z.literal('font-role'),
    value: z.enum(['default', 'reading', 'display', 'mono'])
  }).strict(),
  z.object({
    category: z.literal('border-intent'),
    value: z.enum(['none', 'subtle', 'strong', 'focus'])
  }).strict(),
  z.object({
    category: z.literal('shadow-intent'),
    value: z.enum(['none', 'raised', 'overlay'])
  }).strict(),
  z.object({
    category: z.literal('radius'),
    value: z.enum(['none', 'soft', 'rounded', 'pill'])
  }).strict(),
  z.object({
    category: z.literal('callout-type'),
    value: z.enum([
      'note',
      'reflection',
      'call-to-action',
      'prayer',
      'journal-prompt',
      'sidebar',
      'key-takeaway',
      'warning',
      'highlight'
    ])
  }).strict(),
  z.object({
    category: z.literal('page-intent'),
    value: z.enum(['reading', 'study', 'reference'])
  }).strict(),
  z.object({
    category: z.literal('section-intent'),
    value: z.enum(['cover', 'toc', 'content', 'references', 'footnotes'])
  }).strict(),
  z.object({
    category: z.literal('heading-intent'),
    value: z.enum(['document-title', 'section-title', 'subsection-title'])
  }).strict(),
  z.object({
    category: z.literal('content-width'),
    value: z.enum(['narrow', 'standard', 'wide'])
  }).strict(),
  z.object({
    category: z.literal('image-alignment'),
    value: z.enum(['left', 'center', 'right', 'full-bleed'])
  }).strict()
]);

const htmlAssetReferenceSchema = z.object({
  id: z.string().trim().min(1).max(80),
  assetId: z.string().trim().min(1).max(80),
  uri: z.string().trim().min(1).max(1024),
  mimeType: z.string().trim().min(1).max(100).nullable(),
  altText: z.string().trim().min(1).max(300)
}).strict();

const htmlMetadataSchema = z.object({
  publicationId: z.string().trim().min(1).max(80),
  publicationType: z.literal('cta-guide'),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().min(1).max(500).nullable(),
  language: z.string().trim().min(2).max(20),
  generatedAt: z.string().datetime({ offset: true }),
  sourceVersionId: z.string().trim().min(1).max(80),
  sourceContentHash: z.string().trim().min(1).max(200),
  audience: z.string().trim().min(1).max(120),
  theme: z.enum(['classic', 'modern', 'ministry', 'workbook', 'magazine', 'minimal', 'dark']),
  styleTokens: z.array(htmlStyleTokenSchema).min(1).max(100),
  assetReferences: z.array(htmlAssetReferenceSchema).max(200)
}).strict();

const htmlHeadSchema = z.object({
  title: z.string().trim().min(1).max(240),
  lang: z.string().trim().min(2).max(20),
  metadata: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    content: z.string().trim().min(1).max(500)
  }).strict()).max(40),
  styleTokens: z.array(htmlStyleTokenSchema).max(100)
}).strict();

const htmlTextNodeSchema = z.object({
  nodeType: z.literal('text'),
  text: z.string().trim().min(1).max(5000)
}).strict();

let htmlNodeSchema: z.ZodTypeAny;

const htmlElementBaseSchema = z.object({
  nodeType: z.literal('element'),
  id: z.string().trim().min(1).max(120).nullable(),
  attributes: htmlAttributesSchema,
  classList: htmlClassListSchema,
  ariaLabel: z.string().trim().min(1).max(240).nullable(),
  role: z.string().trim().min(1).max(120).nullable(),
  styleTokens: z.array(htmlStyleTokenSchema).max(60),
  children: z.array(z.lazy(() => htmlNodeSchema)).max(MAX_CHILDREN_PER_ELEMENT)
}).strict();

const htmlHeadingSchema = htmlElementBaseSchema.extend({
  elementType: z.literal('heading'),
  tag: z.enum(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])
}).strict().superRefine((value, context) => {
  const numericTag = Number(value.tag.slice(1));

  if (numericTag !== value.level) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Heading tag and level must align.',
      path: ['level']
    });
  }
});

const htmlListSchema = htmlElementBaseSchema.extend({
  elementType: z.literal('list'),
  tag: z.enum(['ul', 'ol']),
  ordered: z.boolean()
}).strict().superRefine((value, context) => {
  if (value.ordered && value.tag !== 'ol') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Ordered lists must use <ol>.',
      path: ['tag']
    });
  }

  if (!value.ordered && value.tag !== 'ul') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Unordered lists must use <ul>.',
      path: ['tag']
    });
  }
});

const htmlTableSchema = htmlElementBaseSchema.extend({
  elementType: z.literal('table'),
  tag: z.literal('table'),
  headers: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  rows: z.array(z.array(z.string().trim().min(1).max(2000)).min(1).max(20)).max(400)
}).strict().superRefine((value, context) => {
  for (const [index, row] of value.rows.entries()) {
    if (row.length !== value.headers.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Table rows must match header count.',
        path: ['rows', index]
      });
    }
  }
});

const htmlImageSchema = htmlElementBaseSchema.extend({
  elementType: z.literal('image'),
  tag: z.literal('figure'),
  assetId: z.string().trim().min(1).max(80),
  src: z.string().trim().min(1).max(1024),
  alt: z.string().trim().min(1).max(300),
  caption: z.string().trim().min(1).max(240).nullable()
}).strict();

const htmlCalloutSchema = htmlElementBaseSchema.extend({
  elementType: z.literal('callout'),
  tag: z.literal('aside'),
  calloutType: z.enum([
    'note',
    'reflection',
    'call-to-action',
    'prayer',
    'journal-prompt',
    'sidebar',
    'key-takeaway',
    'warning',
    'highlight'
  ])
}).strict();

const htmlGenericElementSchema = htmlElementBaseSchema.extend({
  elementType: z.literal('generic'),
  tag: z.enum([
    'article',
    'section',
    'header',
    'footer',
    'main',
    'aside',
    'nav',
    'p',
    'blockquote',
    'figure',
    'figcaption',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'li',
    'hr',
    'img',
    'a'
  ])
}).strict();

const htmlElementSchema: z.ZodTypeAny = z.lazy(() => z.discriminatedUnion('elementType', [
  htmlGenericElementSchema,
  htmlHeadingSchema,
  htmlListSchema,
  htmlTableSchema,
  htmlImageSchema,
  htmlCalloutSchema
]));

htmlNodeSchema = z.lazy(() => z.union([
  htmlTextNodeSchema,
  htmlElementSchema
]));

const htmlSectionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(240),
  role: z.enum(['cover', 'toc', 'content', 'references', 'footnotes']),
  styleTokens: z.array(htmlStyleTokenSchema).max(40),
  elements: z.array(htmlElementSchema).min(1).max(500)
}).strict();

const htmlBodySchema = z.object({
  skipNavigationTargetId: z.string().trim().min(1).max(120),
  sections: z.array(htmlSectionSchema).min(1).max(200),
  landmarks: z.array(z.object({
    role: z.enum(['banner', 'navigation', 'main', 'contentinfo']),
    sectionId: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120).nullable()
  }).strict()).min(3).max(10)
}).strict();

type TraversableTextNode = {
  readonly nodeType: 'text';
  readonly text: string;
};

type TraversableElement = {
  readonly nodeType: 'element';
  readonly id: string | null;
  readonly elementType: string;
  readonly tag: string;
  readonly attributes: z.infer<typeof htmlAttributesSchema>;
  readonly children: ReadonlyArray<TraversableTextNode | TraversableElement>;
  readonly level?: number;
  readonly assetId?: string;
};

function landmarkRoleCounts(landmarks: ReadonlyArray<{ role: string }>): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const landmark of landmarks) {
    counts[landmark.role] = (counts[landmark.role] ?? 0) + 1;
  }

  return counts;
}

function validateTagAttributeApplicability(input: {
  tag: string;
  attributes: z.infer<typeof htmlAttributesSchema>;
  path: Array<string | number>;
  context: z.RefinementCtx;
}): void {
  const { tag, attributes, path, context } = input;

  if (attributes.href !== undefined && tag !== 'a') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'href is only allowed on <a>.',
      path: [...path, 'attributes', 'href']
    });
  }

  if (attributes.src !== undefined && tag !== 'img') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'src is only allowed on <img>.',
      path: [...path, 'attributes', 'src']
    });
  }

  if (attributes.alt !== undefined && tag !== 'img') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'alt is only allowed on <img>.',
      path: [...path, 'attributes', 'alt']
    });
  }

  if (attributes.scope !== undefined && tag !== 'th') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'scope is only allowed on <th>.',
      path: [...path, 'attributes', 'scope']
    });
  }

  if (attributes.colspan !== undefined && tag !== 'td' && tag !== 'th') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'colspan is only allowed on <td> and <th>.',
      path: [...path, 'attributes', 'colspan']
    });
  }

  if (attributes.rowspan !== undefined && tag !== 'td' && tag !== 'th') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'rowspan is only allowed on <td> and <th>.',
      path: [...path, 'attributes', 'rowspan']
    });
  }

  if (attributes.loading !== undefined && tag !== 'img') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'loading is only allowed on <img>.',
      path: [...path, 'attributes', 'loading']
    });
  }

  if (attributes.decoding !== undefined && tag !== 'img') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'decoding is only allowed on <img>.',
      path: [...path, 'attributes', 'decoding']
    });
  }

  if (attributes.dataPublicationBlock !== undefined && tag !== 'aside') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'dataPublicationBlock is only allowed on <aside>.',
      path: [...path, 'attributes', 'dataPublicationBlock']
    });
  }

  if ((attributes.dataReferenceId !== undefined || attributes.dataCitationId !== undefined || attributes.dataFootnoteId !== undefined) && tag !== 'a') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Reference and note data attributes are only allowed on <a>.',
      path: [...path, 'attributes']
    });
  }

  if (attributes.target === '_blank') {
    const rel = attributes.rel ?? '';

    if (!rel.includes('noopener') || !rel.includes('noreferrer')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'target="_blank" links must include rel with noopener and noreferrer.',
        path: [...path, 'attributes', 'rel']
      });
    }
  }
}

export const htmlDocumentSchema = z.object({
  schemaVersion: z.literal('1.0'),
  metadata: htmlMetadataSchema,
  theme: z.enum(['classic', 'modern', 'ministry', 'workbook', 'magazine', 'minimal', 'dark']),
  head: htmlHeadSchema,
  body: htmlBodySchema
}).strict().superRefine((value, context) => {
  const sectionIds = new Set<string>();
  const elementIds = new Set<string>();
  const headingLevels: number[] = [];
  const assetIds = new Set(value.metadata.assetReferences.map((asset) => asset.assetId));
  const allAnchorTargets = new Set<string>();
  const internalHrefTargets = new Set<string>();
  const landmarkCounts = landmarkRoleCounts(value.body.landmarks);

  for (const [assetIndex, asset] of value.metadata.assetReferences.entries()) {
    try {
      assertSafeAssetUrl(asset.uri);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Asset URI is not allowed by URL policy.',
        path: ['metadata', 'assetReferences', assetIndex, 'uri']
      });
    }
  }

  const queue: Array<{
    node: TraversableElement;
    path: Array<string | number>;
    depth: number;
    parentTag: string | null;
  }> = [];

  let totalElements = 0;
  let mainElementCount = 0;
  let hasNonEmptyMain = false;

  for (const [index, section] of value.body.sections.entries()) {
    if (sectionIds.has(section.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate HTML section ID detected.',
        path: ['body', 'sections', index, 'id']
      });
    }

    sectionIds.add(section.id);

    for (const [elementIndex, element] of section.elements.entries()) {
      queue.push({
        node: element as TraversableElement,
        path: ['body', 'sections', index, 'elements', elementIndex],
        depth: 1,
        parentTag: null
      });
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    totalElements += 1;

    if (totalElements > MAX_TOTAL_ELEMENTS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'HTML document exceeds maximum element count.',
        path: ['body', 'sections']
      });
      break;
    }

    if (current.depth > MAX_TREE_DEPTH) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'HTML document exceeds maximum nesting depth.',
        path: current.path
      });
      break;
    }

    const element = current.node;

    if (element.id !== null) {
      if (elementIds.has(element.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate HTML element ID detected.',
          path: [...current.path, 'id']
        });
      }

      elementIds.add(element.id);
      allAnchorTargets.add(element.id);
    }

    if (element.tag === 'main') {
      mainElementCount += 1;

      if (element.children.length > 0) {
        hasNonEmptyMain = true;
      }
    }

    if (element.elementType === 'heading' && typeof element.level === 'number') {
      headingLevels.push(element.level);
    }

    if (element.elementType === 'image' && typeof element.assetId === 'string' && !assetIds.has(element.assetId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Image element references an unknown asset.',
        path: [...current.path, 'assetId']
      });
    }

    validateTagAttributeApplicability({
      tag: element.tag,
      attributes: element.attributes,
      path: current.path,
      context
    });

    if (element.tag === 'img' || element.tag === 'hr') {
      if (element.children.length > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Void elements cannot have children.',
          path: [...current.path, 'children']
        });
      }
    }

    if (element.tag === 'img' && (element.attributes.alt === undefined || element.attributes.src === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Image elements must include src and alt attributes.',
        path: [...current.path, 'attributes']
      });
    }

    if (element.tag === 'a' && element.attributes.href !== undefined) {
      const href = element.attributes.href;

      try {
        if (href.startsWith('#')) {
          const safeHref = assertSafeInternalHref(href);
          internalHrefTargets.add(safeHref.slice(1));
        } else {
          assertSafeExternalUrl(href);
        }
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Anchor href failed URL safety validation.',
          path: [...current.path, 'attributes', 'href']
        });
      }
    }

    if (element.tag === 'img' && element.attributes.src !== undefined) {
      try {
        assertSafeAssetUrl(element.attributes.src);
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Image src failed URL safety validation.',
          path: [...current.path, 'attributes', 'src']
        });
      }
    }

    if (element.tag === 'li' && current.parentTag !== 'ol' && current.parentTag !== 'ul') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'List items must be children of <ol> or <ul>.',
        path: current.path
      });
    }

    if ((element.tag === 'thead' || element.tag === 'tbody') && current.parentTag !== 'table') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '<thead> and <tbody> must be children of <table>.',
        path: current.path
      });
    }

    if (element.tag === 'tr' && current.parentTag !== 'thead' && current.parentTag !== 'tbody') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '<tr> must be a child of <thead> or <tbody>.',
        path: current.path
      });
    }

    if ((element.tag === 'th' || element.tag === 'td') && current.parentTag !== 'tr') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '<th> and <td> must be children of <tr>.',
        path: current.path
      });
    }

    if (element.children.length > MAX_CHILDREN_PER_ELEMENT) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Element has too many child nodes.',
        path: [...current.path, 'children']
      });
    }

    for (const [childIndex, child] of element.children.entries()) {
      if (child.nodeType === 'element') {
        queue.push({
          node: child,
          path: [...current.path, 'children', childIndex],
          depth: current.depth + 1,
          parentTag: element.tag
        });
      }
    }
  }

  if (!elementIds.has(value.body.skipNavigationTargetId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Skip navigation target must match an existing element ID.',
      path: ['body', 'skipNavigationTargetId']
    });
  }

  for (const [index, landmark] of value.body.landmarks.entries()) {
    if (!sectionIds.has(landmark.sectionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Landmark sectionId must reference an existing section.',
        path: ['body', 'landmarks', index, 'sectionId']
      });
    }

    if ((landmarkCounts[landmark.role] ?? 0) > 1 && landmark.label === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Repeated landmark roles must include distinct labels.',
        path: ['body', 'landmarks', index, 'label']
      });
    }
  }

  if (mainElementCount !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Document must contain exactly one <main> element.',
      path: ['body', 'sections']
    });
  }

  if (!hasNonEmptyMain) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Main element must contain substantive content.',
      path: ['body', 'sections']
    });
  }

  if ((landmarkCounts.main ?? 0) !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Document must contain exactly one main landmark.',
      path: ['body', 'landmarks']
    });
  }

  for (const target of internalHrefTargets) {
    if (!allAnchorTargets.has(target)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Internal link target does not exist in the document.',
        path: ['body', 'sections']
      });
      break;
    }
  }

  if (headingLevels.length > 0 && headingLevels[0] !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Heading hierarchy must start at h1.',
      path: ['body', 'sections']
    });
  }

  for (let index = 1; index < headingLevels.length; index += 1) {
    const previous = headingLevels[index - 1] ?? 1;
    const current = headingLevels[index] ?? 1;

    if (current - previous > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Heading hierarchy cannot skip levels.',
        path: ['body', 'sections']
      });
      break;
    }
  }

  for (const metadataEntry of value.head.metadata) {
    try {
      sanitizeUrlInput(metadataEntry.content);
    } catch {
      continue;
    }
  }
});

export type HtmlDocument = z.infer<typeof htmlDocumentSchema>;
export type HtmlStyleToken = z.infer<typeof htmlStyleTokenSchema>;
