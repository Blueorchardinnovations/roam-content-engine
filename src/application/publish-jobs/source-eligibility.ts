import type { ContentJob } from '../../domain/content-jobs/types.js';
import type { RenderArtifact } from '../../domain/rendering/types.js';
import {
  PUBLISH_ARTIFACT_MAX_BYTES,
  type PublishSourceArtifactSnapshot
} from '../../domain/publish-jobs/types.js';
import {
  createPublishEngineStyledHtmlSourceFromRenderArtifact,
  validatePublishEngineStyledHtmlSource
} from '../../infrastructure/publish-engine/publish-engine-artifact-validator.js';
import { ErrorCode } from '../../platform/shared/errors/codes.js';
import { ConflictError } from '../../platform/shared/errors/index.js';

function deriveSourceRenderArtifactId(job: ContentJob): string {
  const artifact = job.result?.renderArtifact;
  if (!artifact) {
    throw new ConflictError(
      ErrorCode.PUBLISH_SOURCE_ARTIFACT_MISSING,
      'Source content job does not have a render artifact.'
    );
  }

  const artifactId = artifact.metadata.artifactId.trim();
  if (artifactId.length > 0) {
    return artifactId;
  }

  return `styled:${job.id}:${artifact.metadata.checksumSha256}:${artifact.metadata.byteSize}`;
}

export function createPublishSourceSnapshot(input: {
  sourceJob: ContentJob;
  projectId: string;
}): {
  sourceRenderArtifactId: string;
  snapshot: PublishSourceArtifactSnapshot;
} {
  const sourceJob = input.sourceJob;

  if (sourceJob.projectId !== input.projectId) {
    throw new ConflictError(
      ErrorCode.PUBLISH_SOURCE_NOT_ELIGIBLE,
      'Source content job does not belong to the requested project.'
    );
  }

  if (sourceJob.status !== 'completed') {
    throw new ConflictError(
      ErrorCode.PUBLISH_SOURCE_NOT_ELIGIBLE,
      'Source content job must be completed before publishing.'
    );
  }

  if (!sourceJob.result?.renderArtifact) {
    throw new ConflictError(
      ErrorCode.PUBLISH_SOURCE_ARTIFACT_MISSING,
      'Source content job does not include a render artifact.'
    );
  }

  let source;
  try {
    const artifact = sourceJob.result.renderArtifact;
    if (
      artifact.metadata.payloadRepresentation === undefined ||
      artifact.content === null
    ) {
      throw new Error('Render artifact does not include inline styled HTML payload details.');
    }

    source = createPublishEngineStyledHtmlSourceFromRenderArtifact(
      artifact as RenderArtifact
    );
    validatePublishEngineStyledHtmlSource(source);
  } catch (error) {
    throw new ConflictError(
      ErrorCode.PUBLISH_SOURCE_ARTIFACT_INVALID,
      'Source content job render artifact is not a valid styled HTML artifact.',
      {
        cause: error instanceof Error ? error.message : 'unknown'
      }
    );
  }

  if (source.byteSize > PUBLISH_ARTIFACT_MAX_BYTES) {
    throw new ConflictError(
      ErrorCode.PUBLISH_SOURCE_ARTIFACT_INVALID,
      'Source styled HTML artifact exceeds maximum allowed publish snapshot size.'
    );
  }

  return {
    sourceRenderArtifactId: deriveSourceRenderArtifactId(sourceJob),
    snapshot: {
      artifactId: deriveSourceRenderArtifactId(sourceJob),
      payloadRepresentation: source.payloadRepresentation,
      mimeType: source.mimeType,
      fileExtension: source.fileExtension,
      payload: source.payload,
      byteSize: source.byteSize,
      checksumSha256: source.checksumSha256
    }
  };
}
