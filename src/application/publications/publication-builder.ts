import { z } from 'zod';

import type { AIPipelineResult } from '../../schemas/ai/pipeline-schema.js';
import { aiPipelineResultSchema } from '../../schemas/ai/pipeline-schema.js';
import { publicationSchema, type Publication } from '../../schemas/publications/publication-schema.js';
import type { PublicationAudience, PublicationTheme } from '../../domain/publications/types.js';
import type { PublicationBuildInput, PublicationGenerator } from './publication-generator.js';
import {
  PublicationBuildError,
  PublicationCancelledError,
  PublicationValidationError,
  UnsupportedPublicationTypeError
} from './publication-errors.js';

import { buildCtaGuidePublication } from './templates/cta-guide-template.js';

const publicationBuilderInputSchema = z.object({
  sourceVersionId: z.string().trim().min(1).max(80),
  sourceContentHash: z.string().trim().min(1).max(200),
  aiResult: z.unknown(),
  publicationType: z.string().trim().min(1).max(80),
  audience: z.enum(['general', 'church', 'youth', 'small-group', 'leadership', 'bible-study', 'education', 'nonprofit', 'coaching']).optional(),
  theme: z.enum(['classic', 'modern', 'ministry', 'workbook', 'magazine', 'minimal', 'dark']).optional()
}).strict();

export type PublicationBuilderInput = PublicationBuildInput;

export class PublicationBuilder implements PublicationGenerator {
  public constructor(
    private readonly now: () => Date
  ) {}

  public build(input: PublicationBuilderInput, signal?: AbortSignal): Publication {
    if (signal?.aborted) {
      throw new PublicationCancelledError();
    }

    const validatedInput = publicationBuilderInputSchema.parse(input);

    let aiResult: AIPipelineResult;

    try {
      aiResult = aiPipelineResultSchema.parse(input.aiResult);
    } catch {
      throw new PublicationValidationError('AI payload is invalid for publication generation.');
    }

    const publicationId = `pub_${validatedInput.sourceVersionId}`;
    const generatedAt = this.now().toISOString();
    const audience = validatedInput.audience ?? this.mapAudience(aiResult.metadata.audience);
    const theme = validatedInput.theme ?? 'ministry';

    try {
      switch (validatedInput.publicationType) {
        case 'cta-guide': {
          const publication = buildCtaGuidePublication({
            publicationId,
            sourceVersionId: validatedInput.sourceVersionId,
            sourceContentHash: validatedInput.sourceContentHash,
            generatedAt,
            ai: aiResult,
            audience,
            theme
          });

          return publicationSchema.parse(publication);
        }
        default:
          throw new UnsupportedPublicationTypeError(validatedInput.publicationType);
      }
    } catch (error) {
      if (error instanceof PublicationCancelledError || error instanceof PublicationValidationError || error instanceof UnsupportedPublicationTypeError) {
        throw error;
      }

      if (error instanceof z.ZodError) {
        throw new PublicationValidationError();
      }

      throw new PublicationBuildError();
    }
  }

  private mapAudience(value: string): PublicationAudience {
    const normalized = value.trim().toLowerCase();

    if (normalized.includes('youth')) {
      return 'youth';
    }

    if (normalized.includes('leader')) {
      return 'leadership';
    }

    if (normalized.includes('small group')) {
      return 'small-group';
    }

    if (normalized.includes('study')) {
      return 'bible-study';
    }

    if (normalized.includes('education')) {
      return 'education';
    }

    if (normalized.includes('nonprofit')) {
      return 'nonprofit';
    }

    if (normalized.includes('coach')) {
      return 'coaching';
    }

    if (normalized.includes('church')) {
      return 'church';
    }

    return 'general';
  }
}
