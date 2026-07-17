import { createHash } from 'node:crypto';

export type RequestFingerprintInput = {
  readonly tenantId: string;
  readonly projectId: string;
  readonly sourceVersionId: string;
  readonly jobType: string;
  readonly requestSchemaVersion: string;
};

function canonicalize(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

export function computeRequestFingerprint(
  input: RequestFingerprintInput
): string {
  return createHash('sha256')
    .update(canonicalize(input), 'utf8')
    .digest('hex');
}
