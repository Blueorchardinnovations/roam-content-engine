import { beforeEach, describe, expect, it } from 'vitest';

import { AIPipeline } from '../../../src/application/ai/pipeline.js';
import { JobExecutor } from '../../../src/application/workers/job-executor.js';
import { PublicationValidationError, UnsupportedPublicationTypeError } from '../../../src/application/publications/publication-errors.js';
import { HtmlValidationError, PublicationBuilder, PublicationHtmlComposer } from '../../../src/application/publications/index.js';
import { HtmlPassthroughRenderer, RenderCancelledError, UnsupportedRenderFormatError } from '../../../src/application/rendering/index.js';
import { MockAIProvider } from '../../../src/infrastructure/ai/providers/mock-provider.js';
import { createWorkerApp } from '../../../src/worker/app.js';
import { DatabaseJobSource } from '../../../src/infrastructure/workers/database-job-source.js';
import { DatabaseWorkerHeartbeatStore } from '../../../src/infrastructure/workers/worker-heartbeat-store.js';
import { DeterministicTranscriptProcessor } from '../../../src/infrastructure/workers/deterministic-transcript-processor.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';
import { clearAllWorkerData, clearWorkerScope, createQueuedJob, getJobById, integrationDb, listJobEvents, repositories } from '../workers/support.js';

function buildSuccessWorker(
  aiPipeline: AIPipeline,
  options?: {
    rendererSelection?: 'structured-json' | 'html-markup';
    createRenderArtifactId?: () => string;
  }
) {
  return createWorkerApp({
    workerConfig: {
      workerId: 'worker_publication_test',
      pollIntervalMs: 5,
      leaseDurationMs: 1000,
      heartbeatIntervalMs: 50,
      maxAttempts: 2,
      concurrency: 1,
      shutdownTimeoutMs: 1000,
      staleRecoveryIntervalMs: 1000,
      retryBaseDelayMs: 10,
      retryMaxDelayMs: 1000
    },
    sourceVersionRepository: repositories.sourceVersions,
    jobSource: new DatabaseJobSource(integrationDb),
    aiPipeline,
    rendererSelection: options?.rendererSelection,
    createRenderArtifactId: options?.createRenderArtifactId,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined
    }
  });
}

async function waitForJobStatus(input: {
  tenantId: string;
  jobId: string;
  status: string;
  maxIterations?: number;
}) {
  const maxIterations = input.maxIterations ?? 300;

  for (let index = 0; index < maxIterations; index += 1) {
    const job = await getJobById({
      tenantId: input.tenantId,
      jobId: input.jobId
    });

    if (job?.status === input.status) {
      return job;
    }

    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }

  throw new Error(`Timed out waiting for ${input.status}.`);
}

