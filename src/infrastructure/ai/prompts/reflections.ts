import type { PromptDefinition } from '../../../domain/ai/prompt-version.js';
import { aiReflectionsSchema } from '../../../schemas/ai/reflections-schema.js';

import type { PromptInput } from './prompt-input.js';

export const reflectionsPrompt: PromptDefinition<PromptInput, typeof aiReflectionsSchema> = {
  stage: 'reflections',
  key: 'reflections',
  version: '1.0',
  schema: aiReflectionsSchema,
  modelPreference: {
    model: 'default',
    temperature: 0.2,
    maxTokens: 500
  },
  buildPrompt: (input) => [
    'Produce concise reflection points from the transcript content.',
    'Return strict JSON matching the requested schema.',
    'Transcript:',
    input.transcriptText,
    input.summaryText ? `Summary context: ${input.summaryText}` : ''
  ].filter((line) => line.length > 0).join('\n\n')
};
