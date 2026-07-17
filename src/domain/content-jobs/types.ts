import { z } from 'zod';

import {
  isPrefixedId,
  type PrefixedId
} from '../../platform/identity/ids/index.js';
import { aiPipelineResultSchema } from '../../schemas/ai/pipeline-schema.js';
import { publicationSchema } from '../../schemas/publications/publication-schema.js';

export const contentJobStatuses = [
  'queued',
  'processing',
  'retrying',
  'completed',
  'failed',
  'cancelled'
] as const;

export type ContentJobStatus = (typeof contentJobStatuses)[number];

export const contentJobStages = [
  'queued',
  'normalizing-transcript',
  'calculating-statistics',
  'completed',
  'failed'
] as const;

export type ContentJobStage = (typeof contentJobStages)[number];

export type ContentJobId = PrefixedId<'job'>;
export type CorrelationId = PrefixedId<'corr'>;
export type SourceVersionId = PrefixedId<'srcver'>;
export type TenantId = PrefixedId<'tenant'>;
export type ProjectId = PrefixedId<'project'>;

const nonNegativeInt = z.number().int().nonnegative();

const sourceVersionIdSchema = z
  .string()
  .refine((value) => isPrefixedId(value, 'srcver'), 'Invalid source version ID.');

export const transcriptProcessingResultSchema = z.object({
  schemaVersion: z.literal('1.0'),
  sourceVersionId: sourceVersionIdSchema,
  contentHash: z.string().min(1),
  wordCount: nonNegativeInt,
  characterCount: nonNegativeInt,
  paragraphCount: nonNegativeInt,
  lineCount: nonNegativeInt,
  processedAt: z.string().datetime({ offset: true }),
  ai: aiPipelineResultSchema.optional(),
  publication: publicationSchema.optional()
}).strict();

export type TranscriptProcessingResult = z.infer<
  typeof transcriptProcessingResultSchema
>;

export type ContentJob = {
  readonly id: ContentJobId;
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  readonly sourceVersionId: SourceVersionId;
  readonly status: ContentJobStatus;
  readonly currentStage: ContentJobStage;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly attemptCount: number;
  readonly result: TranscriptProcessingResult | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly correlationId: CorrelationId;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly updatedAt: Date;
};

export type CreateContentJobInput = {
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  readonly sourceVersionId: SourceVersionId;
  readonly idempotencyKey: string;
  readonly correlationId?: CorrelationId;
  readonly jobType: 'transcript-processing';
  readonly requestSchemaVersion: '1.0';
};
