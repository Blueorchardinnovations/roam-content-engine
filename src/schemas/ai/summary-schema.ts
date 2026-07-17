import { z } from 'zod';

export const aiSummarySchema = z.object({
  shortSummary: z.string().trim().min(1).max(240),
  detailedSummary: z.string().trim().min(1).max(2000)
}).strict();

export type AISummary = z.infer<typeof aiSummarySchema>;
