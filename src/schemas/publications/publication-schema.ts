import { z } from 'zod';

const idListSchema = z.array(z.string().trim().min(1).max(80)).min(1).max(40);

export const publicationThemeSchema = z.enum([
  'classic',
  'modern',
  'ministry',
  'workbook',
  'magazine',
  'minimal',
  'dark'
]);

export const publicationAudienceSchema = z.enum([
  'general',
  'church',
  'youth',
  'small-group',
  'leadership',
  'bible-study',
  'education',
  'nonprofit',
  'coaching'
]);

export const publicationStyleSchema = z.object({
  tone: z.string().trim().min(1).max(120),
  readingLevel: z.enum(['introductory', 'intermediate', 'advanced']),
  voice: z.enum(['pastoral', 'instructional', 'reflective'])
}).strict();

export const publicationMetadataSchema = z.object({
  publicationId: z.string().trim().min(1).max(80),
  publicationType: z.literal('cta-guide'),
  title: z.string().trim().min(1).max(240),
  subtitle: z.string().trim().min(1).max(300).nullable(),
  author: z.string().trim().min(1).max(120),
  organization: z.string().trim().min(1).max(120).nullable(),
  generatedAt: z.string().datetime({ offset: true }),
  sourceVersionId: z.string().trim().min(1).max(80),
  sourceContentHash: z.string().trim().min(1).max(200),
  pipelineVersion: z.string().trim().min(1).max(40),
  audience: publicationAudienceSchema,
  theme: publicationThemeSchema,
  style: publicationStyleSchema
}).strict();

export const publicationAssetSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.literal('image'),
  uri: z.string().trim().min(1).max(1024),
  altText: z.string().trim().min(1).max(240).nullable(),
  mimeType: z.string().trim().min(1).max(100).nullable()
}).strict();

export const publicationReferenceSchema = z.object({
  id: z.string().trim().min(1).max(80),
  referenceType: z.enum(['bible', 'external', 'internal']),
  label: z.string().trim().min(1).max(240),
  detail: z.string().trim().min(1).max(400),
  url: z.string().trim().url().max(1024).nullable(),
  targetId: z.string().trim().min(1).max(80).nullable()
}).strict().superRefine((value, context) => {
  if (value.referenceType === 'internal' && value.targetId === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Internal references must target a valid document ID.',
      path: ['targetId']
    });
  }

  if (value.referenceType !== 'internal' && value.targetId !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only internal references may include a document target.',
      path: ['targetId']
    });
  }
});

export const publicationCitationSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(400),
  referenceId: z.string().trim().min(1).max(80).nullable()
}).strict();

export const publicationFootnoteSchema = z.object({
  id: z.string().trim().min(1).max(80),
  marker: z.string().trim().min(1).max(20),
  text: z.string().trim().min(1).max(400)
}).strict();

export const publicationSidebarSchema = z.object({
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(1000)
}).strict();

export const publicationImageSchema = z.object({
  assetId: z.string().trim().min(1).max(80),
  caption: z.string().trim().min(1).max(240).nullable()
}).strict();

export const publicationTableSchema = z.object({
  headers: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
  rows: z.array(z.array(z.string().trim().min(1).max(240)).min(1).max(8)).max(40)
}).strict().superRefine((value, context) => {
  const expectedColumns = value.headers.length;

  for (const [index, row] of value.rows.entries()) {
    if (row.length !== expectedColumns) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Table rows must match the header column count.',
        path: ['rows', index]
      });
    }
  }
});

const textBlockSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(['paragraph', 'reflection', 'prayer', 'journal-prompt', 'key-takeaway', 'warning', 'highlight', 'quote']),
  text: z.string().trim().min(1).max(2000),
  attribution: z.string().trim().min(1).max(120).nullable(),
  citationIds: idListSchema.optional(),
  footnoteIds: idListSchema.optional()
}).strict();

const headingBlockSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string().trim().min(1).max(200),
  citationIds: idListSchema.optional(),
  footnoteIds: idListSchema.optional()
}).strict();

const ctaBlockSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.literal('call-to-action'),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(800),
  action: z.string().trim().min(1).max(200),
  citationIds: idListSchema.optional(),
  footnoteIds: idListSchema.optional()
}).strict();

const scriptureBlockSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.literal('scripture'),
  references: z.array(z.string().trim().min(1).max(200)).max(40),
  text: z.string().trim().min(1).max(1200),
  citationIds: idListSchema.optional(),
  footnoteIds: idListSchema.optional()
}).strict();

const listBlockSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.enum(['checklist', 'bullet-list', 'numbered-list']),
  items: z.array(z.string().trim().min(1).max(240)).min(1).max(40),
  citationIds: idListSchema.optional(),
  footnoteIds: idListSchema.optional()
}).strict();

const sidebarBlockSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.literal('sidebar'),
  sidebar: publicationSidebarSchema
}).strict();

const imagePlaceholderBlockSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.literal('image-placeholder'),
  image: publicationImageSchema
}).strict();

const tableBlockSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.literal('table'),
  table: publicationTableSchema
}).strict();

const dividerBlockSchema = z.object({
  id: z.string().trim().min(1).max(80),
  type: z.literal('divider')
}).strict();

export const publicationBlockSchema = z.discriminatedUnion('type', [
  headingBlockSchema,
  textBlockSchema,
  ctaBlockSchema,
  scriptureBlockSchema,
  listBlockSchema,
  sidebarBlockSchema,
  imagePlaceholderBlockSchema,
  tableBlockSchema,
  dividerBlockSchema
]);

export const publicationSectionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120),
  order: z.number().int().nonnegative().safe(),
  blocks: z.array(publicationBlockSchema).min(1).max(80)
}).strict();

export const publicationCoverSchema = z.object({
  title: z.string().trim().min(1).max(240),
  subtitle: z.string().trim().min(1).max(300).nullable(),
  author: z.string().trim().min(1).max(120),
  organization: z.string().trim().min(1).max(120).nullable(),
  coverImageAssetId: z.string().trim().min(1).max(80).nullable(),
  branding: z.string().trim().min(1).max(120).nullable(),
  generatedDate: z.string().datetime({ offset: true }),
  publicationType: z.literal('cta-guide')
}).strict();

export const publicationTableOfContentsEntrySchema = z.object({
  id: z.string().trim().min(1).max(80),
  targetId: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  anchor: z.string().trim().min(1).max(200),
  parentId: z.string().trim().min(1).max(80).nullable(),
  pageNumber: z.number().int().nonnegative().nullable()
}).strict();

export const publicationTableOfContentsSchema = z.object({
  entries: z.array(publicationTableOfContentsEntrySchema).max(400)
}).strict();

export const publicationDocumentSchema = z.object({
  schemaVersion: z.literal('1.0'),
  layoutIntent: z.enum(['digital-first', 'print-first']),
  language: z.string().trim().min(2).max(20)
}).strict();

export const publicationRenderOptionsSchema = z.object({
  preferredTargets: z.array(z.enum(['cta-guide', 'epub', 'pdf', 'html', 'docx', 'markdown'])).min(1).max(6),
  includeCover: z.boolean(),
  includeToc: z.boolean()
}).strict();

