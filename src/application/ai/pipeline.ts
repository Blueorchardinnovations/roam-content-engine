import type { AIProvider } from '../../domain/ai/ai-provider.js';
import { aiPipelineResultSchema, type AIPipelineResult } from '../../schemas/ai/pipeline-schema.js';
import {
  keywordsPrompt,
  metadataPrompt,
  reflectionsPrompt,
  scripturePrompt,
  summaryPrompt,
  type PromptInput
} from '../../infrastructure/ai/prompts/index.js';

import { PromptRunner } from './prompt-runner.js';
import { mergeUsageTotals } from './usage-recorder.js';

export class AIPipeline {
  private readonly runner: PromptRunner;

  public constructor(
    private readonly provider: AIProvider,
    private readonly pipelineVersion: string,
    private readonly timeoutMs: number
  ) {
    this.runner = new PromptRunner(provider, timeoutMs, pipelineVersion);
  }

  public async run(input: PromptInput, signal: AbortSignal): Promise<AIPipelineResult> {
    const metadata = await this.runner.run(metadataPrompt, input, signal);
    const keywords = await this.runner.run(keywordsPrompt, input, signal);
    const summary = await this.runner.run(summaryPrompt, input, signal);
    const scripture = await this.runner.run(scripturePrompt, input, signal);

    const reflections = await this.runner.run(
      reflectionsPrompt,
      {
        ...input,
        summaryText: summary.output.shortSummary,
        keywords: keywords.output.keywords
      },
      signal
    );

    const promptExecutions = [metadata, keywords, summary, scripture, reflections].map((run) => ({
      stage: run.metadata.stage,
      promptKey: run.metadata.promptKey,
      promptVersion: run.metadata.promptVersion,
      pipelineVersion: this.pipelineVersion,
      provider: run.provider,
      model: run.model,
      generatedAt: run.generatedAt,
      usage: run.usage
    }));

    const usageTotals = mergeUsageTotals(promptExecutions.map((execution) => execution.usage));
    const finalGeneratedAt = promptExecutions[promptExecutions.length - 1]?.generatedAt
      ?? new Date().toISOString();

    return aiPipelineResultSchema.parse({
      pipelineVersion: this.pipelineVersion,
      provider: this.provider.providerName,
      model: promptExecutions[promptExecutions.length - 1]?.model ?? 'unknown',
      generatedAt: finalGeneratedAt,
      metadata: metadata.output,
      summary: summary.output,
      keywords: keywords.output,
      scripture: scripture.output,
      reflections: reflections.output,
      promptExecutions,
      usageTotals
    });
  }
}
