import { describe, expect, it } from 'vitest';

import { computeRequestFingerprint } from '../../../src/platform/security/fingerprinting/index.js';

describe('request fingerprinting', () => {
  it('produces deterministic output for identical input', () => {
    const input = {
      tenantId: 'tenant_01JXYZ12345678901234567890',
      projectId: 'project_01JXYZ12345678901234567890',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      jobType: 'transcript-processing',
      requestSchemaVersion: '1.0'
    } as const;

    expect(computeRequestFingerprint(input)).toBe(computeRequestFingerprint(input));
  });

  it('is property-order independent', () => {
    const first = {
      tenantId: 'tenant_01JXYZ12345678901234567890',
      projectId: 'project_01JXYZ12345678901234567890',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      jobType: 'transcript-processing',
      requestSchemaVersion: '1.0'
    };

    const second = {
      requestSchemaVersion: '1.0',
      jobType: 'transcript-processing',
      sourceVersionId: 'srcver_01JXYZ12345678901234567890',
      projectId: 'project_01JXYZ12345678901234567890',
      tenantId: 'tenant_01JXYZ12345678901234567890'
    };

    expect(computeRequestFingerprint(first)).toBe(computeRequestFingerprint(second));
  });

  it('changes when tenant changes', () => {
    const a = computeRequestFingerprint({
      tenantId: 'tenant_01A',
      projectId: 'project_01A',
      sourceVersionId: 'srcver_01A',
      jobType: 'transcript-processing',
      requestSchemaVersion: '1.0'
    });

    const b = computeRequestFingerprint({
      tenantId: 'tenant_01B',
      projectId: 'project_01A',
      sourceVersionId: 'srcver_01A',
      jobType: 'transcript-processing',
      requestSchemaVersion: '1.0'
    });

    expect(a).not.toBe(b);
  });

  it('changes when source version changes', () => {
    const a = computeRequestFingerprint({
      tenantId: 'tenant_01A',
      projectId: 'project_01A',
      sourceVersionId: 'srcver_01A',
      jobType: 'transcript-processing',
      requestSchemaVersion: '1.0'
    });

    const b = computeRequestFingerprint({
      tenantId: 'tenant_01A',
      projectId: 'project_01A',
      sourceVersionId: 'srcver_01B',
      jobType: 'transcript-processing',
      requestSchemaVersion: '1.0'
    });

    expect(a).not.toBe(b);
  });

  it('changes when job type changes', () => {
    const a = computeRequestFingerprint({
      tenantId: 'tenant_01A',
      projectId: 'project_01A',
      sourceVersionId: 'srcver_01A',
      jobType: 'transcript-processing',
      requestSchemaVersion: '1.0'
    });

    const b = computeRequestFingerprint({
      tenantId: 'tenant_01A',
      projectId: 'project_01A',
      sourceVersionId: 'srcver_01A',
      jobType: 'another-job-type',
      requestSchemaVersion: '1.0'
    });

    expect(a).not.toBe(b);
  });
});
