import { z } from 'zod';

export const aiKeywordsSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(80).transform((value) => value.toLowerCase())).min(1).max(20)
}).strict();

export type AIKeywords = z.infer<typeof aiKeywordsSchema>;
