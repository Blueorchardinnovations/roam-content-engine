import type { AIPipelineResult } from '../../schemas/ai/pipeline-schema.js';
import type { PublicationAudience, PublicationTheme } from '../../domain/publications/types.js';
import type { Publication } from '../../schemas/publications/publication-schema.js';

export type PublicationBuildInput = {
  readonly sourceVersionId: string;
  readonly sourceContentHash: string;
  readonly aiResult: AIPipelineResult | unknown;
  readonly publicationType: string;
  readonly audience?: PublicationAudience;
  readonly theme?: PublicationTheme;
};

export interface PublicationGenerator {
  build(input: PublicationBuildInput, signal?: AbortSignal): Publication | Promise<Publication>;
}