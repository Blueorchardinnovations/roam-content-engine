import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createPublishEngineStyledHtmlSourceFromRenderArtifact,
  validatePublishEngineStyledHtmlSource
} from '../../../../src/infrastructure/publish-engine/publish-engine-artifact-validator.js';
import type { RenderArtifact } from '../../../../src/domain/rendering/types.js';
import { PublishEngineArtifactValidationError } from '../../../../src/infrastructure/publish-engine/publish-engine-errors.js';

function buildSource(payload: string) {
  const bytes = Buffer.from(payload, 'utf8');

  return {
    payloadRepresentation: 'styled-html' as const,
    mimeType: 'text/html; charset=utf-8' as const,
    fileExtension: '.html' as const,
    payload,
    byteSize: bytes.byteLength,
    checksumSha256: createHash('sha256').update(bytes).digest('hex')
  };
}

describe('publish-engine artifact validator', () => {
  it('accepts valid styled html sources', () => {
    const source = buildSource('<!doctype html><html><body>hello</body></html>');

    expect(validatePublishEngineStyledHtmlSource(source)).toEqual(source);
  });

  it('rejects byte size mismatch', () => {
    const source = {
      ...buildSource('<!doctype html><html><body>x</body></html>'),
      byteSize: 1
    };

    expect(() => validatePublishEngineStyledHtmlSource(source)).toThrow(PublishEngineArtifactValidationError);
  });

  it('rejects checksum mismatch', () => {
    const source = {
      ...buildSource('<!doctype html><html><body>x</body></html>'),
      checksumSha256: 'f'.repeat(64)
    };

    expect(() => validatePublishEngineStyledHtmlSource(source)).toThrow(PublishEngineArtifactValidationError);
  });

  it('builds source from a compatible render artifact', () => {
    const payload = '<!doctype html><html><body>artifact</body></html>';
    const bytes = Buffer.from(payload, 'utf8');

    const artifact: RenderArtifact = {
      metadata: {
        artifactId: 'artifact_01',
        status: 'ready',
        format: 'pdf',
        payloadRepresentation: 'styled-html',
        mimeType: 'text/html; charset=utf-8',
        fileExtension: '.html',
        checksumSha256: createHash('sha256').update(bytes).digest('hex'),
        byteSize: bytes.byteLength,
        createdAt: '2026-01-01T00:00:00.000Z',
        warnings: [],
        errors: []
      },
      content: {
        kind: 'inline',
        encoding: 'utf-8',
        bytesBase64: bytes.toString('base64'),
        serializedDocument: payload
      },
      storage: {
        kind: 'none'
      }
    };

    const source = createPublishEngineStyledHtmlSourceFromRenderArtifact(artifact);

    expect(source.payloadRepresentation).toBe('styled-html');
    expect(source.payload).toBe(payload);
  });
});
