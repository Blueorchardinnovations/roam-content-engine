import type { TenantId } from '../../domain/content-jobs/types.js';
import type { WorkerId, WorkerJobSource, WorkerLeasedJob } from '../../domain/workers/worker-types.js';

export interface WorkerHeartbeatStore {
  renewLease(input: {
    tenantId: TenantId;
    jobId: WorkerLeasedJob['id'];
    workerId: WorkerId;
    leaseDurationMs: number;
    now: Date;
  }): Promise<WorkerLeasedJob | null>;
}

export class DatabaseWorkerHeartbeatStore implements WorkerHeartbeatStore {
  public constructor(
    private readonly jobSource: WorkerJobSource
  ) {}

  public renewLease(input: {
    tenantId: TenantId;
    jobId: WorkerLeasedJob['id'];
    workerId: WorkerId;
    leaseDurationMs: number;
    now: Date;
  }): Promise<WorkerLeasedJob | null> {
    return this.jobSource.renewLease(input);
  }
}
