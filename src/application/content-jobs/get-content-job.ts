import type { ContentJobRepository } from '../../domain/repositories/content-job-repository.js';
import type {
  ContentJob,
  ContentJobId,
  TenantId
} from '../../domain/content-jobs/types.js';
import { NotFoundError } from '../../platform/shared/errors/index.js';

export class GetContentJob {
  public constructor(
    private readonly contentJobRepository: ContentJobRepository
  ) {}

  public async execute(input: {
    tenantId: TenantId;
    jobId: ContentJobId;
  }): Promise<ContentJob> {
    const job = await this.contentJobRepository.getById(
      input.tenantId,
      input.jobId
    );

    if (!job) {
      throw new NotFoundError('Content job', input.jobId);
    }

    return job;
  }
}
