import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StaleJobRecovery } from '../../../src/application/workers/stale-job-recovery.js';
import { DatabaseJobSource } from '../../../src/infrastructure/workers/database-job-source.js';

import {
  clearWorkerScope,
  clearAllWorkerData,
  createQueuedJob,
  getJobById,
  integrationDb,
  listJobEvents,
  setJobFields
} from './support.js';

describe.sequential('stale processing recovery integration', () => {
  beforeEach(async () => {
    await clearAllWorkerData();
  });

  it('moves expired processing lease to retrying when attempts remain', async () => {
    const created = await createQueuedJob({ idempotencyKey: 'stale-retry-1' });
    const source = new DatabaseJobSource(integrationDb);
    const now = new Date('2026-01-01T00:00:00.000Z');

    try {
      const acquired = await source.acquireNext({
        workerId: 'worker_stale_1',
        leaseDurationMs: 1000,
        now
      });

      if (!acquired) {
        throw new Error('Expected job acquisition.');
      }

      await setJobFields({
        tenantId: acquired.tenantId,
        jobId: acquired.id,
        values: {
          leaseExpiresAt: new Date('2025-12-31T23:59:00.000Z')
        }
      });

      const recovery = new StaleJobRecovery(
        source,
        () => now,
        5,
        {
          baseDelayMs: 1000,
          maxDelayMs: 60000,
          maxAttempts: 5
        },
        {
          info: vi.fn(),
          warn: vi.fn()
        }
      );

      const recoveredCount = await recovery.runOnce(5000);
      expect(recoveredCount).toBeGreaterThan(0);

      const persisted = await getJobById({
        tenantId: acquired.tenantId,
        jobId: acquired.id
      });

      expect(persisted?.status).toBe('retrying');
      expect(persisted?.result).toBeNull();
      expect(persisted?.leaseOwner).toBeNull();
      expect(persisted?.leaseExpiresAt).toBeNull();
      expect(persisted?.nextAttemptAt).not.toBeNull();

      const events = await listJobEvents({
        tenantId: acquired.tenantId,
        jobId: acquired.id
      });

      expect(events.some((event) => event.eventType === 'job-lease-expired')).toBe(true);
      expect(events.some((event) => event.eventType === 'job-retry-scheduled')).toBe(false);
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('moves expired processing lease to failed when attempts are exhausted', async () => {
    const created = await createQueuedJob({ idempotencyKey: 'stale-fail-1' });
    const source = new DatabaseJobSource(integrationDb);
    const now = new Date('2026-01-01T00:00:00.000Z');

    try {
      const acquired = await source.acquireNext({
        workerId: 'worker_stale_2',
        leaseDurationMs: 1000,
        now
      });

      if (!acquired) {
        throw new Error('Expected job acquisition.');
      }

      await setJobFields({
        tenantId: acquired.tenantId,
        jobId: acquired.id,
        values: {
          attemptCount: 5,
          leaseExpiresAt: new Date('2025-12-31T23:59:00.000Z')
        }
      });

      const recovery = new StaleJobRecovery(
        source,
        () => now,
        5,
        {
          baseDelayMs: 1000,
          maxDelayMs: 60000,
          maxAttempts: 5
        },
        {
          info: vi.fn(),
          warn: vi.fn()
        }
      );

      const recoveredCount = await recovery.runOnce();
      expect(recoveredCount).toBe(1);

      const persisted = await getJobById({
        tenantId: acquired.tenantId,
        jobId: acquired.id
      });

      expect(persisted?.status).toBe('failed');
      expect(persisted?.result).toBeNull();
      expect(persisted?.completedAt).not.toBeNull();
      expect(persisted?.leaseOwner).toBeNull();

      const events = await listJobEvents({
        tenantId: acquired.tenantId,
        jobId: acquired.id
      });

      const leaseExpiredEvents = events.filter((event) => event.eventType === 'job-lease-expired');
      expect(leaseExpiredEvents).toHaveLength(1);
      expect(leaseExpiredEvents[0]?.newStatus).toBe('failed');
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });

  it('does not recover active processing leases and avoids double recovery races', async () => {
    const created = await createQueuedJob({ idempotencyKey: 'stale-active-1' });
    const sourceA = new DatabaseJobSource(integrationDb);
    const sourceB = new DatabaseJobSource(integrationDb);
    const now = new Date('2026-01-01T00:00:00.000Z');

    try {
      const acquired = await sourceA.acquireNext({
        workerId: 'worker_active_1',
        leaseDurationMs: 30000,
        now
      });

      if (!acquired) {
        throw new Error('Expected job acquisition.');
      }

      const recoveryA = new StaleJobRecovery(
        sourceA,
        () => now,
        5,
        {
          baseDelayMs: 1000,
          maxDelayMs: 60000,
          maxAttempts: 5
        },
        {
          info: vi.fn(),
          warn: vi.fn()
        }
      );

      const activeRecovered = await recoveryA.runOnce();
      expect(activeRecovered).toBe(0);

      await setJobFields({
        tenantId: acquired.tenantId,
        jobId: acquired.id,
        values: {
          leaseExpiresAt: new Date('2025-12-31T23:59:00.000Z')
        }
      });

      const recoveryB = new StaleJobRecovery(
        sourceB,
        () => now,
        5,
        {
          baseDelayMs: 1000,
          maxDelayMs: 60000,
          maxAttempts: 5
        },
        {
          info: vi.fn(),
          warn: vi.fn()
        }
      );

      const [one, two] = await Promise.all([
        recoveryA.runOnce(),
        recoveryB.runOnce()
      ]);

      expect(one + two).toBe(1);

      const events = await listJobEvents({
        tenantId: acquired.tenantId,
        jobId: acquired.id
      });

      expect(events.filter((event) => event.eventType === 'job-lease-expired')).toHaveLength(1);
    } finally {
      await clearWorkerScope(created.scope.tenantId);
    }
  });
});
