import { z } from 'zod';

import {
  projectIdSchema,
  sourceVersionIdSchema
} from './common-schemas.js';

export const createSourceVersionBodySchema = z
  .object({
    projectId: projectIdSchema,
    transcriptText: z.string().trim().min(1, 'Transcript text is required.'),
    sourceType: z.literal('transcript').optional(),
    sourceReference: z.string().trim().min(1).max(255).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const getSourceVersionParamsSchema = z
  .object({
    sourceVersionId: sourceVersionIdSchema
  })
  .strict();
