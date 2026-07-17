import { describe, expect, it } from 'vitest';

import {
  createContentJobId,
  createCorrelationId,
  createJobEventId,
  createProjectId,
  createSourceVersionId,
  createTenantId,
  isPrefixedId
} from '../../../src/platform/identity/ids/index.js';

describe('platform identity IDs', () => {
  it('creates source-version IDs with the srcver prefix', () => {
    const id = createSourceVersionId();

    expect(id).toMatch(/^srcver_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(isPrefixedId(id, 'srcver')).toBe(true);
  });

  it('creates content-job IDs with the job prefix', () => {
    const id = createContentJobId();

    expect(id).toMatch(/^job_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(isPrefixedId(id, 'job')).toBe(true);
  });

  it('creates job-event IDs with the evt prefix', () => {
    const id = createJobEventId();

    expect(id).toMatch(/^evt_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('creates correlation IDs with the corr prefix', () => {
    const id = createCorrelationId();

    expect(id).toMatch(/^corr_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('creates tenant and project IDs with the correct prefixes', () => {
    expect(createTenantId()).toMatch(/^tenant_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(createProjectId()).toMatch(/^project_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('creates unique IDs', () => {
    const ids = new Set(
      Array.from({ length: 100 }, () => createContentJobId())
    );

    expect(ids.size).toBe(100);
  });

  it('rejects an ID when the prefix does not match', () => {
    const id = createContentJobId();

    expect(isPrefixedId(id, 'job')).toBe(true);
    expect(isPrefixedId(id, 'srcver')).toBe(false);
  });

  it('rejects empty suffixes', () => {
    expect(isPrefixedId('job_', 'job')).toBe(false);
  });
});
