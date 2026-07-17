import type { SourceVersionRepository } from '../../domain/repositories/source-version-repository.js';
import type { ContentJobStage, TranscriptProcessingResult } from '../../domain/content-jobs/types.js';
import type { JobProcessor } from '../../domain/workers/job-processor.js';
import type { WorkerLeasedJob } from '../../domain/workers/worker-types.js';
import { PermanentWorkerError, WorkerCancelledError } from '../../domain/workers/worker-errors.js';
import { ErrorCode } from '../../platform/shared/errors/codes.js';
import { normalizeTranscript, computeTranscriptHash } from '../../platform/security/hashing/index.js';

export class DeterministicTranscriptProcessor implements JobProcessor {
  public readonly jobType = 'transcript-processing' as const;

  public constructor(
    private readonly sourceVersionRepository: SourceVersionRepository,
    private readonly now: () => Date
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

    const processedAt = this.now().toISOString();

    return {
      schemaVersion: '1.0' as const,
      sourceVersionId: sourceVersion.id,
      contentHash: computeTranscriptHash(normalized),
      wordCount: words,
      characterCount: normalized.length,
      paragraphCount: paragraphs,
      lineCount: lines,
      processedAt
    };
  }
}
