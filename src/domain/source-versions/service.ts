import type { SourceVersionRepository } from '../repositories/source-version-repository.js';

import type {
  CreateSourceVersionInput,
  ProjectId,
  SourceVersion,
  SourceVersionId,
  TenantId
} from './types.js';

export class SourceVersionService {
  public constructor(
    private readonly sourceVersionRepository: SourceVersionRepository
  ) {}

  public create(
    input: CreateSourceVersionInput
  ): Promise<SourceVersion> {
    return this.sourceVersionRepository.create(input);
  }

  public getById(
    tenantId: TenantId,
    sourceVersionId: SourceVersionId
  ): Promise<SourceVersion | null> {
    return this.sourceVersionRepository.getById(tenantId, sourceVersionId);
  }

  public listByProject(
    tenantId: TenantId,
    projectId: ProjectId
  ): Promise<readonly SourceVersion[]> {
    return this.sourceVersionRepository.listByProject(tenantId, projectId);
  }
}
