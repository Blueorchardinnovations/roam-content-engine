import type {
  ContentJob,
  ContentJobId,
  ContentJobStage,
  ContentJobStatus,
  TenantId
} from '../content-jobs/types.js';

export type WorkerId = string;

export type WorkerLeasedJob = ContentJob & {
  readonly leaseOwner: WorkerId;
  readonly leaseExpiresAt: Date;
  readonly heartbeatAt: Date;
  readonly nextAttemptAt: Date | null;
};

export type WorkerConfig = {
  readonly workerId: WorkerId;
  readonly pollIntervalMs: number;
  readonly leaseDurationMs: number;
  readonly heartbeatIntervalMs: number;
  readonly maxAttempts: number;
  readonly concurrency: number;
  readonly shutdownTimeoutMs: number;
  readonly staleRecoveryIntervalMs: number;
};

export type WorkerRuntimeState = {
  started: boolean;
  stopping: boolean;
  stopped: boolean;
  lastSuccessfulPollAt: Date | null;
  activeJobCount: number;
  lastStaleRecoveryRunAt: Date | null;
};

export type WorkerJobSource = {
  acquireNext(input: {
    workerId: WorkerId;
    leaseDurationMs: number;
    now: Date;
  }): Promise<WorkerLeasedJob | null>;

  renewLease(input: {
    tenantId: TenantId;
    jobId: ContentJobId;
    workerId: WorkerId;
    leaseDurationMs: number;
    now: Date;
  }): Promise<WorkerLeasedJob | null>;

  markStage(input: {
    tenantId: TenantId;
    jobId: ContentJobId;
    workerId: WorkerId;
    stage: ContentJobStage;
    now: Date;
  }): Promise<WorkerLeasedJob | null>;

  markCompleted(input: {
    tenantId: TenantId;
    jobId: ContentJobId;
    workerId: WorkerId;
    result: ContentJob['result'];
    now: Date;
  }): Promise<ContentJob | null>;

  scheduleRetry(input: {
    tenantId: TenantId;
    jobId: ContentJobId;
    workerId: WorkerId;
    errorCode: string;
    errorMessage: string;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<ContentJob | null>;

  markFailed(input: {
    tenantId: TenantId;
    jobId: ContentJobId;
    workerId: WorkerId;
    errorCode: string;
    errorMessage: string;
    now: Date;
  }): Promise<ContentJob | null>;

  listStaleProcessingJobs(input: {
    now: Date;
    limit: number;
  }): Promise<readonly WorkerLeasedJob[]>;

  recoverStaleJob(input: {
    tenantId: TenantId;
    jobId: ContentJobId;
    maxAttempts: number;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<ContentJob | null>;
};
