import { z } from 'zod';

import { htmlDocumentSchema } from '../publications/html-document-schema.js';

export const renderFormatSchema = z.enum(['html', 'pdf', 'epub', 'docx', 'markdown']);

export const renderThemeSchema = z.enum([
  'classic',
  'modern',
  'ministry',
  'workbook',
  'magazine',
  'minimal',
  'dark'
]);

export const renderArtifactPayloadRepresentationSchema = z.enum([
  'structured-json',
  'html-markup',
  'binary',
  'storage-reference'
]);

export const renderWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
}).strict();

export const renderErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
}).strict();

export const renderRequestMetadataSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().min(1).nullable(),
  author: z.string().min(1),
  speaker: z.string().min(1).nullable(),
  organization: z.string().min(1).nullable(),
  publicationDate: z.iso.datetime(),
  language: z.string().min(2),
  theme: renderThemeSchema,
  keywords: z.array(z.string().min(1)).max(50),
  description: z.string().min(1).nullable(),
  coverImageReference: z.string().min(1).nullable(),
  copyright: z.string().min(1).nullable(),
  license: z.string().min(1).nullable()
}).strict();

export const renderOptionsSchema = z.object({
  format: renderFormatSchema,
  theme: renderThemeSchema
}).strict();

export const rendererCapabilitiesSchema = z.object({
  renderer: z.string().min(1),
  formats: z.array(renderFormatSchema).min(1).max(5),
  themes: z.array(renderThemeSchema).min(1).max(7),
  supportedTokenCategories: z.array(z.enum([
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
  ])).min(1)
}).strict();

export const renderRequestSchema = z.object({
  htmlDocument: htmlDocumentSchema,
  metadata: renderRequestMetadataSchema,
  options: renderOptionsSchema
}).strict();

export const renderArtifactMetadataSchema = z.object({
  artifactId: z.string().min(1),
  status: z.enum(['ready', 'warning', 'error']),
  format: renderFormatSchema,
  payloadRepresentation: renderArtifactPayloadRepresentationSchema.optional(),
  mimeType: z.string().min(1),
  fileExtension: z.enum(['.html', '.json', '.pdf', '.epub', '.docx', '.md']),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  warnings: z.array(renderWarningSchema),
  errors: z.array(renderErrorSchema)
}).strict();

export const inlineArtifactContentSchema = z.object({
  kind: z.literal('inline'),
  encoding: z.enum(['utf-8', 'base64']),
  bytesBase64: z.string().min(1),
  serializedDocument: z.string().min(1)
}).strict();

export const artifactStorageReferenceSchema = z.union([
  z.object({
    kind: z.literal('none')
  }).strict(),
  z.object({
    kind: z.literal('storage'),
    provider: z.enum(['azure-blob', 's3', 'gcs', 'filesystem']),
    uri: z.string().min(1),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().int().nonnegative()
  }).strict()
]);

export const renderArtifactSchema = z.object({
  metadata: renderArtifactMetadataSchema,
  content: inlineArtifactContentSchema.nullable(),
  storage: artifactStorageReferenceSchema
}).strict();

export type RenderFormat = z.infer<typeof renderFormatSchema>;
export type RenderTheme = z.infer<typeof renderThemeSchema>;
export type RenderArtifactPayloadRepresentation = z.infer<
  typeof renderArtifactPayloadRepresentationSchema
>;
export type RenderRequestMetadata = z.infer<typeof renderRequestMetadataSchema>;
export type RenderOptions = z.infer<typeof renderOptionsSchema>;
export type RenderRequest = z.infer<typeof renderRequestSchema>;
export type RendererCapabilities = z.infer<typeof rendererCapabilitiesSchema>;
export type RenderArtifactMetadata = z.infer<typeof renderArtifactMetadataSchema>;
export type InlineArtifactContent = z.infer<typeof inlineArtifactContentSchema>;
export type ArtifactStorageReference = z.infer<typeof artifactStorageReferenceSchema>;
export type RenderArtifact = z.infer<typeof renderArtifactSchema>;