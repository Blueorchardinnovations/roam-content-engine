import { describe, expect, it } from 'vitest';

import { AITimeoutError, AIValidationError } from '../../../src/domain/ai/ai-provider-error.js';
import { PermanentWorkerError, RetryableWorkerError, WorkerCancelledError } from '../../../src/domain/workers/worker-errors.js';
import type { SourceVersionRepository } from '../../../src/domain/repositories/source-version-repository.js';
import { DeterministicTranscriptProcessor } from '../../../src/infrastructure/workers/deterministic-transcript-processor.js';

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

describe('deterministic transcript processor AI error mapping', () => {
  it('maps transient AI failures to retryable worker errors', async () => {
    const processor = new DeterministicTranscriptProcessor(
      createRepository(),
      () => new Date('2026-01-01T00:00:00.000Z'),
      {
        run: async () => {
          throw new AITimeoutError('temporary timeout');
        }
      } as any
    );

    await expect(
      processor.process({
        job: baseJob,
        signal: new AbortController().signal,
        reportStage: async () => undefined,
        heartbeat: async () => undefined
      })
    ).rejects.toBeInstanceOf(RetryableWorkerError);
  });

  it('maps invalid AI outputs to permanent worker errors', async () => {
    const processor = new DeterministicTranscriptProcessor(
      createRepository(),
      () => new Date('2026-01-01T00:00:00.000Z'),
      {
        run: async () => {
          throw new AIValidationError('bad schema output');
        }
      } as any
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

  it('preserves caller cancellation as worker cancellation', async () => {
    const processor = new DeterministicTranscriptProcessor(
      createRepository(),
      () => new Date('2026-01-01T00:00:00.000Z'),
      {
        run: async () => {
          throw new WorkerCancelledError('cancelled');
        }
      } as any
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
});
