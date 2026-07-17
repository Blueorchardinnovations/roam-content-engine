import type { PromptDefinition } from '../../../domain/ai/prompt-version.js';
import { aiMetadataSchema } from '../../../schemas/ai/metadata-schema.js';

import type { PromptInput } from './prompt-input.js';

export const metadataPrompt: PromptDefinition<PromptInput, typeof aiMetadataSchema> = {
  stage: 'metadata',
  key: 'metadata',
  version: '1.0',
  schema: aiMetadataSchema,
  modelPreference: {
    model: 'default',
    temperature: 0,
    maxTokens: 400
  },
  buildPrompt: (input) => [
    'Extract concise metadata from the transcript.',
    'Return strict JSON matching the requested schema.',
    'Transcript:',
    input.transcriptText
  ].join('\n\n')
};
