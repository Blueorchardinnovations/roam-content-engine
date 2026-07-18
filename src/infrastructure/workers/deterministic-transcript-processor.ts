import type { SourceVersionRepository } from '../../domain/repositories/source-version-repository.js';
import type { ContentJobStage, TranscriptProcessingResult } from '../../domain/content-jobs/types.js';
import type { JobProcessor } from '../../domain/workers/job-processor.js';
import type { WorkerLeasedJob } from '../../domain/workers/worker-types.js';
import {
  AIAuthenticationError,
  AIPermanentError,
  AIValidationError,
  AIRateLimitError,
  AITimeoutError,
  AIProviderUnavailableError
} from '../../domain/ai/index.js';
import { PermanentWorkerError, RetryableWorkerError, WorkerCancelledError } from '../../domain/workers/worker-errors.js';
import { ErrorCode } from '../../platform/shared/errors/codes.js';
import { normalizeTranscript, computeTranscriptHash } from '../../platform/security/hashing/index.js';
import type { AIPipeline } from '../../application/ai/pipeline.js';
import type { HtmlComposer } from '../../application/publications/html-composer.js';
import type { PublicationGenerator } from '../../application/publications/publication-generator.js';
import {
  HtmlCancelledError,
  HtmlCompositionError,
  HtmlValidationError,
  UnsupportedHtmlElementError,
  PublicationBuildError,
  PublicationCancelledError,
  PublicationValidationError,
  UnsupportedPublicationTypeError
} from '../../application/publications/index.js';

export class DeterministicTranscriptProcessor implements JobProcessor {
  public readonly jobType = 'transcript-processing' as const;

  public constructor(
    private readonly sourceVersionRepository: SourceVersionRepository,
    private readonly now: () => Date,
    private readonly aiPipeline?: AIPipeline,
    private readonly publicationGenerator?: PublicationGenerator,
    private readonly htmlComposer?: HtmlComposer
  ) {}

  public async process(input: {
    readonly job: WorkerLeasedJob;
    readonly signal: AbortSignal;
    readonly reportStage: (stage: ContentJobStage) => Promise<void>;
    readonly heartbeat: () => Promise<void>;
  }): Promise<TranscriptProcessingResult> {
    if (input.signal.aborted) {
      throw new WorkerCancelledError();
    }

    const sourceVersion = await this.sourceVersionRepository.getById(
      input.job.tenantId,
      input.job.sourceVersionId
    );

    if (!sourceVersion) {
      throw new PermanentWorkerError(
        'Source version was not found for tenant-scoped job.',
        ErrorCode.SOURCE_VERSION_NOT_FOUND
      );
    }

    if (sourceVersion.projectId !== input.job.projectId) {
      throw new PermanentWorkerError(
        'Source version does not belong to the job project.',
        ErrorCode.SOURCE_PROJECT_MISMATCH
      );
    }

    await input.reportStage('normalizing-transcript');
    await input.heartbeat();

    if (input.signal.aborted) {
      throw new WorkerCancelledError();
    }

    const normalized = normalizeTranscript(sourceVersion.transcriptText);

    await input.reportStage('calculating-statistics');

    const words = normalized.length === 0
      ? 0
      : normalized.split(/\s+/).filter((part) => part.length > 0).length;

    const paragraphs = normalized.length === 0
      ? 0
      : normalized.split(/\n\s*\n/).filter((part) => part.trim().length > 0).length;

    const lines = normalized.length === 0
      ? 0
      : normalized.split(/\n/).filter((part) => part.trim().length > 0).length;

    let aiResult: TranscriptProcessingResult['ai'];
    let publicationResult: TranscriptProcessingResult['publication'];
    let htmlDocumentResult: TranscriptProcessingResult['htmlDocument'];

    if (this.aiPipeline) {
      try {
        aiResult = await this.aiPipeline.run(
          {
            transcriptText: normalized
          },
          input.signal
        );
      } catch (error) {
        if (
          error instanceof AIProviderUnavailableError
          || error instanceof AIRateLimitError
          || error instanceof AITimeoutError
        ) {
          throw new RetryableWorkerError(error.message, error.code);
        }

        if (
          error instanceof AIAuthenticationError
          || error instanceof AIValidationError
          || error instanceof AIPermanentError
        ) {
          throw new PermanentWorkerError(error.message, error.code);
        }

        throw error;
      }
    }

    if (aiResult) {
      if (!this.publicationGenerator) {
        throw new PermanentWorkerError(
          'Publication generation is not configured.',
          ErrorCode.PUBLICATION_BUILD_ERROR
        );
      }

      try {
        publicationResult = await this.publicationGenerator.build(
          {
            sourceVersionId: sourceVersion.id,
            sourceContentHash: computeTranscriptHash(normalized),
            aiResult,
            publicationType: 'cta-guide'
          },
          input.signal
        );
      } catch (error) {
        if (error instanceof PublicationCancelledError || input.signal.aborted) {
          throw new WorkerCancelledError();
        }

        if (error instanceof PublicationValidationError) {
          throw new PermanentWorkerError(
            'Publication validation failed.',
            ErrorCode.PUBLICATION_VALIDATION_ERROR
          );
        }

        if (error instanceof UnsupportedPublicationTypeError) {
          throw new PermanentWorkerError(
            'Unsupported publication type.',
            ErrorCode.PUBLICATION_UNSUPPORTED_TYPE
          );
        }

        if (error instanceof PublicationBuildError) {
          throw new PermanentWorkerError(
            'Publication build failed.',
            ErrorCode.PUBLICATION_BUILD_ERROR
          );
        }

        throw error;
      }

      if (!this.htmlComposer) {
        throw new PermanentWorkerError(
          'HTML composition is not configured.',
          ErrorCode.HTML_COMPOSITION_ERROR
        );
      }

      try {
        htmlDocumentResult = this.htmlComposer.compose(publicationResult, input.signal);
      } catch (error) {
        if (error instanceof HtmlCancelledError || input.signal.aborted) {
          throw new WorkerCancelledError();
        }

        if (error instanceof HtmlValidationError) {
          throw new PermanentWorkerError(
            'HTML document validation failed.',
            ErrorCode.HTML_VALIDATION_ERROR
          );
        }

        if (error instanceof UnsupportedHtmlElementError) {
          throw new PermanentWorkerError(
            'HTML document uses unsupported element mappings.',
            ErrorCode.HTML_UNSUPPORTED_ELEMENT
          );
        }

        if (error instanceof HtmlCompositionError) {
          throw new PermanentWorkerError(
            'HTML document composition failed.',
            ErrorCode.HTML_COMPOSITION_ERROR
          );
        }

        throw error;
      }
    }

    if (input.signal.aborted) {
      throw new WorkerCancelledError();
    }

    const processedAt = this.now().toISOString();

    return {
      schemaVersion: '1.0' as const,
      sourceVersionId: sourceVersion.id,
      contentHash: computeTranscriptHash(normalized),
      wordCount: words,
      characterCount: normalized.length,
      paragraphCount: paragraphs,
      lineCount: lines,
      processedAt,
      ai: aiResult,
      publication: publicationResult,
      htmlDocument: htmlDocumentResult
    };
  }
}
