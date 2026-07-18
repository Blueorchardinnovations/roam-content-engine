import { calculateRetryDelayMs, type RetryPolicyConfig } from '../workers/retry-policy.js';
import type { PublishEngineClient } from '../../infrastructure/publish-engine/publish-engine-client.js';
import {
  createPublishEngineStyledHtmlSourceFromRenderArtifact,
  validatePublishEngineStyledHtmlSource
} from '../../infrastructure/publish-engine/publish-engine-artifact-validator.js';
import type {
  PublishEngineCtaPublicationMetadata,
  PublishEngineDownload,
  PublishEngineJob,
  PublishEnginePublicationMetadata,
  PublishEngineRenderOptions
} from '../../infrastructure/publish-engine/publish-engine-types.js';
import {
  publishCtaMetadataBoundedSchema,
  publishDownloadMetadataSchema,
  publishRenderOptionsBoundedSchema,
  publishSourceArtifactSnapshotSchema,
  publishStandardMetadataBoundedSchema,
  type ClaimedPublishJob,
  type PublishDownloadMetadata,
  type PublishJobSource,
  type PublishJob
} from '../../domain/publish-jobs/index.js';
import type { PublishJobRepository } from '../../domain/repositories/publish-job-repository.js';
import { ErrorCode } from '../../platform/shared/errors/codes.js';
import { ValidationError } from '../../platform/shared/errors/index.js';

import {
  classifyPublishOrchestrationFailure,
  type PublishFailurePhase
} from './publish-retry-classifier.js';

class PublishLeaseLostError extends Error {
  public constructor() {
    super('Publish lease lost.');
    this.name = 'PublishLeaseLostError';
  }
}

export type PublishJobExecutionOutcome =
  | 'completed'
  | 'waiting'
  | 'retry-scheduled'
  | 'failed'
  | 'cancelled'
  | 'lease-lost';

export type PublishJobExecutorDependencies = {
  readonly source: PublishJobSource;
  readonly repository: PublishJobRepository;
  readonly publishEngineClient: PublishEngineClient;
  readonly now: () => Date;
  readonly pollIntervalMs: number;
  readonly leaseDurationMs: number;
  readonly heartbeatIntervalMs: number;
  readonly maxConsecutiveFailures: number;
  readonly retryPolicy: RetryPolicyConfig;
  readonly logger: {
    info: (payload: Record<string, unknown>, message: string) => void;
    warn: (payload: Record<string, unknown>, message: string) => void;
    error: (payload: Record<string, unknown>, message: string) => void;
  };
};

function isNonTerminalRemoteState(state: PublishEngineJob['state']): boolean {
  return state === 'queued' || state === 'accepted' || state === 'running' || state === 'processing';
}

function sanitizeDownloadMetadata(download: PublishEngineDownload): PublishDownloadMetadata {
  const { jobId, ...downloadMetadata } = download;
  void jobId;

  const parsed = publishDownloadMetadataSchema.safeParse(downloadMetadata);
  if (!parsed.success) {
    throw new ValidationError('Publish download metadata is invalid.', {
      issues: parsed.error.issues
    });
  }

  return {
    fileName: parsed.data.fileName,
    mimeType: parsed.data.mimeType,
    ...(parsed.data.byteSize === undefined ? {} : { byteSize: parsed.data.byteSize }),
    ...(parsed.data.checksumSha256 === undefined
      ? {}
      : { checksumSha256: parsed.data.checksumSha256 }),
    ...(parsed.data.downloadUrl === undefined ? {} : { downloadUrl: parsed.data.downloadUrl }),
    ...(parsed.data.expiresAt === undefined ? {} : { expiresAt: parsed.data.expiresAt })
  };
}

function normalizeCtaMetadata(
  metadata: ReturnType<typeof publishCtaMetadataBoundedSchema.parse>
): PublishEngineCtaPublicationMetadata {
  return {
    publicationId: metadata.publicationId,
    title: metadata.title,
    language: metadata.language,
    theme: metadata.theme,
    ...(metadata.audience === undefined ? {} : { audience: metadata.audience })
  };
}

