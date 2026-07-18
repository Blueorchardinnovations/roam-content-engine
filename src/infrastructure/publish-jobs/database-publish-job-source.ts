import { and, eq, gt, lte, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type * as schema from '../../db/schema/index.js';
import { publishJobEvents } from '../../db/schema/publish-job-events.js';
import { publishJobs } from '../../db/schema/publish-jobs.js';
import type {
  ClaimedPublishJob,
  PublishJobSource
} from '../../domain/publish-jobs/publish-worker-types.js';
import type {
  PublishJobId,
  TenantId
} from '../../domain/publish-jobs/types.js';
import { createPublishJobEventId } from '../../platform/identity/ids/index.js';

import { toDatabaseUnavailableError } from '../repositories/error-utils.js';

type Database = NodePgDatabase<typeof schema>;

type CandidateRow = {
  id: string;
  tenantId: string;
  status: typeof publishJobs.$inferSelect.status;
};

export class DatabasePublishJobSource implements PublishJobSource {
  public constructor(private readonly database: Database) {}

  public async acquireNext(input: {
    workerId: string;
    leaseDurationMs: number;
    now: Date;
  }): Promise<ClaimedPublishJob | null> {
    try {
      return await this.database.transaction(async (tx) => {
        const candidateQuery = await tx.execute(sql<CandidateRow>`
          select id, tenant_id as "tenantId", status
          from publish_jobs
          where (
            status = 'queued'
            or (
              status = 'retrying'
              and next_attempt_at is not null
              and next_attempt_at <= ${input.now}
            )
            or (
              status = 'waiting'
              and next_poll_at is not null
              and next_poll_at <= ${input.now}
            )
          )
          and (lease_expires_at is null or lease_expires_at <= ${input.now})
          order by coalesce(next_attempt_at, next_poll_at, created_at) asc, created_at asc
          for update skip locked
          limit 1
        `);

        const candidate = candidateQuery.rows[0] as CandidateRow | undefined;

        if (!candidate) {
          return null;
        }

        const leaseExpiresAt = new Date(input.now.getTime() + input.leaseDurationMs);

        const updatedRows = await tx
          .update(publishJobs)
          .set({
            status: 'processing',
            leaseOwner: input.workerId,
            leaseExpiresAt,
            heartbeatAt: input.now,
            attemptCount: sql`${publishJobs.attemptCount} + 1`,
            updatedAt: input.now
          })
          .where(
            and(
              eq(publishJobs.id, candidate.id as PublishJobId),
              eq(publishJobs.tenantId, candidate.tenantId as TenantId),
              sql`${publishJobs.status} = ${candidate.status}`,
              or(
                sql`${publishJobs.leaseExpiresAt} is null`,
                lte(publishJobs.leaseExpiresAt, input.now)
              )
            )
          )
          .returning({
            id: publishJobs.id,
            tenantId: publishJobs.tenantId,
            status: publishJobs.status,
            leaseExpiresAt: publishJobs.leaseExpiresAt
          });

        const updated = updatedRows[0];
        if (!updated || !updated.leaseExpiresAt) {
          return null;
        }

        const claimEvent: typeof publishJobEvents.$inferInsert = {
          id: createPublishJobEventId(),
          tenantId: updated.tenantId,
          publishJobId: updated.id,
          eventType: 'publish-job-claimed',
          priorStatus: candidate.status as typeof publishJobEvents.$inferInsert.priorStatus,
          newStatus: updated.status,
          details: {
            workerId: input.workerId,
            leaseExpiresAt: updated.leaseExpiresAt.toISOString()
          },
          createdAt: input.now
        };

        await tx.insert(publishJobEvents).values(claimEvent);

        return {
          tenantId: updated.tenantId as TenantId,
          publishJobId: updated.id as PublishJobId,
          workerId: input.workerId,
          leaseExpiresAt: updated.leaseExpiresAt
        };
      });
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to acquire next publish job.');
    }
  }

  public async renewLease(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    leaseDurationMs: number;
    now: Date;
  }): Promise<ClaimedPublishJob | null> {
    try {
      const rows = await this.database
        .update(publishJobs)
        .set({
          leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
          heartbeatAt: input.now,
          updatedAt: input.now
        })
        .where(
          and(
            eq(publishJobs.id, input.publishJobId),
            eq(publishJobs.tenantId, input.tenantId),
            eq(publishJobs.status, 'processing'),
            eq(publishJobs.leaseOwner, input.workerId),
            gt(publishJobs.leaseExpiresAt, input.now)
          )
        )
        .returning({
          id: publishJobs.id,
          tenantId: publishJobs.tenantId,
          leaseExpiresAt: publishJobs.leaseExpiresAt
        });

      const renewed = rows[0];
      if (!renewed || !renewed.leaseExpiresAt) {
        return null;
      }

      return {
        tenantId: renewed.tenantId as TenantId,
        publishJobId: renewed.id as PublishJobId,
        workerId: input.workerId,
        leaseExpiresAt: renewed.leaseExpiresAt
      };
    } catch (error) {
      throw toDatabaseUnavailableError(error, 'Unable to renew publish job lease.');
    }
  }
}
