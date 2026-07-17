import { describe, expect, it } from 'vitest';

import {
  assertTransitionAllowed,
  isTransitionAllowed
} from '../../../src/domain/content-jobs/transitions.js';
import { ErrorCode } from '../../../src/platform/shared/errors/codes.js';

describe('content job transitions', () => {
  it('allows all expected transitions', () => {
    const allowed: ReadonlyArray<readonly [string, string]> = [
      ['queued', 'processing'],
      ['retrying', 'processing'],
      ['processing', 'completed'],
      ['processing', 'retrying'],
      ['processing', 'failed'],
      ['queued', 'cancelled'],
      ['retrying', 'cancelled']
    ];

    for (const [from, to] of allowed) {
      expect(isTransitionAllowed(from as never, to as never)).toBe(true);
      expect(() => assertTransitionAllowed(from as never, to as never)).not.toThrow();
    }
  });

  it('rejects forbidden transitions with INVALID_WORKFLOW_STATE', () => {
    const forbidden: ReadonlyArray<readonly [string, string]> = [
      ['queued', 'completed'],
      ['queued', 'failed'],
      ['retrying', 'completed'],
      ['processing', 'cancelled'],
      ['failed', 'processing'],
      ['cancelled', 'processing'],
      ['failed', 'completed']
    ];

    for (const [from, to] of forbidden) {
      let thrown = false;
      try {
        assertTransitionAllowed(from as never, to as never);
      } catch (error) {
        thrown = true;
        expect(error).toMatchObject({
          code: ErrorCode.INVALID_WORKFLOW_STATE
        });
      }

      expect(thrown).toBe(true);
    }
  });

  it('rejects transitions out of completed with JOB_ALREADY_COMPLETED', () => {
    let thrown = false;
    try {
      assertTransitionAllowed('completed', 'failed');
    } catch (error) {
      thrown = true;
      expect(error).toMatchObject({
        code: ErrorCode.JOB_ALREADY_COMPLETED
      });
    }

    expect(thrown).toBe(true);
  });
});
