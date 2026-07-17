import type { PromptDefinition } from '../../../domain/ai/prompt-version.js';
import { aiScriptureSchema } from '../../../schemas/ai/scripture-schema.js';

import type { PromptInput } from './prompt-input.js';

export const scripturePrompt: PromptDefinition<PromptInput, typeof aiScriptureSchema> = {
  stage: 'scripture',
  key: 'scripture',
  version: '1.0',
  schema: aiScriptureSchema,
  modelPreference: {
    model: 'default',
    temperature: 0,
    maxTokens: 400
  },
  buildPrompt: (input) => [
    'Find explicit or implied scripture references in the transcript.',
    'If none are present, return an empty references list.',
    'Return strict JSON matching the requested schema.',
    'Transcript:',
    input.transcriptText
  ].join('\n\n')
};
