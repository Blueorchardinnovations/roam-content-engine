import type {
  CreateSourceVersionInput,
  ProjectId,
  SourceVersion,
  SourceVersionId,
  TenantId
} from '../source-versions/types.js';

export interface SourceVersionRepository {
  createImmutable(
    input: CreateSourceVersionInput
  ): Promise<SourceVersion>;

  create(input: CreateSourceVersionInput): Promise<SourceVersion>;

  getById(
    tenantId: TenantId,
    sourceVersionId: SourceVersionId
  ): Promise<SourceVersion | null>;

  findByHash(
    tenantId: TenantId,
    projectId: ProjectId,
    contentHash: string
  ): Promise<SourceVersion | null>;

  listByProject(
    tenantId: TenantId,
    projectId: ProjectId
  ): Promise<readonly SourceVersion[]>;
}