function normalizeStandardMetadata(
  metadata: ReturnType<typeof publishStandardMetadataBoundedSchema.parse>
): PublishEnginePublicationMetadata {
  return {
    ...(metadata.publicationId === undefined ? {} : { publicationId: metadata.publicationId }),
    ...(metadata.title === undefined ? {} : { title: metadata.title }),
    ...(metadata.language === undefined ? {} : { language: metadata.language }),
    ...(metadata.theme === undefined ? {} : { theme: metadata.theme })
  };
}

function normalizeRenderOptions(
  renderOptions: ReturnType<typeof publishRenderOptionsBoundedSchema.parse>
): PublishEngineRenderOptions {
  return {
    ...(renderOptions.densityId === undefined ? {} : { densityId: renderOptions.densityId }),
    ...(renderOptions.layoutId === undefined ? {} : { layoutId: renderOptions.layoutId }),
    ...(renderOptions.includeToc === undefined ? {} : { includeToc: renderOptions.includeToc })
  };
}

export class PublishJobExecutor {
  public constructor(private readonly dependencies: PublishJobExecutorDependencies) {}

  public async execute(
    claim: ClaimedPublishJob,
    signal: AbortSignal
  ): Promise<PublishJobExecutionOutcome> {
    const current = await this.dependencies.repository.getById(claim.tenantId, claim.publishJobId);
    if (!current) {
      return 'lease-lost';
    }

    if (current.status !== 'processing' || current.leaseOwner !== claim.workerId) {
      return 'lease-lost';
    }

    if (!current.remoteJobId) {
      return await this.submitRemoteJob(current, signal);
    }

    return await this.pollRemoteJob(current, signal);
  }

  private async submitRemoteJob(job: PublishJob, signal: AbortSignal): Promise<PublishJobExecutionOutcome> {
    await this.dependencies.repository.setStage({
      tenantId: job.tenantId,
      publishJobId: job.id,
      workerId: job.leaseOwner ?? '',
      stage: 'submitting',
      now: this.dependencies.now()
    });

    try {
      const snapshot = publishSourceArtifactSnapshotSchema.parse(job.sourceArtifactSnapshot);

      const renderArtifact = {
        metadata: {
          artifactId: snapshot.artifactId,
          status: 'ready' as const,
          format: 'html' as const,
          payloadRepresentation: 'styled-html' as const,
          mimeType: snapshot.mimeType,
          fileExtension: snapshot.fileExtension,
          checksumSha256: snapshot.checksumSha256,
          byteSize: snapshot.byteSize,
          createdAt: this.dependencies.now().toISOString(),
          warnings: [],
          errors: []
        },
        content: {
          kind: 'inline' as const,
          encoding: 'utf-8' as const,
          bytesBase64: Buffer.from(snapshot.payload, 'utf8').toString('base64'),
          serializedDocument: snapshot.payload
        },
        storage: {
          kind: 'none' as const
        }
      };

      const source = createPublishEngineStyledHtmlSourceFromRenderArtifact(renderArtifact);
      validatePublishEngineStyledHtmlSource(source);

      const renderOptions = job.renderOptions
        ? normalizeRenderOptions(publishRenderOptionsBoundedSchema.parse(job.renderOptions))
        : undefined;
      const ctaMetadata = job.publicationMetadata
        ? publishCtaMetadataBoundedSchema.safeParse(job.publicationMetadata)
        : { success: false as const };
      const standardMetadata = job.publicationMetadata
        ? publishStandardMetadataBoundedSchema.safeParse(job.publicationMetadata)
        : { success: false as const };

      const remoteJob = await this.withHeartbeat(job, signal, async (operationSignal) => {
        if (job.publishMode === 'cta-guide') {
          if (!ctaMetadata.success) {
            throw new ValidationError('CTA publish metadata is invalid for cta-guide mode.');
          }

          return await this.dependencies.publishEngineClient.submitCtaRender(
            {
              source,
              outputFormat: job.outputFormat,
              publication: normalizeCtaMetadata(ctaMetadata.data),
              ...(renderOptions === undefined ? {} : { renderOptions })
            },
            {
              idempotencyKey: job.remoteSubmissionIdempotencyKey,
              correlationId: job.correlationId,
              signal: operationSignal
            }
          );
        }

        return await this.dependencies.publishEngineClient.submitRender(
          {
            source,
            outputFormat: job.outputFormat,
            ...(job.publicationMetadata === null
              ? {}
              : standardMetadata.success
                ? { publication: normalizeStandardMetadata(standardMetadata.data) }
                : {}),
            ...(renderOptions === undefined ? {} : { renderOptions })
          },
          {
            idempotencyKey: job.remoteSubmissionIdempotencyKey,
            correlationId: job.correlationId,
            signal: operationSignal
          }
        );
      });

      const now = this.dependencies.now();
      const nextPollAt = new Date(now.getTime() + this.dependencies.pollIntervalMs);
      const persisted = await this.dependencies.repository.recordSubmission({
        tenantId: job.tenantId,
        publishJobId: job.id,
        workerId: job.leaseOwner ?? '',
        remoteJobId: remoteJob.jobId,
        remoteState: remoteJob.state,
        remoteCorrelationId: remoteJob.correlationId ?? null,
        submittedAt: now,
        nextPollAt,
        now
      });

      if (!persisted) {
        throw new PublishLeaseLostError();
      }

      this.dependencies.logger.info(
        {
          publishJobId: job.id,
          tenantId: job.tenantId,
          remoteJobId: remoteJob.jobId,
          remoteState: remoteJob.state,
          stage: persisted.stage,
          status: persisted.status
        },
        'Publish job submitted and moved to waiting.'
      );

      return 'waiting';
    } catch (error) {
      if (error instanceof PublishLeaseLostError) {
        return 'lease-lost';
      }

      return await this.handleFailure({
        job,
        phase: 'submission',
        error
      });
    }
  }