describe.sequential('publication worker integration', () => {
  beforeEach(async () => {
    await clearAllWorkerData();
  });

  it('persists publication output without transcript sentinel leakage', async () => {
    const transcriptSentinel = 'PRIVATE_HTML_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST';
    const created = await createQueuedJob({
      idempotencyKey: 'publication-success-1',
      transcriptText: `Line one\n\n${transcriptSentinel}`
    });

    const worker = buildSuccessWorker(new AIPipeline(
      new MockAIProvider({
        mode: 'success',
        now: () => new Date('2026-01-01T00:00:00.000Z')
      }),
      '1.0.0',
      1000
    ));

    const runPromise = worker.start();

    try {
      const completed = await waitForJobStatus({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        status: 'completed'
      });

      const publication = completed.result?.publication;
      const htmlDocument = completed.result?.htmlDocument;
      const renderArtifact = completed.result?.renderArtifact;
      expect(publication).toBeDefined();
      expect(htmlDocument).toBeDefined();
      expect(renderArtifact).toBeUndefined();

      const serializedPublication = JSON.stringify(publication);
      const serializedHtml = JSON.stringify(htmlDocument);
      expect(serializedPublication).not.toContain(transcriptSentinel);
      expect(serializedHtml).not.toContain(transcriptSentinel);
      expect(serializedPublication).not.toContain('system prompt');
      expect(serializedHtml).not.toContain('system prompt');
      expect(serializedPublication).not.toContain('user prompt');
      expect(serializedHtml).not.toContain('user prompt');
      expect(serializedPublication).not.toContain('provider request');
      expect(serializedHtml).not.toContain('provider request');
      expect(serializedPublication).not.toContain('provider response');
      expect(serializedHtml).not.toContain('provider response');
      expect(serializedPublication).not.toContain('raw completion');
      expect(serializedHtml).not.toContain('raw completion');
      expect(serializedPublication).not.toContain('authorization');
      expect(serializedHtml).not.toContain('authorization');
      expect(serializedPublication).not.toContain('api key');
      expect(serializedHtml).not.toContain('api key');
      expect(serializedPublication).not.toContain('postgresql://');
      expect(serializedHtml).not.toContain('postgresql://');
      expect(serializedPublication).not.toContain('lease token');
      expect(serializedHtml).not.toContain('lease token');

      expect(publication?.metadata).toBeDefined();
      expect(publication?.cover).toBeDefined();
      expect(publication?.sections.length).toBeGreaterThan(0);
      expect(publication?.toc.entries.every((entry) => entry.pageNumber === null)).toBe(true);
      expect(publication?.references).toBeDefined();
      expect(publication?.citations).toBeDefined();
      expect(publication?.footnotes).toBeDefined();
      expect(publication?.assets).toBeDefined();
      expect(htmlDocument?.metadata.theme).toBe(publication?.metadata.theme);
      expect(htmlDocument?.head.lang).toBe(publication?.document.language);
      expect(htmlDocument?.body.sections.length).toBeGreaterThan(0);

      const events = await listJobEvents({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      expect(events.filter((event) => event.eventType === 'job-completed')).toHaveLength(1);
    } finally {
      await worker.stop();
      await runPromise;
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('maps publication validation failure to permanent failure with no retry or completion event', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'publication-validation-failure-1'
    });

    const jobSource = new DatabaseJobSource(integrationDb);

    const executor = new JobExecutor({
      jobSource,
      heartbeatStore: new DatabaseWorkerHeartbeatStore(jobSource),
      processors: [
        new DeterministicTranscriptProcessor(
          repositories.sourceVersions,
          () => new Date('2026-01-01T00:00:00.000Z'),
          new AIPipeline(
            new MockAIProvider({ mode: 'success', now: () => new Date('2026-01-01T00:00:00.000Z') }),
            '1.0.0',
            1000
          ),
          {
            build: () => {
              throw new PublicationValidationError();
            }
          }
        )
      ],
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleep: async () => undefined,
      heartbeatIntervalMs: 5,
      leaseDurationMs: 1000,
      retryPolicy: {
        baseDelayMs: 10,
        maxDelayMs: 1000,
        maxAttempts: 2
      },
      maxAttempts: 2,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    });

    const leased = await jobSource.acquireNext({
      workerId: 'worker_publication_failure',
      leaseDurationMs: 1000,
      now: new Date('2026-01-01T00:00:00.000Z')
    });

    expect(leased).not.toBeNull();

    const outcome = await executor.execute(leased!, new AbortController().signal);
    expect(outcome).toBe('failed');

    const job = await getJobById({
      tenantId: created.scope.tenantId,
      jobId: created.job.id
    });

    expect(job?.status).toBe('failed');
    expect(job?.errorCode).toBe(ErrorCode.PUBLICATION_VALIDATION_ERROR);
    expect(job?.result).toBeNull();
    expect(job?.nextAttemptAt).toBeNull();

    const events = await listJobEvents({
      tenantId: created.scope.tenantId,
      jobId: created.job.id
    });

    expect(events.filter((event) => event.eventType === 'job-completed')).toHaveLength(0);
    expect(events.filter((event) => event.eventType === 'job-retry-scheduled')).toHaveLength(0);

    await clearWorkerScope(created.scope.tenantId);
  });

  it('maps unsupported publication type to permanent failure and no partial persistence', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'publication-unsupported-type-1'
    });

    const jobSource = new DatabaseJobSource(integrationDb);

    const executor = new JobExecutor({
      jobSource,
      heartbeatStore: new DatabaseWorkerHeartbeatStore(jobSource),
      processors: [
        new DeterministicTranscriptProcessor(
          repositories.sourceVersions,
          () => new Date('2026-01-01T00:00:00.000Z'),
          new AIPipeline(
            new MockAIProvider({ mode: 'success', now: () => new Date('2026-01-01T00:00:00.000Z') }),
            '1.0.0',
            1000
          ),
          {
            build: () => {
              throw new UnsupportedPublicationTypeError('unsupported');
            }
          }
        )
      ],
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleep: async () => undefined,
      heartbeatIntervalMs: 5,
      leaseDurationMs: 1000,
      retryPolicy: {
        baseDelayMs: 10,
        maxDelayMs: 1000,
        maxAttempts: 2
      },
      maxAttempts: 2,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    });

    const leased = await jobSource.acquireNext({
      workerId: 'worker_publication_failure_2',
      leaseDurationMs: 1000,
      now: new Date('2026-01-01T00:00:00.000Z')
    });

    expect(leased).not.toBeNull();

    const outcome = await executor.execute(leased!, new AbortController().signal);
    expect(outcome).toBe('failed');

    const job = await getJobById({
      tenantId: created.scope.tenantId,
      jobId: created.job.id
    });

    expect(job?.status).toBe('failed');
    expect(job?.errorCode).toBe(ErrorCode.PUBLICATION_UNSUPPORTED_TYPE);
    expect(job?.result).toBeNull();

    const events = await listJobEvents({
      tenantId: created.scope.tenantId,
      jobId: created.job.id
    });

    expect(events.filter((event) => event.eventType === 'job-completed')).toHaveLength(0);

    await clearWorkerScope(created.scope.tenantId);
  });

  it('maps html validation failure to permanent failure with no retry or completion event', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'html-validation-failure-1',
      transcriptText: 'PRIVATE_HTML_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST'
    });

    const jobSource = new DatabaseJobSource(integrationDb);

    const executor = new JobExecutor({
      jobSource,
      heartbeatStore: new DatabaseWorkerHeartbeatStore(jobSource),
      processors: [
        new DeterministicTranscriptProcessor(
          repositories.sourceVersions,
          () => new Date('2026-01-01T00:00:00.000Z'),
          new AIPipeline(
            new MockAIProvider({ mode: 'success', now: () => new Date('2026-01-01T00:00:00.000Z') }),
            '1.0.0',
            1000
          ),
          new PublicationBuilder(() => new Date('2026-01-01T00:00:00.000Z')),
          {
            compose: () => {
              throw new HtmlValidationError('PRIVATE_HTML_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST');
            }
          }
        )
      ],
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleep: async () => undefined,
      heartbeatIntervalMs: 5,
      leaseDurationMs: 1000,
      retryPolicy: {
        baseDelayMs: 10,
        maxDelayMs: 1000,
        maxAttempts: 2
      },
      maxAttempts: 2,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    });

    const leased = await jobSource.acquireNext({
      workerId: 'worker_html_failure',
      leaseDurationMs: 1000,
      now: new Date('2026-01-01T00:00:00.000Z')
    });

    expect(leased).not.toBeNull();

    const outcome = await executor.execute(leased!, new AbortController().signal);
    expect(outcome).toBe('failed');

    const job = await getJobById({
      tenantId: created.scope.tenantId,
      jobId: created.job.id
    });

    expect(job?.status).toBe('failed');
    expect(job?.errorCode).toBe(ErrorCode.HTML_VALIDATION_ERROR);
    expect(job?.result).toBeNull();
    expect(job?.nextAttemptAt).toBeNull();
    expect(job?.errorMessage).not.toContain('PRIVATE_HTML_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST');

    const events = await listJobEvents({
      tenantId: created.scope.tenantId,
      jobId: created.job.id
    });

    expect(events.filter((event) => event.eventType === 'job-completed')).toHaveLength(0);
    expect(events.filter((event) => event.eventType === 'job-retry-scheduled')).toHaveLength(0);

    await clearWorkerScope(created.scope.tenantId);
  });

  it('persists optional render artifact when renderer is configured and does not leak render privacy sentinel', async () => {
    const transcriptSentinel = 'PRIVATE_RENDER_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST';
    const created = await createQueuedJob({
      idempotencyKey: 'render-success-1',
      transcriptText: transcriptSentinel
    });

    const jobSource = new DatabaseJobSource(integrationDb);

    const executor = new JobExecutor({
      jobSource,
      heartbeatStore: new DatabaseWorkerHeartbeatStore(jobSource),
      processors: [
        new DeterministicTranscriptProcessor(
          repositories.sourceVersions,
          () => new Date('2026-01-01T00:00:00.000Z'),
          new AIPipeline(
            new MockAIProvider({ mode: 'success', now: () => new Date('2026-01-01T00:00:00.000Z') }),
            '1.0.0',
            1000
          ),
          new PublicationBuilder(() => new Date('2026-01-01T00:00:00.000Z')),
          new PublicationHtmlComposer(),
          new HtmlPassthroughRenderer({
            now: () => new Date('2026-01-01T00:00:00.000Z'),
            createArtifactId: () => 'artifact_render_success_1'
          })
        )
      ],
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleep: async () => undefined,
      heartbeatIntervalMs: 5,
      leaseDurationMs: 1000,
      retryPolicy: {
        baseDelayMs: 10,
        maxDelayMs: 1000,
        maxAttempts: 2
      },
      maxAttempts: 2,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    });

    const leased = await jobSource.acquireNext({
      workerId: 'worker_render_success',
      leaseDurationMs: 1000,
      now: new Date('2026-01-01T00:00:00.000Z')
    });

    expect(leased).not.toBeNull();

    const outcome = await executor.execute(leased!, new AbortController().signal);
    expect(outcome).toBe('completed');

    const job = await getJobById({
      tenantId: created.scope.tenantId,
      jobId: created.job.id
    });

    expect(job?.status).toBe('completed');
    expect(job?.result?.renderArtifact?.metadata.format).toBe('html');
    expect(job?.result?.renderArtifact?.metadata.payloadRepresentation).toBe('structured-json');
    expect(job?.result?.renderArtifact?.metadata.mimeType).toBe('application/json');
    expect(job?.result?.renderArtifact?.metadata.fileExtension).toBe('.json');

    const serialized = JSON.stringify(job?.result);
    expect(serialized).not.toContain(transcriptSentinel);
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('api key');
    expect(serialized).not.toContain('provider response');

    const events = await listJobEvents({
      tenantId: created.scope.tenantId,
      jobId: created.job.id
    });

    expect(events.filter((event) => event.eventType === 'job-completed')).toHaveLength(1);

    await clearWorkerScope(created.scope.tenantId);
  });

  it('selects html-markup renderer explicitly and persists html artifact metadata', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'render-html-markup-selection-1',
      transcriptText: 'PRIVATE_RENDER_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST'
    });

    const worker = buildSuccessWorker(new AIPipeline(
      new MockAIProvider({
        mode: 'success',
        now: () => new Date('2026-01-01T00:00:00.000Z')
      }),
      '1.0.0',
      1000
    ), {
      rendererSelection: 'html-markup',
      createRenderArtifactId: () => 'artifact_html_markup_selection_1'
    });

    const runPromise = worker.start();

    try {
      const completed = await waitForJobStatus({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        status: 'completed'
      });

      expect(completed.result?.renderArtifact?.metadata.format).toBe('html');
      expect(completed.result?.renderArtifact?.metadata.payloadRepresentation).toBe('html-markup');
      expect(completed.result?.renderArtifact?.metadata.mimeType).toBe('text/html; charset=utf-8');
      expect(completed.result?.renderArtifact?.metadata.fileExtension).toBe('.html');
      expect(completed.result?.renderArtifact?.content?.serializedDocument.startsWith('<!doctype html>')).toBe(true);

      const events = await listJobEvents({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      expect(events.filter((event) => event.eventType === 'job-completed')).toHaveLength(1);
    } finally {
      await worker.stop();
      await runPromise;
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('selects structured-json renderer explicitly and preserves passthrough artifact metadata', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'render-structured-selection-1',
      transcriptText: 'PRIVATE_RENDER_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST'
    });

    const worker = buildSuccessWorker(new AIPipeline(
      new MockAIProvider({
        mode: 'success',
        now: () => new Date('2026-01-01T00:00:00.000Z')
      }),
      '1.0.0',
      1000
    ), {
      rendererSelection: 'structured-json',
      createRenderArtifactId: () => 'artifact_structured_selection_1'
    });

    const runPromise = worker.start();

    try {
      const completed = await waitForJobStatus({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        status: 'completed'
      });

      expect(completed.result?.renderArtifact?.metadata.format).toBe('html');
      expect(completed.result?.renderArtifact?.metadata.payloadRepresentation).toBe('structured-json');
      expect(completed.result?.renderArtifact?.metadata.mimeType).toBe('application/json');
      expect(completed.result?.renderArtifact?.metadata.fileExtension).toBe('.json');
      expect(completed.result?.renderArtifact?.content?.serializedDocument.trim().startsWith('{')).toBe(true);
    } finally {
      await worker.stop();
      await runPromise;
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('maps deterministic render format failure to permanent failure with no retry, completion, or partial render persistence', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'render-format-failure-1',
      transcriptText: 'PRIVATE_RENDER_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST'
    });

    const jobSource = new DatabaseJobSource(integrationDb);

    const executor = new JobExecutor({
      jobSource,
      heartbeatStore: new DatabaseWorkerHeartbeatStore(jobSource),
      processors: [
        new DeterministicTranscriptProcessor(
          repositories.sourceVersions,
          () => new Date('2026-01-01T00:00:00.000Z'),
          new AIPipeline(
            new MockAIProvider({ mode: 'success', now: () => new Date('2026-01-01T00:00:00.000Z') }),
            '1.0.0',
            1000
          ),
          new PublicationBuilder(() => new Date('2026-01-01T00:00:00.000Z')),
          new PublicationHtmlComposer(),
          {
            render: () => {
              throw new UnsupportedRenderFormatError('PRIVATE_RENDER_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST');
            },
            validate: () => undefined,
            getCapabilities: () => ({ renderer: 'test', formats: ['html'], themes: ['classic'], supportedTokenCategories: ['page-intent'] }),
            supports: () => false,
            supportedThemes: () => ['classic'],
            supportedFormats: () => ['html']
          }
        )
      ],
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleep: async () => undefined,
      heartbeatIntervalMs: 5,
      leaseDurationMs: 1000,
      retryPolicy: {
        baseDelayMs: 10,
        maxDelayMs: 1000,
        maxAttempts: 2
      },
      maxAttempts: 2,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    });

    const leased = await jobSource.acquireNext({
      workerId: 'worker_render_failure',
      leaseDurationMs: 1000,
      now: new Date('2026-01-01T00:00:00.000Z')
    });

    expect(leased).not.toBeNull();

    const outcome = await executor.execute(leased!, new AbortController().signal);
    expect(outcome).toBe('failed');

    const job = await getJobById({
      tenantId: created.scope.tenantId,
      jobId: created.job.id
    });

    expect(job?.status).toBe('failed');
    expect(job?.errorCode).toBe(ErrorCode.UNSUPPORTED_FORMAT);
    expect(job?.result).toBeNull();
    expect(job?.nextAttemptAt).toBeNull();
    expect(job?.errorMessage).not.toContain('PRIVATE_RENDER_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST');

    const events = await listJobEvents({
      tenantId: created.scope.tenantId,
      jobId: created.job.id
    });

    expect(events.filter((event) => event.eventType === 'job-completed')).toHaveLength(0);
    expect(events.filter((event) => event.eventType === 'job-retry-scheduled')).toHaveLength(0);

    await clearWorkerScope(created.scope.tenantId);
  });

  it('preserves cancellation behavior when rendering is cancelled', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'render-cancelled-1'
    });

    const jobSource = new DatabaseJobSource(integrationDb);

    const executor = new JobExecutor({
      jobSource,
      heartbeatStore: new DatabaseWorkerHeartbeatStore(jobSource),
      processors: [
        new DeterministicTranscriptProcessor(
          repositories.sourceVersions,
          () => new Date('2026-01-01T00:00:00.000Z'),
          new AIPipeline(
            new MockAIProvider({ mode: 'success', now: () => new Date('2026-01-01T00:00:00.000Z') }),
            '1.0.0',
            1000
          ),
          new PublicationBuilder(() => new Date('2026-01-01T00:00:00.000Z')),
          new PublicationHtmlComposer(),
          {
            render: () => {
              throw new RenderCancelledError();
            },
            validate: () => undefined,
            getCapabilities: () => ({ renderer: 'test', formats: ['html'], themes: ['classic'], supportedTokenCategories: ['page-intent'] }),
            supports: () => true,
            supportedThemes: () => ['classic'],
            supportedFormats: () => ['html']
          }
        )
      ],
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleep: async () => undefined,
      heartbeatIntervalMs: 5,
      leaseDurationMs: 1000,
      retryPolicy: {
        baseDelayMs: 10,
        maxDelayMs: 1000,
        maxAttempts: 2
      },
      maxAttempts: 2,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    });

    const leased = await jobSource.acquireNext({
      workerId: 'worker_render_cancelled',
      leaseDurationMs: 1000,
      now: new Date('2026-01-01T00:00:00.000Z')
    });

    expect(leased).not.toBeNull();

    const outcome = await executor.execute(leased!, new AbortController().signal);
    expect(outcome).toBe('cancelled');

    const job = await getJobById({
      tenantId: created.scope.tenantId,
      jobId: created.job.id
    });

    expect(job?.status).toBe('processing');
    expect(job?.result).toBeNull();

    const events = await listJobEvents({
      tenantId: created.scope.tenantId,
      jobId: created.job.id
    });

    expect(events.filter((event) => event.eventType === 'job-completed')).toHaveLength(0);

    await clearWorkerScope(created.scope.tenantId);
  });
});
