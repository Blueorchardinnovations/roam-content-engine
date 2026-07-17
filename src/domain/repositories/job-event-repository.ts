import type {
  CreateJobEventInput,
  JobEvent
} from '../job-events/types.js';
import type {
  ContentJobId,
  TenantId
} from '../content-jobs/types.js';

export interface JobEventRepository {
  append(event: CreateJobEventInput): Promise<JobEvent>;

  listByJob(
    tenantId: TenantId,
    jobId: ContentJobId
  ): Promise<readonly JobEvent[]>;
}
