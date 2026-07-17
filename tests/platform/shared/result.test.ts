import { describe, expect, it } from 'vitest';

import {
  failure,
  isFailure,
  isSuccess,
  success
} from '../../../src/platform/shared/result/index.js';

describe('platform Result type', () => {
  it('creates a success result', () => {
    const result = success('ready');

    expect(result).toEqual({
      ok: true,
      value: 'ready'
    });
    expect(isSuccess(result)).toBe(true);
    expect(isFailure(result)).toBe(false);
  });

  it('creates a failure result', () => {
    const error = new Error('failed');
    const result = failure(error);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(error);
    expect(isFailure(result)).toBe(true);
    expect(isSuccess(result)).toBe(false);
  });

  it('narrows success values safely', () => {
    const result = success({
      status: 'completed'
    });

    if (!isSuccess(result)) {
      throw new Error('Expected success result.');
    }

    expect(result.value.status).toBe('completed');
  });

  it('narrows failure values safely', () => {
    const result = failure({
      code: 'INVALID_STATE'
    });

    if (!isFailure(result)) {
      throw new Error('Expected failure result.');
    }

    expect(result.error.code).toBe('INVALID_STATE');
  });
});
