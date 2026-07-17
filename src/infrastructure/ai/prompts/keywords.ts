import type { PromptDefinition } from '../../../domain/ai/prompt-version.js';
import { aiKeywordsSchema } from '../../../schemas/ai/keywords-schema.js';

import type { PromptInput } from './prompt-input.js';

export const keywordsPrompt: PromptDefinition<PromptInput, typeof aiKeywordsSchema> = {
  stage: 'keywords',
  key: 'keywords',
  version: '1.0',
  schema: aiKeywordsSchema,
  modelPreference: {
    model: 'default',
    temperature: 0,
    maxTokens: 250
  },
  buildPrompt: (input) => [
    'Extract important keywords from the transcript.',
    'Use clear lowercase keyword phrases.',
    'Return strict JSON matching the requested schema.',
    'Transcript:',
    input.transcriptText
  ].join('\n\n')
};
