import { z } from 'zod';

import {
  contentJobIdSchema,
  idempotencyKeySchema,
  projectIdSchema
} from './common-schemas.js';
import { isPrefixedId } from '../../platform/identity/ids/index.js';

const publishOutputFormatSchema = z.enum(['html', 'pdf', 'epub']);
const publishModeSchema = z.enum(['standard', 'cta-guide']);

const renderOptionsSchema = z.object({
  densityId: z.enum(['comfortable', 'standard', 'compact', 'high-density']).optional(),
  layoutId: z.enum(['single-column', 'two-column', 'wide-content']).optional(),
  includeToc: z.boolean().optional()
}).strict();

const standardPublicationMetadataSchema = z.object({
  publicationId: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(400).optional(),
  language: z.string().trim().min(2).max(16).optional(),
  theme: z.string().trim().min(1).max(80).optional()
}).strict();

const ctaPublicationMetadataSchema = z.object({
  publicationId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(400),
  language: z.string().trim().min(2).max(16),
  theme: z.string().trim().min(1).max(80),
  audience: z.string().trim().min(1).max(120).optional()
}).strict();

export const createPublishJobBodySchema = z
  .object({
    projectId: projectIdSchema,
    sourceContentJobId: contentJobIdSchema,
    outputFormat: publishOutputFormatSchema,
    publishMode: publishModeSchema,
    renderOptions: renderOptionsSchema.nullable().optional(),
    publicationMetadata: z.union([
      standardPublicationMetadataSchema,
      ctaPublicationMetadataSchema,
      z.null()
    ]).optional()
  })
  .strict();

export const createPublishJobHeadersSchema = z
  .object({
    'idempotency-key': idempotencyKeySchema
  })
  .passthrough();

export const publishJobParamsSchema = z
  .object({
    publishJobId: z
      .string()
      .refine((value) => isPrefixedId(value, 'pjob'), 'Invalid publish job ID.')
  })
  .strict();