  private async pollRemoteJob(job: PublishJob, signal: AbortSignal): Promise<PublishJobExecutionOutcome> {
    await this.dependencies.repository.setStage({
      tenantId: job.tenantId,
      publishJobId: job.id,
      workerId: job.leaseOwner ?? '',
      stage: 'checking-remote-status',
      now: this.dependencies.now()
    });

    try {
      const remoteJob = await this.withHeartbeat(job, signal, async (operationSignal) => {
        return await this.dependencies.publishEngineClient.getJob(job.remoteJobId as string, {
          correlationId: job.correlationId,
          signal: operationSignal
        });
      });

      const polledAt = this.dependencies.now();

      if (isNonTerminalRemoteState(remoteJob.state)) {
        const nextPollAt = new Date(polledAt.getTime() + this.dependencies.pollIntervalMs);
        const persisted = await this.dependencies.repository.recordRemoteWaiting({
          tenantId: job.tenantId,
          publishJobId: job.id,
          workerId: job.leaseOwner ?? '',
          remoteState: remoteJob.state,
          remoteCorrelationId: remoteJob.correlationId ?? null,
          lastPolledAt: polledAt,
          nextPollAt,
          now: polledAt
        });

        if (!persisted) {
          return 'lease-lost';
        }

        return 'waiting';
      }

      if (remoteJob.state === 'failed') {
        const failed = await this.dependencies.repository.fail({
          tenantId: job.tenantId,
          publishJobId: job.id,
          workerId: job.leaseOwner ?? '',
          errorCode: remoteJob.error?.code ?? ErrorCode.PUBLISH_REMOTE_JOB_FAILED,
          errorMessage: remoteJob.error?.message ?? 'Remote publish job failed.',
          remoteState: remoteJob.state,
          ...(remoteJob.correlationId === undefined
            ? {}
            : { remoteCorrelationId: remoteJob.correlationId }),
          lastPolledAt: polledAt,
          now: polledAt
        });

        return failed ? 'failed' : 'lease-lost';
      }

      if (remoteJob.state === 'cancelled') {
        const cancelled = await this.dependencies.repository.markRemoteCancelled({
          tenantId: job.tenantId,
          publishJobId: job.id,
          workerId: job.leaseOwner ?? '',
          remoteState: remoteJob.state,
          ...(remoteJob.correlationId === undefined
            ? {}
            : { remoteCorrelationId: remoteJob.correlationId }),
          lastPolledAt: polledAt,
          now: polledAt
        });

        return cancelled ? 'cancelled' : 'lease-lost';
      }

      await this.dependencies.repository.setStage({
        tenantId: job.tenantId,
        publishJobId: job.id,
        workerId: job.leaseOwner ?? '',
        stage: 'retrieving-download',
        now: polledAt
      });

      const download = await this.withHeartbeat(job, signal, async (operationSignal) => {
        return await this.dependencies.publishEngineClient.getDownload(job.remoteJobId as string, {
          correlationId: job.correlationId,
          signal: operationSignal
        });
      });

      const downloadMetadata = sanitizeDownloadMetadata(download);
      const completed = await this.dependencies.repository.complete({
        tenantId: job.tenantId,
        publishJobId: job.id,
        workerId: job.leaseOwner ?? '',
        remoteState: remoteJob.state,
        remoteCorrelationId: remoteJob.correlationId ?? null,
        lastPolledAt: polledAt,
        downloadMetadata,
        now: this.dependencies.now()
      });

      return completed ? 'completed' : 'lease-lost';
    } catch (error) {
      if (error instanceof PublishLeaseLostError) {
        return 'lease-lost';
      }

      return await this.handleFailure({
        job,
        phase: 'poll',
        error
      });
    }
  }

