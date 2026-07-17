import type { ContentJobRepository } from '../../domain/repositories/content-job-repository.js';
import type {
  ContentJob,
  CorrelationId,
  ProjectId,
  SourceVersionId,
  TenantId
} from '../../domain/content-jobs/types.js';

export type CreateContentJobCommand = {
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  readonly sourceVersionId: SourceVersionId;
  readonly idempotencyKey: string;
  readonly correlationId: CorrelationId;
  readonly jobType: 'transcript-processing';
  readonly requestSchemaVersion: '1.0';
};

export class CreateContentJob {
  public constructor(
    private readonly contentJobRepository: ContentJobRepository
  ) {}

  public execute(
    command: CreateContentJobCommand
  ): Promise<ContentJob> {
    return this.contentJobRepository.createOrGetIdempotent({
      tenantId: command.tenantId,
      projectId: command.projectId,
      sourceVersionId: command.sourceVersionId,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
      jobType: command.jobType,
      requestSchemaVersion: command.requestSchemaVersion
    });
  }
}
