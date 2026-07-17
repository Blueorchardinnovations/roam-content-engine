import type { ContentJobRepository } from '../../domain/repositories/content-job-repository.js';
import type {
  ContentJob,
  ContentJobId,
  TenantId
} from '../../domain/content-jobs/types.js';

export class CancelContentJob {
  public constructor(
    private readonly contentJobRepository: ContentJobRepository
  ) {}

  public execute(input: {
    tenantId: TenantId;
    jobId: ContentJobId;
  }): Promise<ContentJob> {
    return this.contentJobRepository.cancel(
      input.tenantId,
      input.jobId
    );
  }
}