  private async handleFailure(input: {
    job: PublishJob;
    phase: PublishFailurePhase;
    error: unknown;
  }): Promise<PublishJobExecutionOutcome> {
    const now = this.dependencies.now();
    const classification = classifyPublishOrchestrationFailure({
      error: input.error,
      phase: input.phase
    });

    if (!classification.retryable) {
      const failed = await this.dependencies.repository.fail({
        tenantId: input.job.tenantId,
        publishJobId: input.job.id,
        workerId: input.job.leaseOwner ?? '',
        errorCode: classification.errorCode,
        errorMessage: classification.errorMessage,
        now,
        ...(input.phase === 'poll' && input.job.remoteJobId && input.job.remoteState !== null
          ? { remoteState: input.job.remoteState }
          : {})
      });

      return failed ? 'failed' : 'lease-lost';
    }

    const nextFailureCount = input.job.consecutiveFailureCount + 1;

    if (nextFailureCount >= this.dependencies.maxConsecutiveFailures) {
      const failed = await this.dependencies.repository.fail({
        tenantId: input.job.tenantId,
        publishJobId: input.job.id,
        workerId: input.job.leaseOwner ?? '',
        errorCode: ErrorCode.PUBLISH_JOB_RETRY_EXHAUSTED,
        errorMessage: classification.errorMessage,
        now,
        ...(input.phase === 'poll' && input.job.remoteJobId && input.job.remoteState !== null
          ? { remoteState: input.job.remoteState }
          : {})
      });

      return failed ? 'failed' : 'lease-lost';
    }

    const delayMs = calculateRetryDelayMs(nextFailureCount, this.dependencies.retryPolicy);
    const nextAttemptAt = new Date(now.getTime() + delayMs);
    const retried = await this.dependencies.repository.recordRetry({
      tenantId: input.job.tenantId,
      publishJobId: input.job.id,
      workerId: input.job.leaseOwner ?? '',
      errorCode: classification.errorCode,
      errorMessage: classification.errorMessage,
      nextAttemptAt,
      now
    });

    return retried ? 'retry-scheduled' : 'lease-lost';
  }

  private async withHeartbeat<T>(
    job: PublishJob,
    signal: AbortSignal,
    operation: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const operationController = new AbortController();
    let leaseLost = false;

    const onAbort = () => {
      operationController.abort();
    };

    signal.addEventListener('abort', onAbort);

    if (signal.aborted) {
      operationController.abort();
    }

    let heartbeatInFlight = false;

    const heartbeatTimer = setInterval(() => {
      if (heartbeatInFlight || leaseLost || operationController.signal.aborted) {
        return;
      }

      heartbeatInFlight = true;
      void this.dependencies.source
        .renewLease({
          tenantId: job.tenantId,
          publishJobId: job.id,
          workerId: job.leaseOwner ?? '',
          leaseDurationMs: this.dependencies.leaseDurationMs,
          now: this.dependencies.now()
        })
        .then((renewed) => {
          if (!renewed) {
            leaseLost = true;
            operationController.abort();
          }
        })
        .finally(() => {
          heartbeatInFlight = false;
        });
    }, this.dependencies.heartbeatIntervalMs);

    try {
      const result = await operation(operationController.signal);
      if (leaseLost) {
        throw new PublishLeaseLostError();
      }

      return result;
    } finally {
      clearInterval(heartbeatTimer);
      signal.removeEventListener('abort', onAbort);
    }
  }
}
