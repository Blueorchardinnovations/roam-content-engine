import { z } from 'zod';

import {
  contentJobIdSchema,
  idempotencyKeySchema,
  projectIdSchema,
  sourceVersionIdSchema
} from './common-schemas.js';

export const createContentJobBodySchema = z
  .object({
    projectId: projectIdSchema,
    sourceVersionId: sourceVersionIdSchema,
    jobType: z.literal('transcript-processing'),
    requestSchemaVersion: z.literal('1.0')
  })
  .strict();

export const createContentJobHeadersSchema = z
  .object({
    'idempotency-key': idempotencyKeySchema
  })
  .passthrough();

export const contentJobParamsSchema = z
  .object({
    jobId: contentJobIdSchema
  })
  .strict();
