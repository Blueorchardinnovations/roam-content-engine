import { describe, expect, it } from 'vitest';

import { publicationCssPackager } from '../../../src/application/themes/index.js';

describe('theme accessibility safeguards', () => {
  it('does not globally remove outlines and includes focus-visible styling', () => {
    const css = publicationCssPackager.package({
      themeId: 'classic',
      densityId: 'standard',
      layoutId: 'single-column'
    });

    expect(css).not.toContain('outline: none');
    expect(css).not.toContain('outline: 0');
    expect(css).toContain(':focus-visible');
  });

  it('keeps responsive image rules and avoids fixed-height text callouts', () => {
    const css = publicationCssPackager.package({
      themeId: 'modern',
      densityId: 'standard',
      layoutId: 'wide-content'
    });

    expect(css).toContain('max-width: 100%');
    expect(css).toContain('height: auto');

    const calloutSections = [
      '.publication-reflection',
      '.publication-prayer',
      '.publication-journal-prompt',
      '.publication-call-to-action',
      '.publication-scripture',
      '.publication-sidebar',
      '.publication-key-takeaway',
      '.publication-highlight',
      '.publication-warning'
    ];

    for (const selector of calloutSections) {
      const selectorIndex = css.indexOf(selector);
      expect(selectorIndex).toBeGreaterThan(-1);

      const snippet = css.slice(selectorIndex, selectorIndex + 250);
      expect(snippet).not.toContain('height:');
      expect(snippet).not.toContain('overflow: hidden');
    }
  });

  it('defines readable dark theme foreground/background aliases and color scheme', () => {
    const css = publicationCssPackager.package({
      themeId: 'dark',
      densityId: 'standard',
      layoutId: 'single-column'
    });

    const darkSection = css.slice(css.indexOf('/* layer:preset-dark */'));

    expect(darkSection).toContain('color-scheme: dark');
    expect(darkSection).toContain('--pub-color-background');
    expect(darkSection).toContain('--pub-color-text');
    expect(darkSection).toContain('--pub-color-focus');
    expect(darkSection).toContain('--pub-warning-accent');
    expect(darkSection).toContain('--pub-highlight-accent');

    expect(darkSection).not.toContain('--pub-color-background: #ffffff');
  });
});
