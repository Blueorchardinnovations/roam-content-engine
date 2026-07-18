import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { publishJobEvents } from '../../../src/db/schema/publish-job-events.js';
import { publishJobs } from '../../../src/db/schema/publish-jobs.js';
import { DatabasePublishJobSource } from '../../../src/infrastructure/publish-jobs/index.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';
import {
  clearTenantData,
  createTestScope,
  integrationDb,
  repositories
} from '../support/database.js';
import {
  buildCreatePublishJobInput,
  createCompletedSourceContentJobForPublish
} from '../support/publish-jobs.js';

async function createPublishJobFixture(input?: {
  outputFormat?: 'pdf' | 'epub' | 'html';
  idempotencyKey?: string;
}) {
  const { scope, contentJob } = await createCompletedSourceContentJobForPublish();
  const publishJob = await repositories.publishJobs.createOrGetIdempotent(
    buildCreatePublishJobInput({
      tenantId: scope.tenantId,
      projectId: scope.projectId,
      contentJob,
      idempotencyKey: input?.idempotencyKey ?? 'publish-matrix-idem',
      outputFormat: input?.outputFormat
    })
  );

  return {
    scope,
    contentJob,
    publishJob
  };
}

describe.sequential('publish repository matrix integration', () => {
  it('allows same source artifact for separate output formats and preserves tenant isolation', async () => {
    const fixture = await createPublishJobFixture({ outputFormat: 'pdf', idempotencyKey: 'publish-matrix-a' });
    const otherTenant = await createCompletedSourceContentJobForPublish();

    try {
      const epub = await repositories.publishJobs.createOrGetIdempotent(
        buildCreatePublishJobInput({
          tenantId: fixture.scope.tenantId,
          projectId: fixture.scope.projectId,
          contentJob: fixture.contentJob,
          idempotencyKey: 'publish-matrix-b',
          outputFormat: 'epub'
        })
      );

      expect(epub.id).not.toBe(fixture.publishJob.id);

      const crossTenant = await repositories.publishJobs.createOrGetIdempotent(
        buildCreatePublishJobInput({
          tenantId: otherTenant.scope.tenantId,
          projectId: otherTenant.scope.projectId,
          contentJob: otherTenant.contentJob,
          idempotencyKey: 'publish-matrix-a',
          outputFormat: 'pdf'
        })
      );

      expect(crossTenant.id).not.toBe(fixture.publishJob.id);

      const hidden = await repositories.publishJobs.getById(
        otherTenant.scope.tenantId,
        fixture.publishJob.id
      );

      expect(hidden).toBeNull();
    } finally {
      await clearTenantData(fixture.scope.tenantId);
      await clearTenantData(otherTenant.scope.tenantId);
    }
  });

  it('rejects project mismatch on publish create', async () => {
    const fixture = await createPublishJobFixture({ idempotencyKey: 'publish-project-mismatch' });
    const wrongProject = createTestScope();

    try {
      const baseInput = buildCreatePublishJobInput({
        tenantId: fixture.scope.tenantId,
        projectId: fixture.scope.projectId,
        contentJob: fixture.contentJob,
        idempotencyKey: 'publish-project-mismatch-2'
      });

      await expect(
        repositories.publishJobs.createOrGetIdempotent(
          {
            ...baseInput,
            projectId: wrongProject.projectId
          }
        )
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND
      });
    } finally {
      await clearTenantData(fixture.scope.tenantId);
    }
  });

  it('claims due queued/retrying/waiting jobs and skips future schedules', async () => {
    const source = new DatabasePublishJobSource(integrationDb);
    const now = new Date('2026-01-01T00:00:00.000Z');

    const queued = await createPublishJobFixture({ idempotencyKey: 'publish-claim-queued' });
    const retryingDue = await createPublishJobFixture({ idempotencyKey: 'publish-claim-retrying-due' });
    const waitingDue = await createPublishJobFixture({ idempotencyKey: 'publish-claim-waiting-due' });
    const retryingFuture = await createPublishJobFixture({ idempotencyKey: 'publish-claim-retrying-future' });
    const waitingFuture = await createPublishJobFixture({ idempotencyKey: 'publish-claim-waiting-future' });

    try {
      await integrationDb
        .update(publishJobs)
        .set({ status: 'retrying', nextAttemptAt: new Date('2025-12-31T23:59:59.000Z'), nextPollAt: null })
        .where(and(eq(publishJobs.tenantId, retryingDue.scope.tenantId), eq(publishJobs.id, retryingDue.publishJob.id)));

      await integrationDb
        .update(publishJobs)
        .set({ status: 'waiting', nextAttemptAt: null, nextPollAt: new Date('2025-12-31T23:59:59.000Z') })
        .where(and(eq(publishJobs.tenantId, waitingDue.scope.tenantId), eq(publishJobs.id, waitingDue.publishJob.id)));

      await integrationDb
        .update(publishJobs)
        .set({ status: 'retrying', nextAttemptAt: new Date('2026-01-01T00:10:00.000Z'), nextPollAt: null })
        .where(and(eq(publishJobs.tenantId, retryingFuture.scope.tenantId), eq(publishJobs.id, retryingFuture.publishJob.id)));

      await integrationDb
        .update(publishJobs)
        .set({ status: 'waiting', nextAttemptAt: null, nextPollAt: new Date('2026-01-01T00:10:00.000Z') })
        .where(and(eq(publishJobs.tenantId, waitingFuture.scope.tenantId), eq(publishJobs.id, waitingFuture.publishJob.id)));

      const claims = await Promise.all([
        source.acquireNext({ workerId: 'worker_publish_claim_1', leaseDurationMs: 30_000, now }),
        source.acquireNext({ workerId: 'worker_publish_claim_2', leaseDurationMs: 30_000, now }),
        source.acquireNext({ workerId: 'worker_publish_claim_3', leaseDurationMs: 30_000, now })
      ]);

      const claimedIds = claims.filter((entry) => entry !== null).map((entry) => entry!.publishJobId);
      expect(claimedIds).toContain(queued.publishJob.id);
      expect(claimedIds).toContain(retryingDue.publishJob.id);
      expect(claimedIds).toContain(waitingDue.publishJob.id);
      expect(claimedIds).not.toContain(retryingFuture.publishJob.id);
      expect(claimedIds).not.toContain(waitingFuture.publishJob.id);
    } finally {
      await clearTenantData(queued.scope.tenantId);
      await clearTenantData(retryingDue.scope.tenantId);
      await clearTenantData(waitingDue.scope.tenantId);
      await clearTenantData(retryingFuture.scope.tenantId);
      await clearTenantData(waitingFuture.scope.tenantId);
    }
  });

  it('ensures concurrent workers produce exactly one claim winner for a single job', async () => {
    const fixture = await createPublishJobFixture({ idempotencyKey: 'publish-claim-race' });
    const sourceA = new DatabasePublishJobSource(integrationDb);
    const sourceB = new DatabasePublishJobSource(integrationDb);

    try {
      const [a, b] = await Promise.all([
        sourceA.acquireNext({
          workerId: 'worker_publish_race_a',
          leaseDurationMs: 30_000,
          now: new Date('2026-01-01T00:00:00.000Z')
        }),
        sourceB.acquireNext({
          workerId: 'worker_publish_race_b',
          leaseDurationMs: 30_000,
          now: new Date('2026-01-01T00:00:00.000Z')
        })
      ]);

      const winners = [a, b].filter((entry) => entry !== null);
      expect(winners).toHaveLength(1);
      expect(winners[0]?.publishJobId).toBe(fixture.publishJob.id);
    } finally {
      await clearTenantData(fixture.scope.tenantId);
    }
  });

  it('rejects late mutations from lease-owner mismatch and expired leases', async () => {
    const fixture = await createPublishJobFixture({ idempotencyKey: 'publish-late-mutation' });
    const source = new DatabasePublishJobSource(integrationDb);

    try {
      const claim = await source.acquireNext({
        workerId: 'worker_publish_owner_a',
        leaseDurationMs: 1_000,
        now: new Date('2026-01-01T00:00:00.000Z')
      });

      expect(claim).not.toBeNull();

      const ownerMismatch = await repositories.publishJobs.recordSubmission({
        tenantId: fixture.scope.tenantId,
        publishJobId: fixture.publishJob.id,
        workerId: 'worker_publish_owner_b',
        remoteJobId: 'remote_job_owner_mismatch',
        remoteState: 'accepted',
        remoteCorrelationId: 'remote-corr-owner-mismatch',
        submittedAt: new Date('2026-01-01T00:00:00.500Z'),
        nextPollAt: new Date('2026-01-01T00:00:01.500Z'),
        now: new Date('2026-01-01T00:00:00.500Z')
      });

      expect(ownerMismatch).toBeNull();

      const expired = await repositories.publishJobs.recordSubmission({
        tenantId: fixture.scope.tenantId,
        publishJobId: fixture.publishJob.id,
        workerId: 'worker_publish_owner_a',
        remoteJobId: 'remote_job_expired_lease',
        remoteState: 'accepted',
        remoteCorrelationId: 'remote-corr-expired-lease',
        submittedAt: new Date('2026-01-01T00:00:02.000Z'),
        nextPollAt: new Date('2026-01-01T00:00:03.000Z'),
        now: new Date('2026-01-01T00:00:02.000Z')
      });

      expect(expired).toBeNull();
    } finally {
      await clearTenantData(fixture.scope.tenantId);
    }
  });

  it('clears lease and scheduling fields on waiting, retry, completion, failure, and cancellation transitions', async () => {
    const source = new DatabasePublishJobSource(integrationDb);
    const waitingFixture = await createPublishJobFixture({ idempotencyKey: 'publish-transition-waiting' });
    const retryFixture = await createPublishJobFixture({ idempotencyKey: 'publish-transition-retry' });
    const completeFixture = await createPublishJobFixture({ idempotencyKey: 'publish-transition-complete' });
    const failFixture = await createPublishJobFixture({ idempotencyKey: 'publish-transition-fail' });
    const cancelFixture = await createPublishJobFixture({ idempotencyKey: 'publish-transition-cancel' });

    try {
      const waitingClaim = await source.acquireNext({ workerId: 'worker_wait', leaseDurationMs: 30_000, now: new Date('2026-01-01T00:00:00.000Z') });
      await repositories.publishJobs.recordSubmission({
        tenantId: waitingFixture.scope.tenantId,
        publishJobId: waitingFixture.publishJob.id,
        workerId: 'worker_wait',
        remoteJobId: 'remote_waiting_1',
        remoteState: 'accepted',
        remoteCorrelationId: 'corr_waiting_1',
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
        nextPollAt: new Date('2026-01-01T00:00:01.000Z'),
        now: new Date('2026-01-01T00:00:00.000Z')
      });
      expect(waitingClaim).not.toBeNull();

      const waitingRow = await repositories.publishJobs.getById(waitingFixture.scope.tenantId, waitingFixture.publishJob.id);
      expect(waitingRow?.leaseOwner).toBeNull();
      expect(waitingRow?.leaseExpiresAt).toBeNull();
      expect(waitingRow?.heartbeatAt).toBeNull();

      await source.acquireNext({ workerId: 'worker_retry', leaseDurationMs: 30_000, now: new Date('2026-01-01T00:00:00.000Z') });
      await repositories.publishJobs.recordRetry({
        tenantId: retryFixture.scope.tenantId,
        publishJobId: retryFixture.publishJob.id,
        workerId: 'worker_retry',
        errorCode: 'ERR_RETRY',
        errorMessage: 'retry me',
        nextAttemptAt: new Date('2026-01-01T00:00:10.000Z'),
        now: new Date('2026-01-01T00:00:01.000Z')
      });
      const retryRow = await repositories.publishJobs.getById(retryFixture.scope.tenantId, retryFixture.publishJob.id);
      expect(retryRow?.leaseOwner).toBeNull();
      expect(retryRow?.nextPollAt).toBeNull();

      await source.acquireNext({ workerId: 'worker_complete', leaseDurationMs: 30_000, now: new Date('2026-01-01T00:00:00.000Z') });
      await repositories.publishJobs.complete({
        tenantId: completeFixture.scope.tenantId,
        publishJobId: completeFixture.publishJob.id,
        workerId: 'worker_complete',
        remoteState: 'succeeded',
        remoteCorrelationId: 'corr_complete',
        lastPolledAt: new Date('2026-01-01T00:00:01.000Z'),
        downloadMetadata: {
          fileName: 'guide.pdf',
          mimeType: 'application/pdf'
        },
        now: new Date('2026-01-01T00:00:02.000Z')
      });
      const completeRow = await repositories.publishJobs.getById(completeFixture.scope.tenantId, completeFixture.publishJob.id);
      expect(completeRow?.nextAttemptAt).toBeNull();
      expect(completeRow?.nextPollAt).toBeNull();

      await source.acquireNext({ workerId: 'worker_fail', leaseDurationMs: 30_000, now: new Date('2026-01-01T00:00:00.000Z') });
      await repositories.publishJobs.fail({
        tenantId: failFixture.scope.tenantId,
        publishJobId: failFixture.publishJob.id,
        workerId: 'worker_fail',
        errorCode: 'ERR_FAIL',
        errorMessage: 'failed',
        now: new Date('2026-01-01T00:00:02.000Z')
      });
      const failRow = await repositories.publishJobs.getById(failFixture.scope.tenantId, failFixture.publishJob.id);
      expect(failRow?.nextAttemptAt).toBeNull();
      expect(failRow?.nextPollAt).toBeNull();

      await repositories.publishJobs.cancel({
        tenantId: cancelFixture.scope.tenantId,
        publishJobId: cancelFixture.publishJob.id,
        now: new Date('2026-01-01T00:00:02.000Z')
      });
      const cancelRow = await repositories.publishJobs.getById(cancelFixture.scope.tenantId, cancelFixture.publishJob.id);
      expect(cancelRow?.nextAttemptAt).toBeNull();
      expect(cancelRow?.nextPollAt).toBeNull();
    } finally {
      await clearTenantData(waitingFixture.scope.tenantId);
      await clearTenantData(retryFixture.scope.tenantId);
      await clearTenantData(completeFixture.scope.tenantId);
      await clearTenantData(failFixture.scope.tenantId);
      await clearTenantData(cancelFixture.scope.tenantId);
    }
  });

  it('writes exactly one terminal event per terminal transition and does not reclaim terminal jobs', async () => {
    const source = new DatabasePublishJobSource(integrationDb);
    const completed = await createPublishJobFixture({ idempotencyKey: 'publish-terminal-complete' });
    const failed = await createPublishJobFixture({ idempotencyKey: 'publish-terminal-fail' });
    const cancelled = await createPublishJobFixture({ idempotencyKey: 'publish-terminal-cancel' });

    try {
      await source.acquireNext({ workerId: 'worker_terminal_complete', leaseDurationMs: 30_000, now: new Date('2026-01-01T00:00:00.000Z') });
      await repositories.publishJobs.complete({
        tenantId: completed.scope.tenantId,
        publishJobId: completed.publishJob.id,
        workerId: 'worker_terminal_complete',
        remoteState: 'succeeded',
        remoteCorrelationId: 'corr_terminal_complete',
        downloadMetadata: { fileName: 'complete.pdf', mimeType: 'application/pdf' },
        now: new Date('2026-01-01T00:00:01.000Z')
      });
      await repositories.publishJobs.complete({
        tenantId: completed.scope.tenantId,
        publishJobId: completed.publishJob.id,
        workerId: 'worker_terminal_complete',
        remoteState: 'succeeded',
        remoteCorrelationId: 'corr_terminal_complete',
        downloadMetadata: { fileName: 'complete.pdf', mimeType: 'application/pdf' },
        now: new Date('2026-01-01T00:00:02.000Z')
      });

      await source.acquireNext({ workerId: 'worker_terminal_fail', leaseDurationMs: 30_000, now: new Date('2026-01-01T00:00:00.000Z') });
      await repositories.publishJobs.fail({
        tenantId: failed.scope.tenantId,
        publishJobId: failed.publishJob.id,
        workerId: 'worker_terminal_fail',
        errorCode: 'ERR_TERMINAL_FAIL',
        errorMessage: 'terminal fail',
        now: new Date('2026-01-01T00:00:01.000Z')
      });

      await repositories.publishJobs.cancel({
        tenantId: cancelled.scope.tenantId,
        publishJobId: cancelled.publishJob.id,
        now: new Date('2026-01-01T00:00:01.000Z')
      });
      await expect(
        repositories.publishJobs.cancel({
          tenantId: cancelled.scope.tenantId,
          publishJobId: cancelled.publishJob.id,
          now: new Date('2026-01-01T00:00:02.000Z')
        })
      ).rejects.toMatchObject({ code: ErrorCode.PUBLISH_JOB_INVALID_STATE });

      const completedEvents = await integrationDb
        .select()
        .from(publishJobEvents)
        .where(and(eq(publishJobEvents.tenantId, completed.scope.tenantId), eq(publishJobEvents.publishJobId, completed.publishJob.id), eq(publishJobEvents.eventType, 'publish-completed')));
      const failedEvents = await integrationDb
        .select()
        .from(publishJobEvents)
        .where(and(eq(publishJobEvents.tenantId, failed.scope.tenantId), eq(publishJobEvents.publishJobId, failed.publishJob.id), eq(publishJobEvents.eventType, 'publish-failed')));
      const cancelledEvents = await integrationDb
        .select()
        .from(publishJobEvents)
        .where(and(eq(publishJobEvents.tenantId, cancelled.scope.tenantId), eq(publishJobEvents.publishJobId, cancelled.publishJob.id), eq(publishJobEvents.eventType, 'publish-cancelled')));

      expect(completedEvents).toHaveLength(1);
      expect(failedEvents).toHaveLength(1);
      expect(cancelledEvents).toHaveLength(1);

      const reclaimCompleted = await source.acquireNext({ workerId: 'worker_reclaim_completed', leaseDurationMs: 30_000, now: new Date('2026-01-01T00:00:03.000Z') });
      const terminalIds = new Set([completed.publishJob.id, failed.publishJob.id, cancelled.publishJob.id]);
      expect(reclaimCompleted === null || !terminalIds.has(reclaimCompleted.publishJobId)).toBe(true);
    } finally {
      await clearTenantData(completed.scope.tenantId);
      await clearTenantData(failed.scope.tenantId);
      await clearTenantData(cancelled.scope.tenantId);
    }
  });

  it('stale recovery handles pre-submission and post-submission states without duplicate lease-expired events', async () => {
    const preSubmission = await createPublishJobFixture({ idempotencyKey: 'publish-stale-pre-submission' });
    const postSubmission = await createPublishJobFixture({ idempotencyKey: 'publish-stale-post-submission' });
    const threshold = await createPublishJobFixture({ idempotencyKey: 'publish-stale-threshold' });
    const source = new DatabasePublishJobSource(integrationDb);

    try {
      await source.acquireNext({ workerId: 'worker_stale_pre', leaseDurationMs: 500, now: new Date('2026-01-01T00:00:00.000Z') });

      await source.acquireNext({ workerId: 'worker_stale_post', leaseDurationMs: 500, now: new Date('2026-01-01T00:00:00.000Z') });
      await repositories.publishJobs.recordSubmission({
        tenantId: postSubmission.scope.tenantId,
        publishJobId: postSubmission.publishJob.id,
        workerId: 'worker_stale_post',
        remoteJobId: 'remote_stale_post',
        remoteState: 'accepted',
        remoteCorrelationId: 'corr_stale_post',
        submittedAt: new Date('2026-01-01T00:00:00.100Z'),
        nextPollAt: new Date('2026-01-01T00:00:01.100Z'),
        now: new Date('2026-01-01T00:00:00.100Z')
      });

      await source.acquireNext({ workerId: 'worker_stale_post_reclaim', leaseDurationMs: 500, now: new Date('2026-01-01T00:00:01.100Z') });

      await source.acquireNext({ workerId: 'worker_stale_threshold', leaseDurationMs: 500, now: new Date('2026-01-01T00:00:00.000Z') });
      await integrationDb
        .update(publishJobs)
        .set({ consecutiveFailureCount: 2 })
        .where(and(eq(publishJobs.tenantId, threshold.scope.tenantId), eq(publishJobs.id, threshold.publishJob.id)));

      const firstRecovery = await repositories.publishJobs.recoverStaleLeases({
        now: new Date('2026-01-01T00:00:05.000Z'),
        maxConsecutiveFailures: 3,
        retryDelayMs: 5_000,
        limit: 50
      });
      const secondRecovery = await repositories.publishJobs.recoverStaleLeases({
        now: new Date('2026-01-01T00:00:06.000Z'),
        maxConsecutiveFailures: 3,
        retryDelayMs: 5_000,
        limit: 50
      });

      expect(firstRecovery).toBeGreaterThanOrEqual(2);
      expect(secondRecovery).toBe(0);

      const preRow = await repositories.publishJobs.getById(preSubmission.scope.tenantId, preSubmission.publishJob.id);
      const postRow = await repositories.publishJobs.getById(postSubmission.scope.tenantId, postSubmission.publishJob.id);
      const thresholdRow = await repositories.publishJobs.getById(threshold.scope.tenantId, threshold.publishJob.id);

      expect(preRow?.status).toBe('retrying');
      expect(postRow?.status).toBe('waiting');
      expect(thresholdRow?.status).toBe('failed');
      expect(thresholdRow?.remoteErrorCode).toBe(ErrorCode.PUBLISH_JOB_RETRY_EXHAUSTED);

      const staleEvents = await integrationDb
        .select()
        .from(publishJobEvents)
        .where(and(eq(publishJobEvents.tenantId, preSubmission.scope.tenantId), eq(publishJobEvents.publishJobId, preSubmission.publishJob.id), eq(publishJobEvents.eventType, 'publish-lease-expired')));

      expect(staleEvents).toHaveLength(1);
    } finally {
      await clearTenantData(preSubmission.scope.tenantId);
      await clearTenantData(postSubmission.scope.tenantId);
      await clearTenantData(threshold.scope.tenantId);
    }
  });

  it('rejects late write after lease replacement', async () => {
    const fixture = await createPublishJobFixture({ idempotencyKey: 'publish-late-write-replaced' });
    const source = new DatabasePublishJobSource(integrationDb);

    try {
      const firstClaim = await source.acquireNext({
        workerId: 'worker_late_write_a',
        leaseDurationMs: 1_000,
        now: new Date('2026-01-01T00:00:00.000Z')
      });
      expect(firstClaim).not.toBeNull();

      await repositories.publishJobs.recoverStaleLeases({
        now: new Date('2026-01-01T00:00:02.000Z'),
        maxConsecutiveFailures: 3,
        retryDelayMs: 1_000,
        limit: 10
      });

      const secondClaim = await source.acquireNext({
        workerId: 'worker_late_write_b',
        leaseDurationMs: 30_000,
        now: new Date('2026-01-01T00:00:03.100Z')
      });
      expect(secondClaim).not.toBeNull();

      const late = await repositories.publishJobs.recordSubmission({
        tenantId: fixture.scope.tenantId,
        publishJobId: fixture.publishJob.id,
        workerId: 'worker_late_write_a',
        remoteJobId: 'remote_job_late_write',
        remoteState: 'accepted',
        remoteCorrelationId: 'corr_late_write',
        submittedAt: new Date('2026-01-01T00:00:02.100Z'),
        nextPollAt: new Date('2026-01-01T00:00:03.100Z'),
        now: new Date('2026-01-01T00:00:02.100Z')
      });

      expect(late).toBeNull();
    } finally {
      await clearTenantData(fixture.scope.tenantId);
    }
  });
});
