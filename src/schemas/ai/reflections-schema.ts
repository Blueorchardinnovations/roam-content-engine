import { z } from 'zod';

export const aiReflectionsSchema = z.object({
  reflections: z.array(z.string().trim().min(1).max(240)).min(1).max(10)
}).strict();

export type AIReflections = z.infer<typeof aiReflectionsSchema>;
