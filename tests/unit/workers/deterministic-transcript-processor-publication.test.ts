import { describe, expect, it } from 'vitest';

import type { SourceVersionRepository } from '../../../src/domain/repositories/source-version-repository.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';
import {
  PublicationBuildError,
  PublicationCancelledError,
  PublicationValidationError,
  UnsupportedPublicationTypeError
} from '../../../src/application/publications/publication-errors.js';
import type { PublicationGenerator } from '../../../src/application/publications/publication-generator.js';
import { DeterministicTranscriptProcessor } from '../../../src/infrastructure/workers/deterministic-transcript-processor.js';
import { PermanentWorkerError, WorkerCancelledError } from '../../../src/domain/workers/worker-errors.js';

function createRepository(): SourceVersionRepository {
  return {
    createImmutable: async () => {
      throw new Error('not needed');
    },
    create: async () => {
      throw new Error('not needed');
    },
    getById: async () => ({
      id: 'srcver_01TEST' as const,
      tenantId: 'tenant_01TEST' as const,
      projectId: 'project_01TEST' as const,
      versionNumber: 1,
      contentHash: 'hash',
      transcriptText: 'alpha beta',
      createdAt: new Date('2026-01-01T00:00:00.000Z')
    }),
    findByHash: async () => null,
    listByProject: async () => []
  };
}

const baseJob = {
  id: 'job_01TEST' as const,
  tenantId: 'tenant_01TEST' as const,
  projectId: 'project_01TEST' as const,
  sourceVersionId: 'srcver_01TEST' as const,
  status: 'processing' as const,
  currentStage: 'normalizing-transcript' as const,
  idempotencyKey: 'idem',
  requestFingerprint: 'fp',
  attemptCount: 1,
  result: null,
  errorCode: null,
  errorMessage: null,
  correlationId: 'corr_01TEST' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  startedAt: new Date('2026-01-01T00:00:00.000Z'),
  completedAt: null,
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  leaseOwner: 'worker_test',
  leaseExpiresAt: new Date('2026-01-01T00:01:00.000Z'),
  heartbeatAt: new Date('2026-01-01T00:00:30.000Z'),
  nextAttemptAt: null
};

function createAiPipeline() {
  return {
    run: async () => ({
      pipelineVersion: '1.0.0',
      provider: 'mock',
      model: 'default',
      generatedAt: '2026-01-01T00:00:00.000Z',
      metadata: {
        title: 'Title',
        description: 'Description',
        language: 'en',
        audience: 'general'
      },
      summary: {
        shortSummary: 'Short summary',
        detailedSummary: 'Detailed summary'
      },
      keywords: {
        keywords: ['faith', 'service']
      },
      scripture: {
        references: []
      },
      reflections: {
        reflections: ['Reflection one']
      },
      promptExecutions: [
        {
          stage: 'metadata',
          promptKey: 'metadata',
          promptVersion: '1.0',
          pipelineVersion: '1.0.0',
          provider: 'mock',
          model: 'default',
          generatedAt: '2026-01-01T00:00:00.000Z',
          usage: {
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            estimatedCostUsd: null,
            latencyMs: 1
          }
        }
      ],
      usageTotals: {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        estimatedCostUsd: null,
        latencyMs: 1
      }
    })
  };
}

function createGenerator(overrides?: Partial<PublicationGenerator>): PublicationGenerator {
  return {
    build: () => ({
      metadata: {
        publicationId: 'pub_1',
        publicationType: 'cta-guide',
        title: 'Title',
        subtitle: null,
        author: 'RoaM Content Engine',
        organization: null,
        generatedAt: '2026-01-01T00:00:00.000Z',
        sourceVersionId: 'srcver_01TEST',
        sourceContentHash: 'hash_1',
        pipelineVersion: '1.0.0',
        audience: 'general',
        theme: 'classic',
        style: {
          tone: 'pastoral',
          readingLevel: 'introductory',
          voice: 'reflective'
        }
      },
      cover: {
        title: 'Title',
        subtitle: null,
        author: 'RoaM Content Engine',
        organization: null,
        coverImageAssetId: null,
        branding: null,
        generatedDate: '2026-01-01T00:00:00.000Z',
        publicationType: 'cta-guide'
      },
      toc: { entries: [] },
      sections: [
        {
          id: 'section-1',
          title: 'Title',
          slug: 'title',
          order: 1,
          blocks: [
            {
              id: 'block-1',
              type: 'paragraph',
              text: 'Body',
              attribution: null
            }
          ]
        }
      ],
      references: [],
      citations: [],
      footnotes: [],
      assets: [],
      document: {
        schemaVersion: '1.0',
        layoutIntent: 'digital-first',
        language: 'en'
      },
      renderOptions: {
        preferredTargets: ['cta-guide'],
        includeCover: true,
        includeToc: true
      }
    }),
    ...overrides
  };
}

