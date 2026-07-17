import type { SourceVersionRepository } from '../../domain/repositories/source-version-repository.js';
import type {
  SourceVersion,
  SourceVersionId,
  TenantId
} from '../../domain/source-versions/types.js';
import { NotFoundError } from '../../platform/shared/errors/index.js';

export class GetSourceVersion {
  public constructor(
    private readonly sourceVersionRepository: SourceVersionRepository
  ) {}

  public async execute(input: {
    tenantId: TenantId;
    sourceVersionId: SourceVersionId;
  }): Promise<SourceVersion> {
    const sourceVersion = await this.sourceVersionRepository.getById(
      input.tenantId,
      input.sourceVersionId
    );

    if (!sourceVersion) {
      throw new NotFoundError('Source version', input.sourceVersionId);
    }

    return sourceVersion;
  }
}
