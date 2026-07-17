import { describe, expect, it } from 'vitest';

import {
  computeTranscriptHash,
  normalizeTranscript
} from '../../../src/platform/security/hashing/index.js';

describe('platform transcript hashing', () => {
  it('produces deterministic hashes', () => {
    const text = 'Grace and peace be with you.';

    expect(computeTranscriptHash(text)).toBe(
      computeTranscriptHash(text)
    );
  });

  it('normalizes line endings before hashing', () => {
    const unix = 'Line 1\nLine 2';
    const windows = 'Line 1\r\nLine 2';

    expect(computeTranscriptHash(unix)).toBe(
      computeTranscriptHash(windows)
    );
  });

  it('normalizes repeated whitespace', () => {
    const first = 'Hello     world';
    const second = 'Hello world';

    expect(computeTranscriptHash(first)).toBe(
      computeTranscriptHash(second)
    );
  });

  it('trims leading and trailing whitespace', () => {
    expect(
      computeTranscriptHash('   Hello world   ')
    ).toBe(
      computeTranscriptHash('Hello world')
    );
  });

  it('produces different hashes for different content', () => {
    expect(
      computeTranscriptHash('Genesis')
    ).not.toBe(
      computeTranscriptHash('Exodus')
    );
  });

  it('returns normalized transcript text', () => {
    expect(
      normalizeTranscript('Hello   \r\n\r\n\r\nWorld')
    ).toBe(
      'Hello \n\nWorld'
    );
  });
});
