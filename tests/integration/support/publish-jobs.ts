import { createHash } from 'node:crypto';

import type { CreatePublishJobInput } from '../../../src/domain/publish-jobs/types.js';
import {
  buildRemoteSubmissionIdempotencyKey,
  computePublishJobRequestFingerprint,
  createPublishSourceSnapshot
} from '../../../src/application/publish-jobs/index.js';

import {
  createContentJobForTest,
  createSourceVersionForTest,
  createTestScope,
  repositories
} from './database.js';

export function buildStyledHtmlRenderArtifact(html = '<!doctype html><title>Styled</title>') {
  const bytes = Buffer.from(html, 'utf8');

  return {
    metadata: {
      artifactId: 'artifact_publish_test_1',
      status: 'ready' as const,
      format: 'html' as const,
      payloadRepresentation: 'styled-html' as const,
      mimeType: 'text/html; charset=utf-8' as const,
      fileExtension: '.html' as const,
      checksumSha256: createHash('sha256').update(bytes).digest('hex'),
      byteSize: bytes.byteLength,
      createdAt: '2026-01-01T00:00:00.000Z',
      warnings: [],
      errors: []
    },
    content: {
      kind: 'inline' as const,
      encoding: 'utf-8' as const,
      bytesBase64: bytes.toString('base64'),
      serializedDocument: html
    },
    storage: {
      kind: 'none' as const
    }
  };
}

export async function createCompletedSourceContentJobForPublish(input?: {
  transcriptText?: string;
  html?: string;
  idempotencyKey?: string;
}) {
  const scope = createTestScope();
  const source = await createSourceVersionForTest({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    transcriptText: input?.transcriptText ?? 'Publishable transcript'
  });

  const queued = await createContentJobForTest({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    sourceVersionId: source.id,
    idempotencyKey: input?.idempotencyKey ?? 'publish-source-job-1',
    jobType: 'transcript-processing',
    requestSchemaVersion: '1.0'
  });

  const claimed = await repositories.contentJobs.claim(scope.tenantId, queued.id);
  const completed = await repositories.contentJobs.complete(scope.tenantId, claimed.id, {
    schemaVersion: '1.0',
    sourceVersionId: source.id,
    contentHash: source.contentHash,
    wordCount: 2,
    characterCount: 20,
    paragraphCount: 1,
    lineCount: 1,
    processedAt: '2026-01-01T00:00:00.000Z',
    renderArtifact: buildStyledHtmlRenderArtifact(input?.html)
  });

  return {
    scope,
    source,
    contentJob: completed
  };
}

export function buildCreatePublishJobInput(input: {
  tenantId: CreatePublishJobInput['tenantId'];
  projectId: CreatePublishJobInput['projectId'];
  contentJob: Awaited<ReturnType<typeof createCompletedSourceContentJobForPublish>>['contentJob'];
  idempotencyKey: string;
  outputFormat?: CreatePublishJobInput['outputFormat'];
  publishMode?: CreatePublishJobInput['publishMode'];
  renderOptions?: CreatePublishJobInput['renderOptions'];
  publicationMetadata?: CreatePublishJobInput['publicationMetadata'];
  correlationId?: CreatePublishJobInput['correlationId'];
}): CreatePublishJobInput {
  const source = createPublishSourceSnapshot({
    sourceJob: input.contentJob,
    projectId: input.projectId
  });

  const outputFormat = input.outputFormat ?? 'pdf';
  const publishMode = input.publishMode ?? 'standard';
  const renderOptions = input.renderOptions ?? { includeToc: true };
  const publicationMetadata = input.publicationMetadata ?? { title: 'Publish Test', language: 'en' };
  const requestFingerprint = computePublishJobRequestFingerprint({
    sourceContentJobId: input.contentJob.id,
    sourceRenderArtifactId: source.sourceRenderArtifactId,
    sourceArtifact: source.snapshot,
    outputFormat,
    publishMode,
    renderOptions,
    publicationMetadata
  });

  return {
    tenantId: input.tenantId,
    projectId: input.projectId,
    sourceContentJobId: input.contentJob.id,
    sourceRenderArtifactId: source.sourceRenderArtifactId,
    sourceArtifactSnapshot: source.snapshot,
    publishMode,
    outputFormat,
    renderOptions,
    publicationMetadata,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    remoteSubmissionIdempotencyKey: buildRemoteSubmissionIdempotencyKey(requestFingerprint),
    correlationId: input.correlationId ?? ('corr_01PUBLISHTEST0000000000000' as const)
  };
}