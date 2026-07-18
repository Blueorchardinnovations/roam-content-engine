import { describe, expect, it } from 'vitest';

import { publicationCssPackager } from '../../../src/application/themes/index.js';

const KNOWN_BLOCK_IDENTITIES = [
  'reflection',
  'call-to-action',
  'prayer',
  'journal-prompt',
  'sidebar',
  'key-takeaway',
  'warning',
  'highlight',
  'scripture'
] as const;

const KNOWN_PUBLICATION_SELECTORS = [
  '.publication',
  '.publication-main',
  '.publication-section',
  '.publication-heading',
  '.publication-paragraph',
  '.publication-navigation',
  '.publication-list',
  '.publication-table',
  '.publication-figure',
  '.publication-caption',
  '.publication-block',
  '.publication-reflection',
  '.publication-prayer',
  '.publication-journal-prompt',
  '.publication-call-to-action',
  '.publication-scripture',
  '.publication-sidebar',
  '.publication-key-takeaway',
  '.publication-highlight',
  '.publication-warning'
] as const;

describe('theme selector coverage', () => {
  it('covers every controlled semantic class emitted by serializer hooks', () => {
    const css = publicationCssPackager.package({
      themeId: 'ministry',
      densityId: 'standard',
      layoutId: 'single-column'
    });

    for (const selector of KNOWN_PUBLICATION_SELECTORS) {
      expect(css).toContain(selector);
    }
  });

  it('covers every publication block identity and references no unknown block identities', () => {
    const css = publicationCssPackager.package({
      themeId: 'modern',
      densityId: 'compact',
      layoutId: 'single-column'
    });

    for (const block of KNOWN_BLOCK_IDENTITIES) {
      expect(css).toContain(`[data-publication-block="${block}"]`);
    }

    const found = [...css.matchAll(/\[data-publication-block="([a-z-]+)"\]/g)].map((match) => match[1]);

    for (const block of found) {
      expect(KNOWN_BLOCK_IDENTITIES).toContain(block as (typeof KNOWN_BLOCK_IDENTITIES)[number]);
    }
  });

  it('does not depend on arbitrary generated classes or positional selectors', () => {
    const css = publicationCssPackager.package({
      themeId: 'classic',
      densityId: 'standard',
      layoutId: 'single-column'
    });

    const classMatches = [...css.matchAll(/\.class-[a-z0-9-]+/g)].map((match) => match[0]);
    const allowedClassHooks = new Set(['.class-toc']);

    for (const match of classMatches) {
      expect(allowedClassHooks.has(match)).toBe(true);
    }

    const nthChildMatches = [...css.matchAll(/:nth-child\([^)]*\)/g)].map((match) => match[0]);
    const allowedNthChild = new Set([':nth-child(even)']);

    for (const match of nthChildMatches) {
      expect(allowedNthChild.has(match)).toBe(true);
    }

    expect(css).not.toContain(':nth-of-type(');
  });
});
