import type { PrefixedId } from '../../platform/identity/ids/index.js';

export type SourceVersionId = PrefixedId<'srcver'>;
export type TenantId = PrefixedId<'tenant'>;
export type ProjectId = PrefixedId<'project'>;

export type SourceVersion = {
  readonly id: SourceVersionId;
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  readonly versionNumber: number;
  readonly contentHash: string;
  readonly transcriptText: string;
  readonly createdAt: Date;
};

export type CreateSourceVersionInput = {
  readonly tenantId: TenantId;
  readonly projectId: ProjectId;
  readonly transcriptText: string;
};
