import { and, eq } from 'drizzle-orm';

import { contentJobs } from '../../../src/db/schema/content-jobs.js';
import { jobEvents } from '../../../src/db/schema/job-events.js';
import { sourceVersions } from '../../../src/db/schema/source-versions.js';
import {
  createContentJobForTest,
  createSourceVersionForTest,
  createTestScope,
  clearTenantData,
  integrationDb,
  repositories
} from '../support/database.js';
import type { PrefixedId } from '../../../src/platform/identity/ids/index.js';

export async function createQueuedJob(input?: {
  transcriptText?: string;
  idempotencyKey?: string;
}) {
  const scope = createTestScope();

  const source = await createSourceVersionForTest({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    transcriptText: input?.transcriptText ?? 'Worker transcript'
  });

  const job = await createContentJobForTest({
    tenantId: scope.tenantId,
    projectId: scope.projectId,
    sourceVersionId: source.id,
    idempotencyKey: input?.idempotencyKey ?? 'worker-idem',
    jobType: 'transcript-processing',
    requestSchemaVersion: '1.0'
  });

  return {
    scope,
    source,
    job
  };
}

export async function getJobById(input: {
  tenantId: string;
  jobId: string;
}) {
  return integrationDb.query.contentJobs.findFirst({
    where: and(
      eq(contentJobs.tenantId, input.tenantId),
      eq(contentJobs.id, input.jobId)
    )
  });
}

export async function setJobFields(input: {
  tenantId: string;
  jobId: string;
  values: Partial<typeof contentJobs.$inferInsert>;
}) {
  await integrationDb
    .update(contentJobs)
    .set(input.values)
    .where(
      and(
        eq(contentJobs.tenantId, input.tenantId),
        eq(contentJobs.id, input.jobId)
      )
    );
}

export async function listJobEvents(input: {
  tenantId: PrefixedId<'tenant'>;
  jobId: PrefixedId<'job'>;
}) {
  return repositories.jobEvents.listByJob(input.tenantId, input.jobId);
}

export async function clearWorkerScope(tenantId: PrefixedId<'tenant'>) {
  await clearTenantData(tenantId);
}

export async function clearAllWorkerData() {
  await integrationDb.delete(jobEvents);
  await integrationDb.delete(contentJobs);
  await integrationDb.delete(sourceVersions);
}

export { createTestScope, repositories, integrationDb, contentJobs, jobEvents };
