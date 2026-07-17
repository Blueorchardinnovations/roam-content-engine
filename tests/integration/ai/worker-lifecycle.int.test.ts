import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import { AIPipeline } from '../../../src/application/ai/pipeline.js';
import { JobExecutor } from '../../../src/application/workers/job-executor.js';
import type { AIProvider, AIRequest } from '../../../src/domain/ai/ai-provider.js';
import { AIProviderUnavailableError } from '../../../src/domain/ai/ai-provider-error.js';
import { MockAIProvider } from '../../../src/infrastructure/ai/providers/mock-provider.js';
import { createWorkerApp } from '../../../src/worker/app.js';
import { clearAllWorkerData, clearWorkerScope, createQueuedJob, getJobById, integrationDb, listJobEvents, repositories, setJobFields } from '../workers/support.js';
import { DatabaseJobSource } from '../../../src/infrastructure/workers/database-job-source.js';
import { DatabaseWorkerHeartbeatStore } from '../../../src/infrastructure/workers/worker-heartbeat-store.js';
import { DeterministicTranscriptProcessor } from '../../../src/infrastructure/workers/deterministic-transcript-processor.js';
import { WorkerCancelledError } from '../../../src/domain/workers/worker-errors.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function buildSuccessWorker(aiPipeline: AIPipeline) {
  return createWorkerApp({
    workerConfig: {
      workerId: 'worker_ai_test',
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

describe.sequential('ai worker lifecycle integration', () => {
  beforeEach(async () => {
    await clearAllWorkerData();
  });

  it('processes a queued job successfully and persists AI metadata', async () => {
    const transcriptSentinel = 'PRIVATE_TRANSCRIPT_SENTINEL_DO_NOT_PERSIST';
    const created = await createQueuedJob({
      idempotencyKey: 'ai-worker-success-1',
      transcriptText: `One two\n\n${transcriptSentinel}`
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

      expect(completed.result).not.toBeNull();
      expect(completed.result?.ai?.provider).toBe('mock');
      expect(completed.result?.ai?.model).toBe('default');
      expect(completed.result?.ai?.pipelineVersion).toBe('1.0.0');
      expect(completed.result?.ai?.promptExecutions).toHaveLength(5);
      expect(completed.result?.ai?.promptExecutions.every((entry) => entry.promptVersion === '1.0')).toBe(true);
      expect(completed.result?.ai?.usageTotals.estimatedCostUsd).toBeNull();
      expect(completed.result?.ai && 'prompt' in completed.result.ai).toBe(false);
      expect(completed.result?.publication).toBeDefined();
      expect(completed.result?.publication?.metadata.publicationType).toBe('cta-guide');
      expect(completed.result?.publication?.toc.entries.every((entry) => entry.pageNumber === null)).toBe(true);
      expect(completed.result?.publication?.sections.length).toBeGreaterThanOrEqual(3);
      expect(completed.result?.publication?.renderOptions.preferredTargets).toContain('cta-guide');
      expect(completed.result?.publication?.sections.some((section) => section.id === 'call-to-action')).toBe(false);
      expect(completed.result?.publication?.sections.some((section) => section.id === 'prayer')).toBe(false);
      expect(completed.result?.publication?.sections.some((section) => section.id === 'journal-prompts')).toBe(false);
      expect(completed.result?.publication?.sections.some((section) => section.id === 'next-steps')).toBe(false);

      const persistedAi = completed.result?.ai;
      expect(persistedAi).toBeDefined();

      const persistedPublication = completed.result?.publication;
      expect(persistedPublication).toBeDefined();

      const serialized = JSON.stringify(persistedAi);
      expect(serialized).not.toContain(transcriptSentinel);
      expect(serialized).not.toContain('system prompt');
      expect(serialized).not.toContain('user prompt');
      expect(serialized).not.toContain('raw request');
      expect(serialized).not.toContain('raw response');
      expect(serialized).not.toContain('messages');
      expect(serialized).not.toContain('authorization');
      expect(serialized).not.toContain('api key');

      const serializedPublication = JSON.stringify(persistedPublication);
      expect(serializedPublication).not.toContain(transcriptSentinel);
      expect(serializedPublication).not.toContain('system prompt');
      expect(serializedPublication).not.toContain('user prompt');
      expect(serializedPublication).not.toContain('provider request');
      expect(serializedPublication).not.toContain('provider response');
      expect(serializedPublication).not.toContain('raw completion');
      expect(serializedPublication).not.toContain('api key');
      expect(serializedPublication).not.toContain('authorization');
      expect(serializedPublication).not.toContain('postgresql://');
      expect(serializedPublication).not.toContain('lease token');

      for (const execution of completed.result?.ai?.promptExecutions ?? []) {
        expect(Object.keys(execution).sort()).toEqual([
          'generatedAt',
          'model',
          'pipelineVersion',
          'promptKey',
          'promptVersion',
          'provider',
          'stage',
          'usage'
        ]);
        expect(Object.keys(execution.usage).sort()).toEqual([
          'estimatedCostUsd',
          'inputTokens',
          'latencyMs',
          'outputTokens',
          'totalTokens'
        ]);
        expect(execution.usage.totalTokens).toBe(execution.usage.inputTokens + execution.usage.outputTokens);
      }

      const usageTotals = completed.result?.ai?.usageTotals;
      expect(usageTotals?.totalTokens).toBe((usageTotals?.inputTokens ?? 0) + (usageTotals?.outputTokens ?? 0));

      expect(completed.result?.ai?.metadata.title.length).toBeGreaterThan(0);
      expect(completed.result?.ai?.summary.shortSummary.length).toBeGreaterThan(0);
      expect(completed.result?.ai?.keywords.keywords.length).toBeGreaterThan(0);
      expect(completed.result?.ai?.scripture.references.length).toBeGreaterThan(0);
      expect(completed.result?.ai?.reflections.reflections.length).toBeGreaterThan(0);

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

  it('fails after maximum retryable AI attempts with no duplicate retry events', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'ai-worker-max-attempts-1'
    });

    const maxAttempts = 3;
    const retryableProviderCalls = { value: 0 };
    const alwaysRetryableProvider: AIProvider = {
      providerName: 'mock',
      async generate() {
        retryableProviderCalls.value += 1;
        throw new AIProviderUnavailableError('Forced retryable AI failure for max-attempt integration test.');
      }
    };
    const alwaysRetryablePipeline = new AIPipeline(alwaysRetryableProvider, '1.0.0', 1000);

    const jobSource = new DatabaseJobSource(integrationDb);
    const executor = new JobExecutor({
      jobSource,
      heartbeatStore: new DatabaseWorkerHeartbeatStore(jobSource),
      processors: [
        new DeterministicTranscriptProcessor(
          repositories.sourceVersions,
          () => new Date('2026-01-01T00:00:00.000Z'),
          alwaysRetryablePipeline
        )
      ],
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      sleep: async () => undefined,
      heartbeatIntervalMs: 5,
      leaseDurationMs: 1000,
      retryPolicy: {
        baseDelayMs: 10,
        maxDelayMs: 1000,
        maxAttempts
      },
      maxAttempts,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    });

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const leased = await jobSource.acquireNext({
          workerId: 'worker_ai_max_attempts',
          leaseDurationMs: 1000,
          now: new Date('2026-01-01T00:00:00.000Z')
        });

        expect(leased).not.toBeNull();

        const outcome = await executor.execute(leased!, new AbortController().signal);

        const persisted = await getJobById({
          tenantId: created.scope.tenantId,
          jobId: created.job.id
        });

        if (attempt < maxAttempts) {
          expect(outcome).toBe('retry-scheduled');
          expect(persisted?.status).toBe('retrying');
          expect(persisted?.nextAttemptAt).not.toBeNull();

          await setJobFields({
            tenantId: created.scope.tenantId,
            jobId: created.job.id,
            values: {
              nextAttemptAt: new Date('2025-12-31T23:59:59.000Z')
            }
          });
        } else {
          expect(outcome).toBe('failed');
          expect(persisted?.status).toBe('failed');
          expect(persisted?.errorCode).toBe(ErrorCode.WORKER_MAX_ATTEMPTS_EXCEEDED);
          expect(persisted?.nextAttemptAt).toBeNull();
          expect(persisted?.leaseOwner).toBeNull();
          expect(persisted?.leaseExpiresAt).toBeNull();
          expect(persisted?.heartbeatAt).toBeNull();
          expect(persisted?.result).toBeNull();
          expect(persisted?.attemptCount).toBe(maxAttempts);
        }
      }

      expect(retryableProviderCalls.value).toBe(maxAttempts);

      const events = await listJobEvents({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      expect(events.filter((event) => event.eventType === 'job-retry-scheduled')).toHaveLength(maxAttempts - 1);
      expect(events.filter((event) => event.eventType === 'job-completed')).toHaveLength(0);
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('schedules retry for retryable AI failures', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'ai-worker-retry-1'
    });

    const worker = buildSuccessWorker(new AIPipeline(
      new MockAIProvider({
        mode: 'retryable-failure',
        now: () => new Date('2026-01-01T00:00:00.000Z')
      }),
      '1.0.0',
      1000
    ));

    const runPromise = worker.start();

    try {
      const retrying = await waitForJobStatus({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        status: 'retrying'
      });

      expect(retrying.nextAttemptAt).not.toBeNull();
      expect(retrying.leaseOwner).toBeNull();
      expect(retrying.leaseExpiresAt).toBeNull();
      expect(retrying.heartbeatAt).toBeNull();
      expect(retrying.completedAt).toBeNull();

      const events = await listJobEvents({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      expect(events.filter((event) => event.eventType === 'job-retry-scheduled')).toHaveLength(1);
      expect(events.filter((event) => event.eventType === 'job-completed')).toHaveLength(0);
    } finally {
      await worker.stop();
      await runPromise;
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('marks permanent AI failures as failed without retry', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'ai-worker-failure-1'
    });

    const worker = buildSuccessWorker(new AIPipeline(
      new MockAIProvider({
        mode: 'permanent-failure',
        now: () => new Date('2026-01-01T00:00:00.000Z')
      }),
      '1.0.0',
      1000
    ));

    const runPromise = worker.start();

    try {
      const failed = await waitForJobStatus({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        status: 'failed'
      });

      expect(failed.errorCode).toBeDefined();
      expect(failed.leaseOwner).toBeNull();
      expect(failed.nextAttemptAt).toBeNull();

      const events = await listJobEvents({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      expect(events.filter((event) => event.eventType === 'job-failed')).toHaveLength(1);
      expect(events.filter((event) => event.eventType === 'job-completed')).toHaveLength(0);
    } finally {
      await worker.stop();
      await runPromise;
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('treats timeout as retryable work at the worker boundary', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'ai-worker-timeout-1'
    });

    const worker = buildSuccessWorker(new AIPipeline(
      new MockAIProvider({
        mode: 'timeout',
        now: () => new Date('2026-01-01T00:00:00.000Z')
      }),
      '1.0.0',
      1000
    ));

    const runPromise = worker.start();

    try {
      const retrying = await waitForJobStatus({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        status: 'retrying'
      });

      expect(retrying.nextAttemptAt).not.toBeNull();
      expect(retrying.errorCode).toBeDefined();
    } finally {
      await worker.stop();
      await runPromise;
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('does not complete a job after worker shutdown cancellation', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'ai-worker-cancel-1'
    });

    const deferred = createDeferred<any>();
    const pipeline = new AIPipeline({
      providerName: 'mock',
      async generate() {
        return await deferred.promise;
      }
    }, '1.0.0', 1000);

    const worker = buildSuccessWorker(pipeline);
    const runPromise = worker.start();

    try {
      await new Promise<void>((resolve) => setImmediate(resolve));

      const stopped = worker.stop();
      deferred.resolve({
        provider: 'mock',
        model: 'default',
        output: {
          title: 'Title',
          description: 'Description',
          language: 'en',
          audience: 'general'
        },
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          estimatedCostUsd: null,
          latencyMs: 1
        },
        generatedAt: '2026-01-01T00:00:00.000Z'
      });

      await stopped;
      await runPromise;

      const job = await getJobById({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      expect(job?.status).not.toBe('completed');
      expect(job?.status).not.toBe('retrying');
      expect(job?.result).toBeNull();
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('prevents late AI completion after lease replacement', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'ai-worker-lease-loss-1'
    });

    const deferred = createDeferred<any>();
    const pipeline = new AIPipeline({
      providerName: 'mock',
      async generate<TSchema extends z.ZodTypeAny>(_request: AIRequest<TSchema>, signal: AbortSignal) {
        return await new Promise((resolve, reject) => {
          const onAbort = () => {
            reject(new WorkerCancelledError());
          };

          if (signal.aborted) {
            onAbort();
            return;
          }

          signal.addEventListener('abort', onAbort, { once: true });
          deferred.promise.then((value) => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
          }, reject);
        });
      }
    }, '1.0.0', 1000);

    const worker = buildSuccessWorker(pipeline);
    const runPromise = worker.start();

    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      vi.useFakeTimers();

      await setJobFields({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        values: {
          leaseOwner: 'worker_replacement',
          leaseExpiresAt: new Date('2025-12-31T23:59:59.000Z')
        }
      });
      await vi.advanceTimersByTimeAsync(100);
      deferred.resolve({
        provider: 'mock',
        model: 'default',
        output: {
          title: 'Title',
          description: 'Description',
          language: 'en',
          audience: 'general'
        },
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          estimatedCostUsd: null,
          latencyMs: 1
        },
        generatedAt: '2026-01-01T00:00:00.000Z'
      });
      await Promise.resolve();

      const job = await getJobById({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      expect(job?.status).not.toBe('completed');
      expect(job?.result).toBeNull();
    } finally {
      const stopPromise = worker.stop();
      await vi.runAllTimersAsync();
      vi.useRealTimers();
      await stopPromise;
      await runPromise;
      await clearWorkerScope(created.scope.tenantId);
    }
  });
});
