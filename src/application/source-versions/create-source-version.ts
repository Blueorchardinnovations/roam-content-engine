import type { SourceVersionRepository } from '../../domain/repositories/source-version-repository.js';
import type {
  ProjectId,
  SourceVersion,
  TenantId
} from '../../domain/source-versions/types.js';

export type CreateSourceVersionCommand = {
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  readonly transcriptText: string;
};

export class CreateSourceVersion {
  public constructor(
    private readonly sourceVersionRepository: SourceVersionRepository
  ) {}

  public execute(
    command: CreateSourceVersionCommand
  ): Promise<SourceVersion> {
    return this.sourceVersionRepository.createImmutable({
      tenantId: command.tenantId,
      projectId: command.projectId,
      transcriptText: command.transcriptText
    });
  }
}
