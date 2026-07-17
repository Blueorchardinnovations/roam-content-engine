import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type * as schema from '../../db/schema/index.js';
import { jobEvents } from '../../db/schema/job-events.js';
import type { JobEventRepository } from '../../domain/repositories/job-event-repository.js';
import type {
  ContentJobId,
  TenantId
} from '../../domain/content-jobs/types.js';
import type {
  CreateJobEventInput,
  JobEvent
} from '../../domain/job-events/types.js';

import { toDatabaseUnavailableError } from './error-utils.js';

type JobEventRow = typeof jobEvents.$inferSelect;
type Database = NodePgDatabase<typeof schema>;

function mapJobEvent(row: JobEventRow): JobEvent {
  return {
    id: row.id as JobEvent['id'],
    tenantId: row.tenantId as JobEvent['tenantId'],
    jobId: row.jobId as JobEvent['jobId'],
    eventType: row.eventType,
    priorStatus: row.priorStatus,
    newStatus: row.newStatus,
    details: (row.details as JobEvent['details']) ?? null,
    createdAt: row.createdAt
  };
}

export class DrizzleJobEventRepository
  implements JobEventRepository {
  public constructor(
    private readonly database: Database
  ) {}

  public async append(
    event: CreateJobEventInput
  ): Promise<JobEvent> {
    try {
      const inserted = await this.database
        .insert(jobEvents)
        .values({
          id: event.id,
          tenantId: event.tenantId,
          jobId: event.jobId,
          eventType: event.eventType,
          priorStatus: event.priorStatus,
          newStatus: event.newStatus,
          details: event.details ?? null,
          createdAt: event.createdAt ?? new Date()
        })
        .returning();

      return mapJobEvent(inserted[0]!);
    } catch (error) {
      throw toDatabaseUnavailableError(
        error,
        'Unable to append job event.'
      );
    }
  }

  public async listByJob(
    tenantId: TenantId,
    jobId: ContentJobId
  ): Promise<readonly JobEvent[]> {
    try {
      const rows = await this.database
        .select()
        .from(jobEvents)
        .where(
          and(
            eq(jobEvents.tenantId, tenantId),
            eq(jobEvents.jobId, jobId)
          )
        )
        .orderBy(asc(jobEvents.createdAt));

      return rows.map(mapJobEvent);
    } catch (error) {
      throw toDatabaseUnavailableError(
        error,
        'Unable to list job events.'
      );
    }
  }
}