export const publicationSchema = z.object({
  metadata: publicationMetadataSchema,
  cover: publicationCoverSchema,
  toc: publicationTableOfContentsSchema,
  sections: z.array(publicationSectionSchema).min(1).max(100),
  references: z.array(publicationReferenceSchema).max(400),
  citations: z.array(publicationCitationSchema).max(400),
  footnotes: z.array(publicationFootnoteSchema).max(400),
  assets: z.array(publicationAssetSchema).max(200),
  document: publicationDocumentSchema,
  renderOptions: publicationRenderOptionsSchema
}).strict().superRefine((value, context) => {
  const addDuplicateIssue = (path: Array<string | number>, category: string) => {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate ${category} ID detected.`,
      path
    });
  };

  const addDanglingIssue = (path: Array<string | number>, kind: string) => {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Dangling ${kind} target detected.`,
      path
    });
  };

  const uniqueSections = new Set<string>();
  const uniqueBlocks = new Set<string>();
  const uniqueAssets = new Set<string>();
  const uniqueReferences = new Set<string>();
  const uniqueCitations = new Set<string>();
  const uniqueFootnotes = new Set<string>();
  const uniqueTocEntries = new Set<string>();
  const validTargetIds = new Set<string>();

  for (const [index, section] of value.sections.entries()) {

    if (uniqueSections.has(section.id)) {
      addDuplicateIssue(['sections', index, 'id'], 'section');
    }

    uniqueSections.add(section.id);
    validTargetIds.add(section.id);

    for (const [blockIndex, block] of section.blocks.entries()) {

      if (uniqueBlocks.has(block.id)) {
        addDuplicateIssue(['sections', index, 'blocks', blockIndex, 'id'], 'block');
      }

      uniqueBlocks.add(block.id);
      validTargetIds.add(block.id);
    }
  }

  for (const [index, asset] of value.assets.entries()) {

    if (uniqueAssets.has(asset.id)) {
      addDuplicateIssue(['assets', index, 'id'], 'asset');
    }

    uniqueAssets.add(asset.id);
  }

  for (const [index, reference] of value.references.entries()) {

    if (uniqueReferences.has(reference.id)) {
      addDuplicateIssue(['references', index, 'id'], 'reference');
    }

    uniqueReferences.add(reference.id);

    if (reference.referenceType === 'internal' && reference.targetId !== null && !validTargetIds.has(reference.targetId)) {
      addDanglingIssue(['references', index, 'targetId'], 'internal reference');
    }
  }

  for (const [index, citation] of value.citations.entries()) {

    if (uniqueCitations.has(citation.id)) {
      addDuplicateIssue(['citations', index, 'id'], 'citation');
    }

    uniqueCitations.add(citation.id);

    if (citation.referenceId !== null && !uniqueReferences.has(citation.referenceId)) {
      addDanglingIssue(['citations', index, 'referenceId'], 'citation reference');
    }
  }

  for (const [index, footnote] of value.footnotes.entries()) {

    if (uniqueFootnotes.has(footnote.id)) {
      addDuplicateIssue(['footnotes', index, 'id'], 'footnote');
    }

    uniqueFootnotes.add(footnote.id);
  }

  for (const [index, tocEntry] of value.toc.entries.entries()) {

    if (uniqueTocEntries.has(tocEntry.id)) {
      addDuplicateIssue(['toc', 'entries', index, 'id'], 'TOC entry');
    }

    uniqueTocEntries.add(tocEntry.id);

    if (!validTargetIds.has(tocEntry.targetId)) {
      addDanglingIssue(['toc', 'entries', index, 'targetId'], 'TOC');
    }

    if (tocEntry.parentId !== null && !uniqueTocEntries.has(tocEntry.parentId)) {
      addDanglingIssue(['toc', 'entries', index, 'parentId'], 'TOC parent');
    }
  }

  if (value.cover.coverImageAssetId !== null && !uniqueAssets.has(value.cover.coverImageAssetId)) {
    addDanglingIssue(['cover', 'coverImageAssetId'], 'cover image asset');
  }

  for (const [index, section] of value.sections.entries()) {

    for (const [blockIndex, block] of section.blocks.entries()) {

      if (block.type === 'image-placeholder' && !uniqueAssets.has(block.image.assetId)) {
        addDanglingIssue(['sections', index, 'blocks', blockIndex, 'image', 'assetId'], 'image asset');
      }

      if ('footnoteIds' in block && block.footnoteIds) {
        for (const [footnoteIndex, footnoteId] of block.footnoteIds.entries()) {
          if (!uniqueFootnotes.has(footnoteId)) {
            addDanglingIssue(
              ['sections', index, 'blocks', blockIndex, 'footnoteIds', footnoteIndex],
              'footnote'
            );
          }
        }
      }

      if ('citationIds' in block && block.citationIds) {
        for (const [citationIndex, citationId] of block.citationIds.entries()) {
          if (!uniqueCitations.has(citationId)) {
            addDanglingIssue(
              ['sections', index, 'blocks', blockIndex, 'citationIds', citationIndex],
              'citation'
            );
          }
        }
      }
    }
  }

  const substantiveSections = value.sections.filter((section) => section.id !== 'cover' && section.id !== 'table-of-contents');

  if (substantiveSections.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Publication must contain substantive sections beyond cover and table of contents.',
      path: ['sections']
    });
  }
});

export type Publication = z.infer<typeof publicationSchema>;
