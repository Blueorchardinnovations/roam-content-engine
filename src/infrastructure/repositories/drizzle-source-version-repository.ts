import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type * as schema from '../../db/schema/index.js';
import { sourceVersions } from '../../db/schema/source-versions.js';
import type { SourceVersionRepository } from '../../domain/repositories/source-version-repository.js';
import type {
  CreateSourceVersionInput,
  ProjectId,
  SourceVersion,
  SourceVersionId,
  TenantId
} from '../../domain/source-versions/types.js';
import {
  createSourceVersionId,
  isPrefixedId
} from '../../platform/identity/ids/index.js';
import {
  computeTranscriptHash,
  normalizeTranscript
} from '../../platform/security/hashing/index.js';
import { ValidationError } from '../../platform/shared/errors/index.js';

import {
  isUniqueViolation,
  toDatabaseUnavailableError
} from './error-utils.js';

type SourceVersionRow = typeof sourceVersions.$inferSelect;
type Database = NodePgDatabase<typeof schema>;

function mapSourceVersion(row: SourceVersionRow): SourceVersion {
  return {
    id: row.id as SourceVersionId,
    tenantId: row.tenantId as TenantId,
    projectId: row.projectId as ProjectId,
    versionNumber: row.versionNumber,
    contentHash: row.contentHash,
    transcriptText: row.transcriptText,
    createdAt: row.createdAt
  };
}

function validateScopedIds(
  tenantId: TenantId,
  projectId?: ProjectId
): void {
  if (!isPrefixedId(tenantId, 'tenant')) {
    throw new ValidationError('Invalid tenant ID.', {
      tenantId
    });
  }

  if (projectId !== undefined && !isPrefixedId(projectId, 'project')) {
    throw new ValidationError('Invalid project ID.', {
      projectId
    });
  }
}

export class DrizzleSourceVersionRepository
  implements SourceVersionRepository {
  public constructor(
    private readonly database: Database
  ) {}

  public createImmutable(
    input: CreateSourceVersionInput
  ): Promise<SourceVersion> {
    return this.create(input);
  }

  public async create(
    input: CreateSourceVersionInput
  ): Promise<SourceVersion> {
    validateScopedIds(input.tenantId, input.projectId);

    const normalizedTranscript = normalizeTranscript(input.transcriptText);

    if (normalizedTranscript.length === 0) {
      throw new ValidationError('Transcript cannot be empty after normalization.');
    }

    const contentHash = computeTranscriptHash(normalizedTranscript);

    try {
      return await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${input.tenantId}), hashtext(${input.projectId}))`
        );

        const existingByHash = await tx.query.sourceVersions.findFirst({
          where: and(
            eq(sourceVersions.tenantId, input.tenantId),
            eq(sourceVersions.projectId, input.projectId),
            eq(sourceVersions.contentHash, contentHash)
          )
        });

        if (existingByHash) {
          return mapSourceVersion(existingByHash);
        }

        const latest = await tx
          .select({ versionNumber: sourceVersions.versionNumber })
          .from(sourceVersions)
          .where(
            and(
              eq(sourceVersions.tenantId, input.tenantId),
              eq(sourceVersions.projectId, input.projectId)
            )
          )
          .orderBy(desc(sourceVersions.versionNumber))
          .limit(1);

        const nextVersionNumber = (latest[0]?.versionNumber ?? 0) + 1;

        const inserted = await tx
          .insert(sourceVersions)
          .values({
            id: createSourceVersionId(),
            tenantId: input.tenantId,
            projectId: input.projectId,
            versionNumber: nextVersionNumber,
            contentHash,
            transcriptText: normalizedTranscript
          })
          .returning();

        return mapSourceVersion(inserted[0]!);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existingByHash = await this.findByHash(
          input.tenantId,
          input.projectId,
          contentHash
        );

        if (existingByHash) {
          return existingByHash;
        }
      }

      throw toDatabaseUnavailableError(
        error,
        'Unable to create source version.'
      );
    }
  }

  public async getById(
    tenantId: TenantId,
    sourceVersionId: SourceVersionId
  ): Promise<SourceVersion | null> {
    validateScopedIds(tenantId);

    try {
      const row = await this.database.query.sourceVersions.findFirst({
        where: and(
          eq(sourceVersions.tenantId, tenantId),
          eq(sourceVersions.id, sourceVersionId)
        )
      });

      return row ? mapSourceVersion(row) : null;
    } catch (error) {
      throw toDatabaseUnavailableError(
        error,
        'Unable to read source version.'
      );
    }
  }

  public async findByHash(
    tenantId: TenantId,
    projectId: ProjectId,
    contentHash: string
  ): Promise<SourceVersion | null> {
    validateScopedIds(tenantId, projectId);

    try {
      const row = await this.database.query.sourceVersions.findFirst({
        where: and(
          eq(sourceVersions.tenantId, tenantId),
          eq(sourceVersions.projectId, projectId),
          eq(sourceVersions.contentHash, contentHash)
        )
      });

      return row ? mapSourceVersion(row) : null;
    } catch (error) {
      throw toDatabaseUnavailableError(
        error,
        'Unable to query source versions by hash.'
      );
    }
  }

  public async listByProject(
    tenantId: TenantId,
    projectId: ProjectId
  ): Promise<readonly SourceVersion[]> {
    validateScopedIds(tenantId, projectId);

    try {
      const rows = await this.database
        .select()
        .from(sourceVersions)
        .where(
          and(
            eq(sourceVersions.tenantId, tenantId),
            eq(sourceVersions.projectId, projectId)
          )
        )
        .orderBy(asc(sourceVersions.versionNumber));

      return rows.map(mapSourceVersion);
    } catch (error) {
      throw toDatabaseUnavailableError(
        error,
        'Unable to list source versions.'
      );
    }
  }
}
