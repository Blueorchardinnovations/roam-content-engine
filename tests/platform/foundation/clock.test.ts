import { describe, expect, it } from 'vitest';

import {
  FixedClock,
  SystemClock
} from '../../../src/platform/foundation/clock/index.js';

describe('platform clock', () => {
  it('SystemClock returns the current time', () => {
    const before = Date.now();

    const now = new SystemClock().now();

    const after = Date.now();

    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it('FixedClock always returns the configured instant', () => {
    const fixed = new Date('2026-01-01T12:00:00.000Z');

    const clock = new FixedClock(fixed);

    expect(clock.now()).toEqual(fixed);
    expect(clock.now()).toEqual(fixed);
    expect(clock.now()).toEqual(fixed);
  });

  it('FixedClock returns a defensive copy', () => {
    const fixed = new Date('2026-01-01T12:00:00.000Z');

    const clock = new FixedClock(fixed);

    const first = clock.now();
    first.setUTCFullYear(2035);

    expect(clock.now().getUTCFullYear()).toBe(2026);
  });
});
