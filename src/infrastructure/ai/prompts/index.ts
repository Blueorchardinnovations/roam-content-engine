import type { z } from 'zod';

import type { PromptDefinition } from '../../../domain/ai/prompt-version.js';
import type { PromptInput } from './prompt-input.js';
import { keywordsPrompt } from './keywords.js';
import { metadataPrompt } from './metadata.js';
import { reflectionsPrompt } from './reflections.js';
import { scripturePrompt } from './scripture.js';
import { summaryPrompt } from './summary.js';

export const promptDefinitions = [
  metadataPrompt,
  keywordsPrompt,
  summaryPrompt,
  scripturePrompt,
  reflectionsPrompt
] as const satisfies readonly PromptDefinition<PromptInput, z.ZodTypeAny>[];

export { metadataPrompt, keywordsPrompt, summaryPrompt, scripturePrompt, reflectionsPrompt };
export type { PromptInput };
