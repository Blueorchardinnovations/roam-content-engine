import { createHash } from 'node:crypto';

import type { RenderArtifact } from '../../domain/rendering/types.js';
import {
  publishEngineStyledHtmlSourceSchema
} from './publish-engine-schemas.js';
import type { PublishEngineStyledHtmlSource } from './publish-engine-types.js';
import { PublishEngineArtifactValidationError } from './publish-engine-errors.js';

function validateChecksumFormat(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new PublishEngineArtifactValidationError('Styled HTML artifact checksum must be a lowercase SHA-256 hex string.');
  }
}

export function validatePublishEngineStyledHtmlSource(
  source: PublishEngineStyledHtmlSource
): PublishEngineStyledHtmlSource {
  const parsed = publishEngineStyledHtmlSourceSchema.safeParse(source);
  if (!parsed.success) {
    throw new PublishEngineArtifactValidationError('Styled HTML source artifact is invalid.', {
      issues: parsed.error.issues
    });
  }

  const normalized = parsed.data;
  validateChecksumFormat(normalized.checksumSha256);

  const bytes = Buffer.from(normalized.payload, 'utf8');
  if (bytes.byteLength !== normalized.byteSize) {
    throw new PublishEngineArtifactValidationError('Styled HTML source artifact byte size does not match UTF-8 payload bytes.', {
      expected: bytes.byteLength,
      received: normalized.byteSize
    });
  }

  const checksumSha256 = createHash('sha256').update(bytes).digest('hex');
  if (checksumSha256 !== normalized.checksumSha256) {
    throw new PublishEngineArtifactValidationError('Styled HTML source artifact checksum does not match UTF-8 payload bytes.');
  }

  return normalized;
}

export function createPublishEngineStyledHtmlSourceFromRenderArtifact(
  artifact: RenderArtifact
): PublishEngineStyledHtmlSource {
  if (artifact.metadata.payloadRepresentation !== 'styled-html') {
    throw new PublishEngineArtifactValidationError('Render artifact payloadRepresentation must be styled-html for Publish Engine submission.');
  }

  if (artifact.metadata.mimeType !== 'text/html; charset=utf-8') {
    throw new PublishEngineArtifactValidationError('Render artifact mimeType must be text/html; charset=utf-8 for Publish Engine submission.');
  }

  if (artifact.metadata.fileExtension !== '.html') {
    throw new PublishEngineArtifactValidationError('Render artifact fileExtension must be .html for Publish Engine submission.');
  }

  if (artifact.content?.kind !== 'inline' || artifact.content.encoding !== 'utf-8') {
    throw new PublishEngineArtifactValidationError('Render artifact content must be inline UTF-8 for Publish Engine submission.');
  }

  return validatePublishEngineStyledHtmlSource({
    payloadRepresentation: 'styled-html',
    mimeType: 'text/html; charset=utf-8',
    fileExtension: '.html',
    payload: artifact.content.serializedDocument,
    byteSize: artifact.metadata.byteSize,
    checksumSha256: artifact.metadata.checksumSha256
  });
}
