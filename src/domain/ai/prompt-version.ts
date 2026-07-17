import type { z } from 'zod';

import type { AIModelPreference } from './ai-model.js';

export type PromptDefinition<TInput, TSchema extends z.ZodTypeAny> = {
  readonly stage: string;
  readonly key: string;
  readonly version: string;
  readonly schema: TSchema;
  readonly modelPreference: AIModelPreference;
  buildPrompt: (input: TInput) => string;
};

export type PromptRunMetadata = {
  readonly stage: string;
  readonly promptKey: string;
  readonly promptVersion: string;
};
