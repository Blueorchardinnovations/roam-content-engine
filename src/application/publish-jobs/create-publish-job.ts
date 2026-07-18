import type { ContentJobRepository } from '../../domain/repositories/content-job-repository.js';
import type { PublishJobRepository } from '../../domain/repositories/publish-job-repository.js';
import type {
  PublishJob,
  PublishJobMode,
  TenantId,
  ProjectId,
  ContentJobId,
  CorrelationId
} from '../../domain/publish-jobs/types.js';
import type {
  PublishEngineOutputFormat,
  PublishEngineRenderOptions,
  PublishEnginePublicationMetadata,
  PublishEngineCtaPublicationMetadata
} from '../../infrastructure/publish-engine/publish-engine-types.js';
import { NotFoundError, ValidationError } from '../../platform/shared/errors/index.js';

import {
  buildRemoteSubmissionIdempotencyKey,
  computePublishJobRequestFingerprint
} from './request-fingerprint.js';
import { createPublishSourceSnapshot } from './source-eligibility.js';

export type CreatePublishJobCommand = {
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  readonly sourceContentJobId: ContentJobId;
  readonly outputFormat: PublishEngineOutputFormat;
  readonly publishMode: PublishJobMode;
  readonly renderOptions: PublishEngineRenderOptions | null;
  readonly publicationMetadata: PublishEnginePublicationMetadata | PublishEngineCtaPublicationMetadata | null;
  readonly idempotencyKey: string;
  readonly correlationId: CorrelationId;
};

export class CreatePublishJob {
  public constructor(
    private readonly contentJobRepository: ContentJobRepository,
    private readonly publishJobRepository: PublishJobRepository
  ) {}

  public async execute(command: CreatePublishJobCommand): Promise<PublishJob> {
    if (command.publishMode === 'cta-guide' && command.publicationMetadata === null) {
      throw new ValidationError('CTA publish mode requires publicationMetadata.');
    }

    const sourceJob = await this.contentJobRepository.getById(
      command.tenantId,
      command.sourceContentJobId
    );

    if (!sourceJob) {
      throw new NotFoundError('Source content job', command.sourceContentJobId);
    }

    const source = createPublishSourceSnapshot({
      sourceJob,
      projectId: command.projectId
    });

    const requestFingerprint = computePublishJobRequestFingerprint({
      sourceContentJobId: command.sourceContentJobId,
      sourceRenderArtifactId: source.sourceRenderArtifactId,
      sourceArtifact: source.snapshot,
      outputFormat: command.outputFormat,
      publishMode: command.publishMode,
      renderOptions: command.renderOptions,
      publicationMetadata: command.publicationMetadata
    });

    return this.publishJobRepository.createOrGetIdempotent({
      tenantId: command.tenantId,
      projectId: command.projectId,
      sourceContentJobId: command.sourceContentJobId,
      sourceRenderArtifactId: source.sourceRenderArtifactId,
      sourceArtifactSnapshot: source.snapshot,
      publishMode: command.publishMode,
      outputFormat: command.outputFormat,
      renderOptions: command.renderOptions,
      publicationMetadata: command.publicationMetadata,
      idempotencyKey: command.idempotencyKey,
      requestFingerprint,
      remoteSubmissionIdempotencyKey: buildRemoteSubmissionIdempotencyKey(requestFingerprint),
      correlationId: command.correlationId
    });
  }
}
