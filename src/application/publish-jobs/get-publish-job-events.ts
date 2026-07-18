import type { PublishJobEvent, PublishJobId, TenantId } from '../../domain/publish-jobs/types.js';
import type { PublishJobRepository } from '../../domain/repositories/publish-job-repository.js';
import { NotFoundError } from '../../platform/shared/errors/index.js';

export class GetPublishJobEvents {
  public constructor(
    private readonly publishJobRepository: PublishJobRepository
  ) {}

  public async execute(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
  }): Promise<readonly PublishJobEvent[]> {
    const job = await this.publishJobRepository.getById(
      input.tenantId,
      input.publishJobId
    );

    if (!job) {
      throw new NotFoundError('Publish job', input.publishJobId);
    }

    return this.publishJobRepository.listEvents(
      input.tenantId,
      input.publishJobId
    );
  }
}
