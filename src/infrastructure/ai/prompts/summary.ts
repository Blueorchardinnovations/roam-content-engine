import type { PromptDefinition } from '../../../domain/ai/prompt-version.js';
import { aiSummarySchema } from '../../../schemas/ai/summary-schema.js';

import type { PromptInput } from './prompt-input.js';

export const summaryPrompt: PromptDefinition<PromptInput, typeof aiSummarySchema> = {
  stage: 'summary',
  key: 'summary',
  version: '1.0',
  schema: aiSummarySchema,
  modelPreference: {
    model: 'default',
    temperature: 0.1,
    maxTokens: 700
  },
  buildPrompt: (input) => [
    'Generate a short and detailed summary of the transcript.',
    'Return strict JSON matching the requested schema.',
    'Transcript:',
    input.transcriptText
  ].join('\n\n')
};
