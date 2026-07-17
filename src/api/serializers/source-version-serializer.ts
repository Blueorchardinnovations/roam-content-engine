import type { SourceVersion } from '../../domain/source-versions/types.js';

export type SourceVersionDto = {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly versionNumber: number;
  readonly contentHash: string;
  readonly createdAt: string;
};

export function toSourceVersionDto(
  sourceVersion: SourceVersion
): SourceVersionDto {
  return {
    id: sourceVersion.id,
    tenantId: sourceVersion.tenantId,
    projectId: sourceVersion.projectId,
    versionNumber: sourceVersion.versionNumber,
    contentHash: sourceVersion.contentHash,
    createdAt: sourceVersion.createdAt.toISOString()
  };
}
