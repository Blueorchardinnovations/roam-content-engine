import { createHash } from 'node:crypto';

import type {
  PublishJobMode,
  PublishSourceArtifactSnapshot
} from '../../domain/publish-jobs/types.js';
import type {
  PublishEngineOutputFormat,
  PublishEngineRenderOptions,
  PublishEnginePublicationMetadata,
  PublishEngineCtaPublicationMetadata
} from '../../infrastructure/publish-engine/publish-engine-types.js';

function canonicalize(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

export function computePublishJobRequestFingerprint(input: {
  sourceContentJobId: string;
  sourceRenderArtifactId: string;
  sourceArtifact: PublishSourceArtifactSnapshot;
  outputFormat: PublishEngineOutputFormat;
  publishMode: PublishJobMode;
  renderOptions: PublishEngineRenderOptions | null;
  publicationMetadata: PublishEnginePublicationMetadata | PublishEngineCtaPublicationMetadata | null;
}): string {
  const fingerprintInput = {
    sourceContentJobId: input.sourceContentJobId,
    sourceRenderArtifactId: input.sourceRenderArtifactId,
    sourceArtifactChecksumSha256: input.sourceArtifact.checksumSha256,
    sourceArtifactByteSize: input.sourceArtifact.byteSize,
    outputFormat: input.outputFormat,
    publishMode: input.publishMode,
    normalizedRenderOptions: input.renderOptions,
    normalizedPublicationMetadata: input.publicationMetadata
  };

  return createHash('sha256')
    .update(canonicalize(fingerprintInput), 'utf8')
    .digest('hex');
}

export function buildRemoteSubmissionIdempotencyKey(publishJobId: string): string {
  return `publish::submit:${publishJobId}`;
}
