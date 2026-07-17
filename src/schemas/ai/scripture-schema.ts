import { z } from 'zod';

export const aiScriptureReferenceSchema = z.object({
  book: z.string().trim().min(1).max(80),
  chapter: z.number().int().positive(),
  verseStart: z.number().int().positive(),
  verseEnd: z.number().int().positive().nullable()
}).strict();

export const aiScriptureSchema = z.object({
  references: z.array(aiScriptureReferenceSchema).max(20)
}).strict();

export type AIScriptureReferences = z.infer<typeof aiScriptureSchema>;
