import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { dbConfig } from '../../../src/db/config.js';
import { contentJobs } from '../../../src/db/schema/content-jobs.js';
import { jobEvents } from '../../../src/db/schema/job-events.js';
import { sourceVersions } from '../../../src/db/schema/source-versions.js';
import type { CreateContentJobInput } from '../../../src/domain/content-jobs/types.js';
import { DrizzleContentJobRepository } from '../../../src/infrastructure/repositories/drizzle-content-job-repository.js';
import { DrizzleJobEventRepository } from '../../../src/infrastructure/repositories/drizzle-job-event-repository.js';
import { DrizzleSourceVersionRepository } from '../../../src/infrastructure/repositories/drizzle-source-version-repository.js';
import {
  createProjectId,
  createTenantId,
  type PrefixedId
} from '../../../src/platform/identity/ids/index.js';

const integrationPool = new Pool({
  connectionString: dbConfig.url,
  max: Math.max(2, Math.min(dbConfig.maxConnections, 8)),
  ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false
});

const db = drizzle(integrationPool, {
  schema: {
    sourceVersions,
    contentJobs,
    jobEvents
  }
});

export const integrationDb = db;

export const repositories = {
  sourceVersions: new DrizzleSourceVersionRepository(db),
  contentJobs: new DrizzleContentJobRepository(db),
  jobEvents: new DrizzleJobEventRepository(db)
};

export function createTestScope(): {
  tenantId: PrefixedId<'tenant'>;
  projectId: PrefixedId<'project'>;
} {
  return {
    tenantId: createTenantId(),
    projectId: createProjectId()
  };
}

export async function createSourceVersionForTest(input: {
  tenantId: PrefixedId<'tenant'>;
  projectId: PrefixedId<'project'>;
  transcriptText: string;
}) {
  return repositories.sourceVersions.create(input);
}

export async function createContentJobForTest(input: CreateContentJobInput) {
  return repositories.contentJobs.createOrGetIdempotent(input);
}

export async function clearTenantData(
  tenantId: PrefixedId<'tenant'>
): Promise<void> {
  const tenantJobs = await db
    .select({ id: contentJobs.id })
    .from(contentJobs)
    .where(eq(contentJobs.tenantId, tenantId));

  if (tenantJobs.length > 0) {
    await db.delete(jobEvents).where(
      and(
        eq(jobEvents.tenantId, tenantId),
        inArray(
          jobEvents.jobId,
          tenantJobs.map((row) => row.id)
        )
      )
    );
  }

  await db.delete(jobEvents).where(eq(jobEvents.tenantId, tenantId));
  await db.delete(contentJobs).where(eq(contentJobs.tenantId, tenantId));
  await db.delete(sourceVersions).where(eq(sourceVersions.tenantId, tenantId));
}

export async function clearProjectData(input: {
  tenantId: PrefixedId<'tenant'>;
  projectId: PrefixedId<'project'>;
}): Promise<void> {
  await db.delete(jobEvents).where(eq(jobEvents.tenantId, input.tenantId));
  await db.delete(contentJobs).where(
    and(
      eq(contentJobs.tenantId, input.tenantId),
      eq(contentJobs.projectId, input.projectId)
    )
  );
  await db.delete(sourceVersions).where(
    and(
      eq(sourceVersions.tenantId, input.tenantId),
      eq(sourceVersions.projectId, input.projectId)
    )
  );
}

export async function closeIntegrationDatabase(): Promise<void> {
  await integrationPool.end();
}
