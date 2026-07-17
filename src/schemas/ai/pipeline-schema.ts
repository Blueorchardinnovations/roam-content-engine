import { z } from 'zod';

import { aiKeywordsSchema } from './keywords-schema.js';
import { aiMetadataSchema } from './metadata-schema.js';
import { aiReflectionsSchema } from './reflections-schema.js';
import { aiScriptureSchema } from './scripture-schema.js';
import { aiSummarySchema } from './summary-schema.js';

const safeTokenCountSchema = z.number().int().nonnegative().safe();

const aiUsageSchema = z.object({
  inputTokens: safeTokenCountSchema,
  outputTokens: safeTokenCountSchema,
  totalTokens: safeTokenCountSchema,
  estimatedCostUsd: z.number().finite().nonnegative().nullable(),
  latencyMs: z.number().int().nonnegative().safe()
}).strict().superRefine((value, context) => {
  if (value.totalTokens !== value.inputTokens + value.outputTokens) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'totalTokens must equal inputTokens + outputTokens.',
      path: ['totalTokens']
    });
  }
});

export const aiPromptExecutionRecordSchema = z.object({
  stage: z.enum(['metadata', 'keywords', 'summary', 'scripture', 'reflections']),
  promptKey: z.string().min(1),
  promptVersion: z.string().min(1),
  pipelineVersion: z.string().trim().min(1),
  provider: z.enum(['mock', 'openai']),
  model: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  usage: aiUsageSchema
}).strict();

export const aiPipelineResultSchema = z.object({
  pipelineVersion: z.string().trim().min(1),
  provider: z.enum(['mock', 'openai']),
  model: z.string().min(1),
  generatedAt: z.string().datetime({ offset: true }),
  metadata: aiMetadataSchema,
  summary: aiSummarySchema,
  keywords: aiKeywordsSchema,
  scripture: aiScriptureSchema,
  reflections: aiReflectionsSchema,
  promptExecutions: z.array(aiPromptExecutionRecordSchema).min(1).max(5),
  usageTotals: aiUsageSchema
}).strict();

export type AIPipelineResult = z.infer<typeof aiPipelineResultSchema>;
