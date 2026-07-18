import type { PublishJobRepository } from '../../domain/repositories/publish-job-repository.js';
import type {
  PublishJob,
  PublishJobId,
  TenantId
} from '../../domain/publish-jobs/types.js';

export class CancelPublishJob {
  public constructor(
    private readonly publishJobRepository: PublishJobRepository
  ) {}

  public execute(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
  }): Promise<PublishJob> {
    return this.publishJobRepository.cancel({
      tenantId: input.tenantId,
      publishJobId: input.publishJobId,
      now: new Date()
    });
  }
}
