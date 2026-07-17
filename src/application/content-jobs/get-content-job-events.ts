import type { JobEvent } from '../../domain/job-events/types.js';
import type { ContentJobRepository } from '../../domain/repositories/content-job-repository.js';
import type { JobEventRepository } from '../../domain/repositories/job-event-repository.js';
import type {
  ContentJobId,
  TenantId
} from '../../domain/content-jobs/types.js';
import { NotFoundError } from '../../platform/shared/errors/index.js';

export class GetContentJobEvents {
  public constructor(
    private readonly contentJobRepository: ContentJobRepository,
    private readonly jobEventRepository: JobEventRepository
  ) {}

  public async execute(input: {
    tenantId: TenantId;
    jobId: ContentJobId;
  }): Promise<readonly JobEvent[]> {
    const job = await this.contentJobRepository.getById(
      input.tenantId,
      input.jobId
    );

    if (!job) {
      throw new NotFoundError('Content job', input.jobId);
    }

    return this.jobEventRepository.listByJob(
      input.tenantId,
      input.jobId
    );
  }
}
