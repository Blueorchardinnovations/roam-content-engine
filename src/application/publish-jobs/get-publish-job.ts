import type { PublishJobRepository } from '../../domain/repositories/publish-job-repository.js';
import type {
  PublishJob,
  PublishJobId,
  TenantId
} from '../../domain/publish-jobs/types.js';
import { NotFoundError } from '../../platform/shared/errors/index.js';

export class GetPublishJob {
  public constructor(
    private readonly publishJobRepository: PublishJobRepository
  ) {}

  public async execute(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
  }): Promise<PublishJob> {
    const job = await this.publishJobRepository.getById(
      input.tenantId,
      input.publishJobId
    );

    if (!job) {
      throw new NotFoundError('Publish job', input.publishJobId);
    }

    return job;
  }
}