describe('deterministic transcript processor publication integration', () => {
  it('uses publication generator abstraction and attaches publication output', async () => {
    const processor = new DeterministicTranscriptProcessor(
      createRepository(),
      () => new Date('2026-01-01T00:00:00.000Z'),
      createAiPipeline() as any,
      createGenerator()
    );

    const result = await processor.process({
      job: baseJob,
      signal: new AbortController().signal,
      reportStage: async () => undefined,
      heartbeat: async () => undefined
    });

    expect(result.ai).toBeDefined();
    expect(result.publication).toBeDefined();
    expect(result.publication?.metadata.publicationType).toBe('cta-guide');
  });

  it('maps publication validation failure to permanent worker error', async () => {
    const processor = new DeterministicTranscriptProcessor(
      createRepository(),
      () => new Date('2026-01-01T00:00:00.000Z'),
      createAiPipeline() as any,
      createGenerator({
        build: () => {
          throw new PublicationValidationError();
        }
      })
    );

    await expect(
      processor.process({
        job: baseJob,
        signal: new AbortController().signal,
        reportStage: async () => undefined,
        heartbeat: async () => undefined
      })
    ).rejects.toMatchObject({ code: ErrorCode.PUBLICATION_VALIDATION_ERROR });
  });

  it('maps unsupported publication type to permanent worker error', async () => {
    const processor = new DeterministicTranscriptProcessor(
      createRepository(),
      () => new Date('2026-01-01T00:00:00.000Z'),
      createAiPipeline() as any,
      createGenerator({
        build: () => {
          throw new UnsupportedPublicationTypeError('unknown-type');
        }
      })
    );

    await expect(
      processor.process({
        job: baseJob,
        signal: new AbortController().signal,
        reportStage: async () => undefined,
        heartbeat: async () => undefined
      })
    ).rejects.toMatchObject({ code: ErrorCode.PUBLICATION_UNSUPPORTED_TYPE });
  });

  it('maps deterministic publication build failure to permanent worker error', async () => {
    const processor = new DeterministicTranscriptProcessor(
      createRepository(),
      () => new Date('2026-01-01T00:00:00.000Z'),
      createAiPipeline() as any,
      createGenerator({
        build: () => {
          throw new PublicationBuildError();
        }
      })
    );

    await expect(
      processor.process({
        job: baseJob,
        signal: new AbortController().signal,
        reportStage: async () => undefined,
        heartbeat: async () => undefined
      })
    ).rejects.toMatchObject({ code: ErrorCode.PUBLICATION_BUILD_ERROR });
  });

  it('preserves publication cancellation as worker cancellation', async () => {
    const processor = new DeterministicTranscriptProcessor(
      createRepository(),
      () => new Date('2026-01-01T00:00:00.000Z'),
      createAiPipeline() as any,
      createGenerator({
        build: () => {
          throw new PublicationCancelledError();
        }
      })
    );

    await expect(
      processor.process({
        job: baseJob,
        signal: new AbortController().signal,
        reportStage: async () => undefined,
        heartbeat: async () => undefined
      })
    ).rejects.toBeInstanceOf(WorkerCancelledError);
  });

  it('fails permanently when publication generator is missing for AI path', async () => {
    const processor = new DeterministicTranscriptProcessor(
      createRepository(),
      () => new Date('2026-01-01T00:00:00.000Z'),
      createAiPipeline() as any
    );

    await expect(
      processor.process({
        job: baseJob,
        signal: new AbortController().signal,
        reportStage: async () => undefined,
        heartbeat: async () => undefined
      })
    ).rejects.toBeInstanceOf(PermanentWorkerError);
  });
});
