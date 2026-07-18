import { describe, expect, it } from 'vitest';

import { publicationCssPackager } from '../../../src/application/themes/index.js';

const REQUIRED_SEMANTIC_TOKENS = [
  '--pub-color-text',
  '--pub-color-text-muted',
  '--pub-color-background',
  '--pub-color-surface',
  '--pub-color-border',
  '--pub-color-accent',
  '--pub-color-focus',
  '--pub-font-body',
  '--pub-font-heading',
  '--pub-line-height-body',
  '--pub-content-max-width'
] as const;

const REQUIRED_COMPONENT_TOKENS = [
  '--pub-callout-padding',
  '--pub-callout-border-width',
  '--pub-reflection-accent',
  '--pub-prayer-accent',
  '--pub-journal-prompt-accent',
  '--pub-scripture-accent',
  '--pub-table-cell-padding',
  '--pub-caption-font-size',
  '--pub-navigation-gap'
] as const;

function collectDefinedTokens(css: string): Set<string> {
  const tokenNames = [...css.matchAll(/(--pub-[a-z0-9-]+)\s*:/g)].map((match) => match[1]);
  return new Set(tokenNames);
}

describe('theme token validation', () => {
  it('resolves var(--pub-*) references and defines required semantic/component tokens', () => {
    const css = publicationCssPackager.package({
      themeId: 'classic',
      densityId: 'standard',
      layoutId: 'single-column'
    });

    const defined = collectDefinedTokens(css);

    const referenced = [...css.matchAll(/var\((--pub-[a-z0-9-]+)\)/g)].map((match) => match[1]);
    for (const token of referenced) {
      expect(defined.has(token)).toBe(true);
    }

    for (const token of REQUIRED_SEMANTIC_TOKENS) {
      expect(defined.has(token)).toBe(true);
    }

    for (const token of REQUIRED_COMPONENT_TOKENS) {
      expect(defined.has(token)).toBe(true);
    }
  });

  it('uses token overrides in presets rather than duplicating component selectors', () => {
    const css = publicationCssPackager.package({
      themeId: 'magazine',
      densityId: 'standard',
      layoutId: 'single-column'
    });

    const presetSection = css.slice(css.indexOf('/* layer:preset-magazine */'));

    expect(presetSection).toContain('--pub-color-background');
    expect(presetSection).not.toContain('.publication-reflection');
    expect(presetSection).not.toContain('.publication-warning');
  });

  it('limits repeated hardcoded color/spacing/radius values outside token and preset layers', () => {
    const css = publicationCssPackager.package({
      themeId: 'classic',
      densityId: 'standard',
      layoutId: 'single-column'
    });

    const nonTokenLayers = css
      .split('/* layer:')
      .slice(1)
      .map((section) => `/* layer:${section}`)
      .filter((section) => !section.startsWith('/* layer:tokens-'))
      .filter((section) => !section.startsWith('/* layer:preset-'));

    const combined = nonTokenLayers.join('\n');

    expect(combined).not.toMatch(/#[0-9a-fA-F]{3,8}/);

    const remValues = [...combined.matchAll(/\b\d+(?:\.\d+)?rem\b/g)].map((match) => match[0]);
    const allowedRemLiterals = new Set(['60rem']);

    for (const remValue of remValues) {
      expect(allowedRemLiterals.has(remValue)).toBe(true);
    }
  });
});
