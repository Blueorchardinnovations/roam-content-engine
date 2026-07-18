import type { PublishJob, PublishJobEvent } from '../../domain/publish-jobs/types.js';

export type PublishJobDto = {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly sourceContentJobId: string;
  readonly sourceRenderArtifactId: string;
  readonly sourceArtifactChecksumSha256: string;
  readonly sourceArtifactByteSize: number;
  readonly publishMode: string;
  readonly outputFormat: string;
  readonly status: string;
  readonly stage: string;
  readonly idempotencyKey: string;
  readonly remoteJobId: string | null;
  readonly remoteState: string | null;
  readonly remoteCorrelationId: string | null;
  readonly downloadMetadata: {
    readonly fileName: string;
    readonly mimeType: string;
    readonly byteSize?: number;
    readonly checksumSha256?: string;
    readonly expiresAt?: string;
    readonly expired: boolean;
  } | null;
  readonly attemptCount: number;
  readonly consecutiveFailureCount: number;
  readonly pollCount: number;
  readonly correlationId: string;
  readonly nextAttemptAt: string | null;
  readonly nextPollAt: string | null;
  readonly submittedAt: string | null;
  readonly lastPolledAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type PublishJobEventDto = {
  readonly id: string;
  readonly tenantId: string;
  readonly publishJobId: string;
  readonly eventType: string;
  readonly priorStatus: string | null;
  readonly newStatus: string | null;
  readonly details: Readonly<Record<string, unknown>> | null;
  readonly createdAt: string;
};

function toDownloadMetadataDto(downloadMetadata: PublishJob['downloadMetadata']): PublishJobDto['downloadMetadata'] {
  if (!downloadMetadata) {
    return null;
  }

  const { downloadUrl, ...safeMetadata } = downloadMetadata;
  void downloadUrl;

  const expiresAt = safeMetadata.expiresAt;
  const expired = expiresAt
    ? new Date(expiresAt).getTime() <= Date.now()
    : false;

  return {
    fileName: safeMetadata.fileName,
    mimeType: safeMetadata.mimeType,
    ...(safeMetadata.byteSize === undefined ? {} : { byteSize: safeMetadata.byteSize }),
    ...(safeMetadata.checksumSha256 === undefined
      ? {}
      : { checksumSha256: safeMetadata.checksumSha256 }),
    ...(safeMetadata.expiresAt === undefined ? {} : { expiresAt: safeMetadata.expiresAt }),
    expired
  };
}

export function toPublishJobDto(job: PublishJob): PublishJobDto {
  return {
    id: job.id,
    tenantId: job.tenantId,
    projectId: job.projectId,
    sourceContentJobId: job.sourceContentJobId,
    sourceRenderArtifactId: job.sourceRenderArtifactId,
    sourceArtifactChecksumSha256: job.sourceArtifactChecksumSha256,
    sourceArtifactByteSize: job.sourceArtifactByteSize,
    publishMode: job.publishMode,
    outputFormat: job.outputFormat,
    status: job.status,
    stage: job.stage,
    idempotencyKey: job.idempotencyKey,
    remoteJobId: job.remoteJobId,
    remoteState: job.remoteState,
    remoteCorrelationId: job.remoteCorrelationId,
    downloadMetadata: toDownloadMetadataDto(job.downloadMetadata),
    attemptCount: job.attemptCount,
    consecutiveFailureCount: job.consecutiveFailureCount,
    pollCount: job.pollCount,
    correlationId: job.correlationId,
    nextAttemptAt: job.nextAttemptAt?.toISOString() ?? null,
    nextPollAt: job.nextPollAt?.toISOString() ?? null,
    submittedAt: job.submittedAt?.toISOString() ?? null,
    lastPolledAt: job.lastPolledAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    cancelledAt: job.cancelledAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

export function toPublishJobEventDto(event: PublishJobEvent): PublishJobEventDto {
  return {
    id: event.id,
    tenantId: event.tenantId,
    publishJobId: event.publishJobId,
    eventType: event.eventType,
    priorStatus: event.priorStatus,
    newStatus: event.newStatus,
    details: event.details,
    createdAt: event.createdAt.toISOString()
  };
}
