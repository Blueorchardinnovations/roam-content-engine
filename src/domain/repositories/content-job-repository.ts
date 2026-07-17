import type {
  ContentJob,
  ContentJobId,
  ContentJobStage,
  CreateContentJobInput,
  TenantId,
  TranscriptProcessingResult
} from '../content-jobs/types.js';

export interface ContentJobRepository {
  createOrGetIdempotent(input: CreateContentJobInput): Promise<ContentJob>;

  getById(
    tenantId: TenantId,
    jobId: ContentJobId
  ): Promise<ContentJob | null>;

  getByIdempotencyKey(
    tenantId: TenantId,
    idempotencyKey: string
  ): Promise<ContentJob | null>;

  claim(
    tenantId: TenantId,
    jobId: ContentJobId
  ): Promise<ContentJob>;

  markStage(
    tenantId: TenantId,
    jobId: ContentJobId,
    stage: ContentJobStage
  ): Promise<ContentJob>;

  complete(
    tenantId: TenantId,
    jobId: ContentJobId,
    result: TranscriptProcessingResult
  ): Promise<ContentJob>;

  scheduleRetry(
    tenantId: TenantId,
    jobId: ContentJobId,
    errorCode: string,
    errorMessage: string
  ): Promise<ContentJob>;

  fail(
    tenantId: TenantId,
    jobId: ContentJobId,
    errorCode: string,
    errorMessage: string
  ): Promise<ContentJob>;

  cancel(
    tenantId: TenantId,
    jobId: ContentJobId
  ): Promise<ContentJob>;
}
