import { describe, expect, it } from 'vitest';

import { environment } from '../../../src/platform/foundation/environment/index.js';

describe('platform environment', () => {
  it('loads the host', () => {
    expect(environment.host.length).toBeGreaterThan(0);
  });

  it('loads the port', () => {
    expect(environment.port).toBeGreaterThan(0);
  });

  it('loads the database URL', () => {
    expect(environment.databaseUrl.startsWith('postgresql://')).toBe(true);
  });

  it('loads the maximum database connections', () => {
    expect(environment.databaseMaxConnections).toBeGreaterThan(0);
  });

  it('loads the SSL flag', () => {
    expect(typeof environment.databaseSsl).toBe('boolean');
  });

  it('defaults NODE_ENV when not provided', () => {
    expect(environment.nodeEnv.length).toBeGreaterThan(0);
  });
});
