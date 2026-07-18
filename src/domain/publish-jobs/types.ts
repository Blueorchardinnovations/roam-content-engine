import { z } from 'zod';

import {
  isPrefixedId,
  type PrefixedId
} from '../../platform/identity/ids/index.js';
import type {
  PublishEngineOutputFormat,
  PublishEngineRenderOptions,
  PublishEnginePublicationMetadata,
  PublishEngineCtaPublicationMetadata
} from '../../infrastructure/publish-engine/publish-engine-types.js';

export const publishJobStatuses = [
  'queued',
  'processing',
  'waiting',
  'retrying',
  'completed',
  'failed',
  'cancelled'
] as const;

export type PublishJobStatus = (typeof publishJobStatuses)[number];

export const publishJobStages = [
  'queued',
  'validating-source',
  'submitting',
  'waiting-for-remote',
  'checking-remote-status',
  'retrieving-download',
  'completed',
  'failed',
  'cancelled'
] as const;

export type PublishJobStage = (typeof publishJobStages)[number];

export const publishJobModes = ['standard', 'cta-guide'] as const;
export type PublishJobMode = (typeof publishJobModes)[number];

export const publishJobEventTypes = [
  'publish-job-created',
  'publish-job-claimed',
  'publish-submitted',
  'publish-status-polled',
  'publish-waiting',
  'publish-retry-scheduled',
  'publish-completed',
  'publish-failed',
  'publish-cancelled',
  'publish-lease-expired'
] as const;

export type PublishJobEventType = (typeof publishJobEventTypes)[number];

export type PublishJobId = PrefixedId<'pjob'>;
export type PublishJobEventId = PrefixedId<'pevt'>;
export type ContentJobId = PrefixedId<'job'>;
export type TenantId = PrefixedId<'tenant'>;
export type ProjectId = PrefixedId<'project'>;
export type CorrelationId = PrefixedId<'corr'>;

export const PUBLISH_ARTIFACT_MAX_BYTES = 1_048_576;
export const PUBLISH_REMOTE_ERROR_MAX_CHARS = 500;

const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const publishSourceArtifactSnapshotSchema = z.object({
  artifactId: z.string().trim().min(1).max(120),
  payloadRepresentation: z.literal('styled-html'),
  mimeType: z.literal('text/html; charset=utf-8'),
  fileExtension: z.literal('.html'),
  payload: z.string().min(1).max(PUBLISH_ARTIFACT_MAX_BYTES),
  byteSize: z.number().int().positive().max(PUBLISH_ARTIFACT_MAX_BYTES),
  checksumSha256: checksumSchema
}).strict();

export type PublishSourceArtifactSnapshot = z.infer<
  typeof publishSourceArtifactSnapshotSchema
>;

const publishRenderOptionsSchema = z.object({
  densityId: z.enum(['comfortable', 'standard', 'compact', 'high-density']).optional(),
  layoutId: z.enum(['single-column', 'two-column', 'wide-content']).optional(),
  includeToc: z.boolean().optional()
}).strict();

const publishStandardMetadataSchema = z.object({
  publicationId: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(400).optional(),
  language: z.string().trim().min(2).max(16).optional(),
  theme: z.string().trim().min(1).max(80).optional()
}).strict();

const publishCtaMetadataSchema = z.object({
  publicationId: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(400),
  language: z.string().trim().min(2).max(16),
  theme: z.string().trim().min(1).max(80),
  audience: z.string().trim().min(1).max(120).optional()
}).strict();

export const publishDownloadMetadataSchema = z.object({
  fileName: z.string().trim().min(1).max(512),
  mimeType: z.string().trim().min(1).max(200),
  byteSize: z.number().int().positive().optional(),
  checksumSha256: checksumSchema.optional(),
  downloadUrl: z.url().optional(),
  expiresAt: z.iso.datetime().optional()
}).strict();

export type PublishDownloadMetadata = z.infer<typeof publishDownloadMetadataSchema>;

