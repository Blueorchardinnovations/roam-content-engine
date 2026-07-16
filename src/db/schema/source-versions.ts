import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';

export const sourceVersions = pgTable(
  'source_versions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    contentHash: text('content_hash').notNull(),
    transcriptText: text('transcript_text').notNull(),
    createdAt: timestamp('created_at', {
      withTimezone: true
    })
      .notNull()
      .defaultNow()
  },
  (table) => [
    uniqueIndex('source_versions_tenant_project_version_unique').on(
      table.tenantId,
      table.projectId,
      table.versionNumber
    ),
    uniqueIndex('source_versions_tenant_project_hash_unique').on(
      table.tenantId,
      table.projectId,
      table.contentHash
    ),
    check(
      'source_versions_version_number_positive_check',
      sql`${table.versionNumber} > 0`
    ),
    check(
      'source_versions_transcript_not_empty_check',
      sql`length(trim(${table.transcriptText})) > 0`
    )
  ]
);