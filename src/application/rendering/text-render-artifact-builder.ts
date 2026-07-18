import { createHash } from 'node:crypto';

import type {
  RenderArtifact,
  RenderArtifactMetadata,
  RenderArtifactPayloadRepresentation,
  RenderFormat
} from '../../domain/rendering/types.js';

export type TextRenderArtifactInput = {
  readonly artifactId: string;
  readonly createdAt: string;
  readonly format: RenderFormat;
  readonly payloadRepresentation: RenderArtifactPayloadRepresentation;
  readonly mimeType: string;
  readonly fileExtension: RenderArtifactMetadata['fileExtension'];
  readonly serializedDocument: string;
};

export function createTextRenderArtifact(input: TextRenderArtifactInput): RenderArtifact {
  const bytes = Buffer.from(input.serializedDocument, 'utf8');
  const checksumSha256 = createHash('sha256').update(bytes).digest('hex');

  return {
    metadata: {
      artifactId: input.artifactId,
      status: 'ready',
      format: input.format,
      payloadRepresentation: input.payloadRepresentation,
      mimeType: input.mimeType,
      fileExtension: input.fileExtension,
      checksumSha256,
      byteSize: bytes.byteLength,
      createdAt: input.createdAt,
      warnings: [],
      errors: []
    },
    content: {
      kind: 'inline',
      encoding: 'utf-8',
      bytesBase64: bytes.toString('base64'),
      serializedDocument: input.serializedDocument
    },
    storage: {
      kind: 'none'
    }
  };
}