export type PublishJob = {
  readonly id: PublishJobId;
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  readonly sourceContentJobId: ContentJobId;
  readonly sourceRenderArtifactId: string;
  readonly sourceArtifactChecksumSha256: string;
  readonly sourceArtifactByteSize: number;
  readonly sourceArtifactSnapshot: PublishSourceArtifactSnapshot;
  readonly publishMode: PublishJobMode;
  readonly outputFormat: PublishEngineOutputFormat;
  readonly renderOptions: PublishEngineRenderOptions | null;
  readonly publicationMetadata: PublishEnginePublicationMetadata | PublishEngineCtaPublicationMetadata | null;
  readonly status: PublishJobStatus;
  readonly stage: PublishJobStage;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly remoteSubmissionIdempotencyKey: string;
  readonly remoteJobId: string | null;
  readonly remoteState: string | null;
  readonly remoteCorrelationId: string | null;
  readonly remoteErrorCode: string | null;
  readonly remoteErrorMessage: string | null;
  readonly downloadMetadata: PublishDownloadMetadata | null;
  readonly attemptCount: number;
  readonly consecutiveFailureCount: number;
  readonly pollCount: number;
  readonly correlationId: CorrelationId;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: Date | null;
  readonly heartbeatAt: Date | null;
  readonly nextAttemptAt: Date | null;
  readonly nextPollAt: Date | null;
  readonly submittedAt: Date | null;
  readonly lastPolledAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PublishJobEvent = {
  readonly id: PublishJobEventId;
  readonly tenantId: TenantId;
  readonly publishJobId: PublishJobId;
  readonly eventType: PublishJobEventType;
  readonly priorStatus: PublishJobStatus | null;
  readonly newStatus: PublishJobStatus | null;
  readonly details: Readonly<Record<string, unknown>> | null;
  readonly createdAt: Date;
};

export type CreatePublishJobInput = {
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  readonly sourceContentJobId: ContentJobId;
  readonly sourceRenderArtifactId: string;
  readonly sourceArtifactSnapshot: PublishSourceArtifactSnapshot;
  readonly publishMode: PublishJobMode;
  readonly outputFormat: PublishEngineOutputFormat;
  readonly renderOptions: PublishEngineRenderOptions | null;
  readonly publicationMetadata: PublishEnginePublicationMetadata | PublishEngineCtaPublicationMetadata | null;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly remoteSubmissionIdempotencyKey: string;
  readonly correlationId: CorrelationId;
};

export type CreatePublishJobEventInput = {
  readonly id: PublishJobEventId;
  readonly tenantId: TenantId;
  readonly publishJobId: PublishJobId;
  readonly eventType: PublishJobEventType;
  readonly priorStatus: PublishJobStatus | null;
  readonly newStatus: PublishJobStatus | null;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly createdAt?: Date;
};

export function assertPublishScopedIds(input: {
  tenantId: TenantId;
  projectId?: ProjectId;
  sourceContentJobId?: ContentJobId;
  publishJobId?: PublishJobId;
}): void {
  if (!isPrefixedId(input.tenantId, 'tenant')) {
    throw new Error('Invalid tenant ID.');
  }

  if (input.projectId && !isPrefixedId(input.projectId, 'project')) {
    throw new Error('Invalid project ID.');
  }

  if (input.sourceContentJobId && !isPrefixedId(input.sourceContentJobId, 'job')) {
    throw new Error('Invalid source content job ID.');
  }

  if (input.publishJobId && !isPrefixedId(input.publishJobId, 'pjob')) {
    throw new Error('Invalid publish job ID.');
  }
}

export const publishModeSchema = z.enum(publishJobModes);
export const publishOutputFormatSchema = z.enum(['html', 'pdf', 'epub']);
export const publishRenderOptionsBoundedSchema = publishRenderOptionsSchema;
export const publishStandardMetadataBoundedSchema = publishStandardMetadataSchema;
export const publishCtaMetadataBoundedSchema = publishCtaMetadataSchema;
