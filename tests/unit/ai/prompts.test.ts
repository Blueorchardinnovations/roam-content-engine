import { describe, expect, it } from 'vitest';

import {
  keywordsPrompt,
  metadataPrompt,
  reflectionsPrompt,
  scripturePrompt,
  summaryPrompt
} from '../../../src/infrastructure/ai/prompts/index.js';
import type { PromptDefinition } from '../../../src/domain/ai/prompt-version.js';

const promptCases: Array<{
  readonly name: string;
  readonly prompt: PromptDefinition<any, any>;
  readonly input: Record<string, unknown>;
  readonly expectedFragments: readonly string[];
}> = [
  {
    name: 'metadata',
    prompt: metadataPrompt,
    input: {
      transcriptText: 'A short transcript.'
    },
    expectedFragments: ['Extract concise metadata', 'strict JSON', 'Transcript:']
  },
  {
    name: 'keywords',
    prompt: keywordsPrompt,
    input: {
      transcriptText: 'A short transcript.'
    },
    expectedFragments: ['Extract important keywords', 'strict JSON', 'Transcript:']
  },
  {
    name: 'summary',
    prompt: summaryPrompt,
    input: {
      transcriptText: 'A short transcript.'
    },
    expectedFragments: ['Generate a short and detailed summary', 'strict JSON', 'Transcript:']
  },
  {
    name: 'scripture',
    prompt: scripturePrompt,
    input: {
      transcriptText: 'A short transcript.'
    },
    expectedFragments: ['Find explicit or implied scripture references', 'strict JSON', 'Transcript:']
  },
  {
    name: 'reflections',
    prompt: reflectionsPrompt,
    input: {
      transcriptText: 'A short transcript.',
      summaryText: 'Summary context'
    },
    expectedFragments: ['Produce concise reflection points', 'strict JSON', 'Summary context: Summary context']
  }
];

describe('ai prompt builders', () => {
  it.each(promptCases)('$name prompt is stable and well-formed', ({ prompt, input, expectedFragments }) => {
    const before = JSON.stringify(input);
    const promptText = prompt.buildPrompt(input);

    expect(prompt.stage).toBe(prompt.key);
    expect(prompt.version).toBe('1.0');
    expect(prompt.schema).toBeDefined();
    expect(prompt.modelPreference.temperature).toBeGreaterThanOrEqual(0);
    expect(prompt.modelPreference.maxTokens).toBeGreaterThan(0);
    expect(JSON.stringify(input)).toBe(before);
    expect(promptText).toContain('Transcript:');
    for (const fragment of expectedFragments) {
      expect(promptText).toContain(fragment);
    }
    expect(promptText).not.toContain('OPENAI_API_KEY');
    expect(promptText).not.toContain('AI_PROVIDER');
  });
});
