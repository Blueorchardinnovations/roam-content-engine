import { z } from 'zod';

const boundedText = (maxLength: number) => z.string().trim().min(1).max(maxLength);

export const aiMetadataSchema = z.object({
  title: boundedText(120),
  description: boundedText(500),
  language: z.string().trim().min(2).max(20),
  audience: boundedText(80)
}).strict();

export type AIMetadata = z.infer<typeof aiMetadataSchema>;
