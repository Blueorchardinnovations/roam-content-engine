import { beforeEach, describe, expect, it } from 'vitest';

import { createWorkerApp } from '../../../src/worker/app.js';
import { JobExecutor } from '../../../src/application/workers/job-executor.js';
import { DatabaseJobSource } from '../../../src/infrastructure/workers/database-job-source.js';
import { DeterministicTranscriptProcessor } from '../../../src/infrastructure/workers/deterministic-transcript-processor.js';
import { DatabaseWorkerHeartbeatStore } from '../../../src/infrastructure/workers/worker-heartbeat-store.js';
import { createProjectId } from '../../../src/platform/identity/ids/index.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';

import {
  clearWorkerScope,
  clearAllWorkerData,
  createQueuedJob,
  getJobById,
  integrationDb,
  repositories,
  setJobFields,
  listJobEvents
} from './support.js';

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

describe.sequential('worker lifecycle integration', () => {
  beforeEach(async () => {
    await clearAllWorkerData();
  });

  it('processes queued transcript job deterministically and clears lease metadata', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'worker-lifecycle-success-1',
      transcriptText: 'One two\n\nThree four'
    });

    const jobSource = new DatabaseJobSource(integrationDb);

    try {
      await setJobFields({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        values: {
          createdAt: new Date('2000-01-01T00:00:00.000Z')
        }
      });

      const acquired = await jobSource.acquireNext({
        workerId: 'worker_lifecycle_success',
        leaseDurationMs: 30000,
        now: new Date('2026-01-01T00:00:00.000Z')
      });

      if (!acquired) {
        throw new Error('Expected lifecycle job acquisition.');
      }

      const executionNow = new Date('2026-01-01T00:00:01.000Z');

      const executor = new JobExecutor({
        jobSource,
        heartbeatStore: new DatabaseWorkerHeartbeatStore(jobSource),
        processors: [new DeterministicTranscriptProcessor(repositories.sourceVersions, () => new Date())],
        now: () => executionNow,
        sleep: async (delayMs) => {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delayMs);
          });
        },
        heartbeatIntervalMs: 5,
        leaseDurationMs: 30000,
        retryPolicy: {
          baseDelayMs: 100,
          maxDelayMs: 1000,
          maxAttempts: 5
        },
        maxAttempts: 5,
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined
        }
      });

      const outcome = await executor.execute(acquired, new AbortController().signal);

      expect(outcome).toBe('completed');

      const completed = await getJobById({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      expect(completed?.status).toBe('completed');

      expect(completed.result).not.toBeNull();
      expect(completed.leaseOwner).toBeNull();
      expect(completed.leaseExpiresAt).toBeNull();
      expect(completed.heartbeatAt).toBeNull();
      expect(completed.nextAttemptAt).toBeNull();

      const events = await listJobEvents({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      const eventTypes = events.map((event) => event.eventType);
      expect(eventTypes).toContain('job-lease-acquired');
      expect(eventTypes).toContain('job-completed');
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('fails permanently when source and project ownership mismatch occurs', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'worker-lifecycle-project-mismatch-1'
    });

    const mismatchProject = createProjectId();

    await setJobFields({
      tenantId: created.scope.tenantId,
      jobId: created.job.id,
      values: {
        projectId: mismatchProject
      }
    });

    const jobSource = new DatabaseJobSource(integrationDb);

    const worker = createWorkerApp({
      workerConfig: {
        workerId: 'worker_lifecycle_failure',
        pollIntervalMs: 5,
        leaseDurationMs: 1000,
        heartbeatIntervalMs: 100,
        maxAttempts: 3,
        concurrency: 1,
        shutdownTimeoutMs: 1000,
        staleRecoveryIntervalMs: 1000,
        retryBaseDelayMs: 100,
        retryMaxDelayMs: 1000
      },
      sourceVersionRepository: repositories.sourceVersions,
      jobSource,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      }
    });

    const runPromise = worker.start();

    try {
      const failed = await waitForJobStatus({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        status: 'failed'
      });

      expect(failed.errorCode).toBe('SOURCE_PROJECT_MISMATCH');
    } finally {
      await worker.stop();
      await runPromise;
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('preserves startedAt and increments attempts across retries and reacquisition', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'worker-lifecycle-retry-1'
    });

    const source = new DatabaseJobSource(integrationDb);
    const now = new Date('2026-01-01T00:00:00.000Z');

    try {
      const first = await source.acquireNext({
        workerId: 'worker_retry_started_at',
        leaseDurationMs: 30000,
        now
      });

      if (!first) {
        throw new Error('Expected initial acquisition.');
      }

      expect(first.attemptCount).toBe(1);
      expect(first.startedAt?.toISOString()).toBe(now.toISOString());

      await source.scheduleRetry({
        tenantId: first.tenantId,
        jobId: first.id,
        workerId: first.leaseOwner,
        errorCode: 'WORKER_RETRYABLE',
        errorMessage: 'retry',
        nextAttemptAt: now,
        now
      });

      const second = await source.acquireNext({
        workerId: 'worker_retry_started_at',
        leaseDurationMs: 30000,
        now: new Date('2026-01-01T00:01:00.000Z')
      });

      if (!second) {
        throw new Error('Expected second acquisition.');
      }

      expect(second.attemptCount).toBe(2);
      expect(second.startedAt?.toISOString()).toBe(first.startedAt?.toISOString());
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('marks unsupported job type as permanent failure without retry and clears lease fields', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'worker-lifecycle-unsupported-1'
    });

    const source = new DatabaseJobSource(integrationDb);
    const now = new Date('2026-01-01T00:00:00.000Z');

    try {
      const acquired = await source.acquireNext({
        workerId: 'worker_unsupported',
        leaseDurationMs: 30000,
        now
      });

      if (!acquired) {
        throw new Error('Expected job acquisition.');
      }

      const executor = new JobExecutor({
        jobSource: source,
        heartbeatStore: new DatabaseWorkerHeartbeatStore(source),
        processors: [],
        now: () => now,
        sleep: async () => undefined,
        heartbeatIntervalMs: 10,
        leaseDurationMs: 30000,
        retryPolicy: {
          baseDelayMs: 100,
          maxDelayMs: 1000,
          maxAttempts: 5
        },
        maxAttempts: 5,
        logger: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined
        }
      });

      const outcome = await executor.execute(acquired, new AbortController().signal);
      expect(outcome).toBe('failed');

      const persisted = await getJobById({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      expect(persisted?.status).toBe('failed');
      expect(persisted?.errorCode).toBe(ErrorCode.WORKER_UNSUPPORTED_JOB_TYPE);
      expect((persisted?.errorMessage?.length ?? 0)).toBeLessThanOrEqual(500);
      expect(persisted?.leaseOwner).toBeNull();
      expect(persisted?.leaseExpiresAt).toBeNull();
      expect(persisted?.heartbeatAt).toBeNull();

      const events = await listJobEvents({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      expect(events.filter((event) => event.eventType === 'job-failed')).toHaveLength(1);
      expect(events.filter((event) => event.eventType === 'job-retry-scheduled')).toHaveLength(0);
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });
});
