import type {
  CreatePublishJobInput,
  PublishDownloadMetadata,
  PublishJob,
  PublishJobEvent,
  PublishJobId,
  PublishJobStage,
  TenantId
} from '../publish-jobs/types.js';

export interface PublishJobRepository {
  createOrGetIdempotent(input: CreatePublishJobInput): Promise<PublishJob>;

  getById(tenantId: TenantId, publishJobId: PublishJobId): Promise<PublishJob | null>;

  listEvents(tenantId: TenantId, publishJobId: PublishJobId): Promise<readonly PublishJobEvent[]>;

  claimNextDue(input: {
    workerId: string;
    leaseDurationMs: number;
    now: Date;
  }): Promise<PublishJob | null>;

  heartbeat(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    leaseDurationMs: number;
    now: Date;
  }): Promise<PublishJob | null>;

  setStage(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    stage: PublishJobStage;
    now: Date;
  }): Promise<PublishJob | null>;

  recordSubmission(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    remoteJobId: string;
    remoteState: string;
    remoteCorrelationId: string | null;
    submittedAt: Date;
    nextPollAt: Date;
    now: Date;
  }): Promise<PublishJob | null>;

  recordRemoteWaiting(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    remoteState: string;
    remoteCorrelationId: string | null;
    lastPolledAt: Date;
    nextPollAt: Date;
    now: Date;
  }): Promise<PublishJob | null>;

  recordRetry(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    errorCode: string;
    errorMessage: string;
    nextAttemptAt: Date;
    now: Date;
  }): Promise<PublishJob | null>;

  complete(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    remoteState: string;
    remoteCorrelationId: string | null;
    lastPolledAt?: Date;
    downloadMetadata: PublishDownloadMetadata;
    now: Date;
  }): Promise<PublishJob | null>;

  fail(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    errorCode: string;
    errorMessage: string;
    remoteState?: string;
    remoteCorrelationId?: string;
    lastPolledAt?: Date;
    now: Date;
  }): Promise<PublishJob | null>;

  markRemoteCancelled(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: string;
    remoteState: string;
    remoteCorrelationId?: string;
    lastPolledAt?: Date;
    now: Date;
  }): Promise<PublishJob | null>;

  cancel(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    now: Date;
  }): Promise<PublishJob>;

  recoverStaleLeases(input: {
    now: Date;
    maxConsecutiveFailures: number;
    retryDelayMs: number;
    limit: number;
  }): Promise<number>;
}
