import { z } from 'zod';

import {
  publishEngineJobStates,
  publishEngineOutputFormats
} from './publish-engine-types.js';

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const checksumPattern = /^[a-f0-9]{64}$/;
const safeHeaderPattern = /^[^\r\n\u0000-\u001F\u007F]+$/;

const controlledString = z.string().trim().min(1).max(2000);

export const publishEngineOutputFormatSchema = z.enum(publishEngineOutputFormats);
export const publishEngineJobStateSchema = z.enum(publishEngineJobStates);

export const publishEngineJobIdSchema = z.string().regex(idPattern);

export const publishEngineCorrelationIdSchema = z.string()
  .min(1)
  .max(200)
  .regex(safeHeaderPattern)
  .refine((value) => value.trim() === value, 'Correlation ID must not include surrounding whitespace.');

export const publishEngineIdempotencyKeySchema = z.string()
  .min(1)
  .max(200)
  .regex(safeHeaderPattern)
  .refine((value) => value.trim() === value, 'Idempotency key must not include surrounding whitespace.');

export const publishEngineStyledHtmlSourceSchema = z.object({
  payloadRepresentation: z.literal('styled-html'),
  mimeType: z.literal('text/html; charset=utf-8'),
  fileExtension: z.literal('.html'),
  payload: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  checksumSha256: z.string().regex(checksumPattern)
}).strict();

export const publishEnginePublicationMetadataSchema = z.object({
  publicationId: controlledString.max(120).optional(),
  title: controlledString.max(400).optional(),
  language: z.string().trim().min(2).max(16).optional(),
  theme: z.string().trim().min(1).max(80).optional()
}).strict();

export const publishEngineRenderOptionsSchema = z.object({
  densityId: z.enum(['comfortable', 'standard', 'compact', 'high-density']).optional(),
  layoutId: z.enum(['single-column', 'two-column', 'wide-content']).optional(),
  includeToc: z.boolean().optional()
}).strict();

export const submitRenderRequestSchema = z.object({
  source: publishEngineStyledHtmlSourceSchema,
  outputFormat: publishEngineOutputFormatSchema,
  publication: publishEnginePublicationMetadataSchema.optional(),
  renderOptions: publishEngineRenderOptionsSchema.optional()
}).strict();

export const publishEngineCtaPublicationMetadataSchema = z.object({
  publicationId: controlledString.max(120),
  title: controlledString.max(400),
  language: z.string().trim().min(2).max(16),
  theme: z.string().trim().min(1).max(80),
  audience: z.string().trim().min(1).max(120).optional()
}).strict();

export const submitCtaRenderRequestSchema = z.object({
  source: publishEngineStyledHtmlSourceSchema,
  outputFormat: publishEngineOutputFormatSchema,
  publication: publishEngineCtaPublicationMetadataSchema,
  renderOptions: publishEngineRenderOptionsSchema.optional()
}).strict();

export const publishEngineJobErrorSchema = z.object({
  code: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2000),
  correlationId: publishEngineCorrelationIdSchema.optional()
}).strict();

export const publishEngineJobSchema = z.object({
  jobId: publishEngineJobIdSchema,
  state: publishEngineJobStateSchema,
  outputFormat: publishEngineOutputFormatSchema,
  correlationId: publishEngineCorrelationIdSchema.optional(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
  error: publishEngineJobErrorSchema.optional()
}).strict();

export const publishEngineDownloadSchema = z.object({
  jobId: publishEngineJobIdSchema,
  fileName: z.string().trim().min(1).max(512),
  mimeType: z.string().trim().min(1).max(200),
  byteSize: z.number().int().positive().optional(),
  checksumSha256: z.string().regex(checksumPattern).optional(),
  downloadUrl: z.url().optional(),
  expiresAt: z.iso.datetime().optional()
}).strict().superRefine((value, context) => {
  if (!value.downloadUrl) {
    return;
  }

  const parsed = new URL(value.downloadUrl);
  const protocol = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

  const isLocalHttp = protocol === 'http:' && localHosts.has(host);
  const isHttps = protocol === 'https:';

  if (!isHttps && !isLocalHttp) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Download URL must use HTTPS except for explicit local loopback addresses.',
      path: ['downloadUrl']
    });
  }
});

export const publishEngineRemoteErrorBodySchema = z.object({
  code: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(4000),
  correlationId: publishEngineCorrelationIdSchema.optional()
}).strict();

export const publishEngineRequestOptionsSchema = z.object({
  idempotencyKey: publishEngineIdempotencyKeySchema.optional(),
  correlationId: publishEngineCorrelationIdSchema.optional(),
  signal: z.instanceof(AbortSignal).optional(),
  timeoutMs: z.number().int().positive().max(300000).optional()
}).strict();

export const waitForPublishEngineJobOptionsSchema = publishEngineRequestOptionsSchema.extend({
  pollIntervalMs: z.number().int().positive().max(60000).optional(),
  maxWaitMs: z.number().int().positive().max(3_600_000).optional()
}).strict();

