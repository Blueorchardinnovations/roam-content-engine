import { beforeEach, describe, expect, it } from 'vitest';

import { DatabaseJobSource } from '../../../src/infrastructure/workers/database-job-source.js';

import {
  clearWorkerScope,
  clearAllWorkerData,
  createQueuedJob,
  getJobById,
  integrationDb,
  setJobFields,
  listJobEvents
} from './support.js';

describe.sequential('worker job acquisition and lease integration', () => {
  beforeEach(async () => {
    await clearAllWorkerData();
  });

  it('acquires queued jobs, records lease metadata, and increments attempts once', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'acquire-queued-1'
    });

    const jobSource = new DatabaseJobSource(integrationDb);
    const now = new Date('2026-01-01T00:00:00.000Z');

    try {
      await setJobFields({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        values: {
          createdAt: new Date('2000-01-01T00:00:00.000Z')
        }
      });

      const acquired = await jobSource.acquireNext({
        workerId: 'worker_a_1',
        leaseDurationMs: 30000,
        now
      });

      expect(acquired).not.toBeNull();
      expect(acquired?.id).toBe(created.job.id);
      expect(acquired?.leaseOwner).toBe('worker_a_1');
      expect(acquired?.attemptCount).toBe(1);
      expect(acquired?.status).toBe('processing');

      const persisted = await getJobById({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      expect(persisted?.leaseOwner).toBe('worker_a_1');
      expect(persisted?.leaseExpiresAt).not.toBeNull();
      expect(persisted?.heartbeatAt).not.toBeNull();
      expect(persisted?.attemptCount).toBe(1);

      const events = await listJobEvents({
        tenantId: created.scope.tenantId,
        jobId: created.job.id
      });

      expect(events.some((event) => event.eventType === 'job-lease-acquired')).toBe(true);
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('does not acquire retrying jobs when nextAttemptAt is null', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'retry-null-1'
    });

    const now = new Date('2026-01-01T00:00:00.000Z');
    const jobSource = new DatabaseJobSource(integrationDb);

    try {
      await setJobFields({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        values: {
          status: 'retrying',
          nextAttemptAt: null
        }
      });

      const acquired = await jobSource.acquireNext({
        workerId: 'worker_retry_1',
        leaseDurationMs: 30000,
        now
      });

      expect(acquired).toBeNull();
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('does not acquire retrying jobs before future nextAttemptAt', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'retry-future-1'
    });

    const now = new Date('2026-01-01T00:00:00.000Z');
    const jobSource = new DatabaseJobSource(integrationDb);

    try {
      await setJobFields({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        values: {
          status: 'retrying',
          nextAttemptAt: new Date('2026-01-01T00:10:00.000Z')
        }
      });

      const acquired = await jobSource.acquireNext({
        workerId: 'worker_retry_2',
        leaseDurationMs: 30000,
        now
      });

      expect(acquired).toBeNull();
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('acquires retrying jobs when nextAttemptAt equals now', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'retry-equal-1'
    });

    const now = new Date('2026-01-01T00:10:00.000Z');
    const jobSource = new DatabaseJobSource(integrationDb);

    try {
      await setJobFields({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        values: {
          status: 'retrying',
          nextAttemptAt: now
        }
      });

      const due = await jobSource.acquireNext({
        workerId: 'worker_retry_3',
        leaseDurationMs: 30000,
        now
      });

      expect(due?.id).toBe(created.job.id);
      expect(due?.status).toBe('processing');
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('acquires retrying jobs when nextAttemptAt is in the past', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'retry-past-1'
    });

    const now = new Date('2026-01-01T00:10:00.000Z');
    const jobSource = new DatabaseJobSource(integrationDb);

    try {
      await setJobFields({
        tenantId: created.scope.tenantId,
        jobId: created.job.id,
        values: {
          status: 'retrying',
          nextAttemptAt: new Date('2026-01-01T00:09:59.000Z')
        }
      });

      const due = await jobSource.acquireNext({
        workerId: 'worker_retry_4',
        leaseDurationMs: 30000,
        now
      });

      expect(due?.id).toBe(created.job.id);
      expect(due?.status).toBe('processing');
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('allows exactly one winner when two workers race for one job', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'race-1'
    });

    const now = new Date('2026-01-01T00:00:00.000Z');

    const sourceA = new DatabaseJobSource(integrationDb);
    const sourceB = new DatabaseJobSource(integrationDb);

    try {
      const [first, second] = await Promise.all([
        sourceA.acquireNext({
          workerId: 'worker_race_a',
          leaseDurationMs: 30000,
          now
        }),
        sourceB.acquireNext({
          workerId: 'worker_race_b',
          leaseDurationMs: 30000,
          now
        })
      ]);

      const winners = [first, second].filter((value) => value !== null);

      expect(winners).toHaveLength(1);
      expect(winners[0]?.id).toBe(created.job.id);
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('does not acquire completed, failed, or cancelled jobs', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'terminal-1'
    });

    const source = new DatabaseJobSource(integrationDb);

    try {
      for (const status of ['completed', 'failed', 'cancelled'] as const) {
        await setJobFields({
          tenantId: created.scope.tenantId,
          jobId: created.job.id,
          values: {
            status,
            leaseOwner: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            nextAttemptAt: null
          }
        });

        const acquired = await source.acquireNext({
          workerId: 'worker_term',
          leaseDurationMs: 30000,
          now: new Date('2026-01-01T00:00:00.000Z')
        });

        expect(acquired).toBeNull();
      }
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('enforces lease ownership for heartbeat and terminal mutations', async () => {
    const created = await createQueuedJob({
      idempotencyKey: 'ownership-1'
    });

    const source = new DatabaseJobSource(integrationDb);
    const now = new Date('2026-01-01T00:00:00.000Z');

    try {
      const acquired = await source.acquireNext({
        workerId: 'worker_owner',
        leaseDurationMs: 30000,
        now
      });

      if (!acquired) {
        throw new Error('Expected job acquisition.');
      }

      const ownerHeartbeat = await source.renewLease({
        tenantId: acquired.tenantId,
        jobId: acquired.id,
        workerId: 'worker_owner',
        leaseDurationMs: 30000,
        now
      });

      expect(ownerHeartbeat).not.toBeNull();

      const nonOwnerHeartbeat = await source.renewLease({
        tenantId: acquired.tenantId,
        jobId: acquired.id,
        workerId: 'worker_other',
        leaseDurationMs: 30000,
        now
      });

      expect(nonOwnerHeartbeat).toBeNull();

      const nonOwnerComplete = await source.markCompleted({
        tenantId: acquired.tenantId,
        jobId: acquired.id,
        workerId: 'worker_other',
        now,
        result: {
          schemaVersion: '1.0',
          sourceVersionId: acquired.sourceVersionId,
          contentHash: 'hash',
          wordCount: 1,
          characterCount: 1,
          paragraphCount: 1,
          lineCount: 1,
          processedAt: now.toISOString()
        }
      });

      expect(nonOwnerComplete).toBeNull();

      const eventsBeforeUnauthorizedWrites = await listJobEvents({
        tenantId: acquired.tenantId,
        jobId: acquired.id
      });

      const nonOwnerStage = await source.markStage({
        tenantId: acquired.tenantId,
        jobId: acquired.id,
        workerId: 'worker_other',
        stage: 'calculating-statistics',
        now
      });

      expect(nonOwnerStage).toBeNull();

      const nonOwnerFail = await source.markFailed({
        tenantId: acquired.tenantId,
        jobId: acquired.id,
        workerId: 'worker_other',
        errorCode: 'WORKER_PERMANENT',
        errorMessage: 'nope',
        now
      });

      expect(nonOwnerFail).toBeNull();

      const afterUnauthorizedWrites = await getJobById({
        tenantId: acquired.tenantId,
        jobId: acquired.id
      });

      expect(afterUnauthorizedWrites?.status).toBe('processing');
      expect(afterUnauthorizedWrites?.currentStage).toBe('normalizing-transcript');
      expect(afterUnauthorizedWrites?.leaseOwner).toBe('worker_owner');

      const eventsAfterUnauthorizedWrites = await listJobEvents({
        tenantId: acquired.tenantId,
        jobId: acquired.id
      });

      expect(eventsAfterUnauthorizedWrites).toHaveLength(eventsBeforeUnauthorizedWrites.length);

      const retry = await source.scheduleRetry({
        tenantId: acquired.tenantId,
        jobId: acquired.id,
        workerId: 'worker_owner',
        errorCode: 'WORKER_RETRYABLE',
        errorMessage: 'retry me',
        nextAttemptAt: new Date(now.getTime() + 1000),
        now
      });

      expect(retry?.status).toBe('retrying');

      const persisted = await getJobById({
        tenantId: acquired.tenantId,
        jobId: acquired.id
      });

      expect(persisted?.leaseOwner).toBeNull();
      expect(persisted?.leaseExpiresAt).toBeNull();
      expect(persisted?.heartbeatAt).toBeNull();
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });
});
