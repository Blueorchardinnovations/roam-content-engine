import { describe, expect, it } from 'vitest';

import {
  PublicationCssPackager,
  publicationDensityIds,
  publicationLayoutIds,
  publicationThemeIds,
  UnknownDensityError,
  UnknownLayoutError,
  UnknownThemeError
} from '../../../src/application/themes/index.js';

function createPackager(): PublicationCssPackager {
  return new PublicationCssPackager();
}

describe('publication css packager', () => {
  it('produces css for each supported theme, density, and layout', () => {
    const packager = createPackager();

    for (const themeId of publicationThemeIds) {
      const css = packager.package({
        themeId,
        densityId: 'standard',
        layoutId: 'single-column'
      });

      expect(css.length).toBeGreaterThan(0);
      expect(css).toContain('/* layer:preset-');
    }

    for (const densityId of publicationDensityIds) {
      const css = packager.package({
        themeId: 'classic',
        densityId,
        layoutId: 'single-column'
      });

      expect(css).toContain(`/* layer:density-${densityId} */`);
    }

    for (const layoutId of publicationLayoutIds) {
      const css = packager.package({
        themeId: 'classic',
        densityId: 'standard',
        layoutId
      });

      expect(css).toContain(`/* layer:layout-${layoutId} */`);
    }
  });

  it('uses required deterministic layer order', () => {
    const packager = createPackager();
    const css = packager.package({
      themeId: 'classic',
      densityId: 'standard',
      layoutId: 'single-column'
    });

    const expectedMarkers = [
      '/* layer:tokens-primitives */',
      '/* layer:tokens-semantic */',
      '/* layer:tokens-components */',
      '/* layer:base-reset */',
      '/* layer:base-document */',
      '/* layer:base-typography */',
      '/* layer:base-accessibility */',
      '/* layer:base-utilities */',
      '/* layer:layout-single-column */',
      '/* layer:component-publication */',
      '/* layer:component-headings */',
      '/* layer:component-paragraphs */',
      '/* layer:component-blockquotes */',
      '/* layer:component-lists */',
      '/* layer:component-tables */',
      '/* layer:component-figures */',
      '/* layer:component-navigation */',
      '/* layer:component-dividers */',
      '/* layer:component-reflection */',
      '/* layer:component-prayer */',
      '/* layer:component-journal-prompt */',
      '/* layer:component-call-to-action */',
      '/* layer:component-scripture */',
      '/* layer:component-sidebar */',
      '/* layer:component-key-takeaway */',
      '/* layer:component-highlight */',
      '/* layer:component-warning */',
      '/* layer:density-standard */',
      '/* layer:preset-classic */'
    ];

    let previousIndex = -1;

    for (const marker of expectedMarkers) {
      const markerIndex = css.indexOf(marker);
      expect(markerIndex).toBeGreaterThan(previousIndex);
      previousIndex = markerIndex;
    }
  });

  it('is deterministic and input-immutable', () => {
    const packager = createPackager();
    const request = {
      themeId: 'ministry' as const,
      densityId: 'compact' as const,
      layoutId: 'single-column' as const
    };

    const one = packager.package(request);
    const two = packager.package(request);

    expect(one).toBe(two);
    expect(request).toEqual({
      themeId: 'ministry',
      densityId: 'compact',
      layoutId: 'single-column'
    });
  });

  it('changes output when theme, density, or layout changes', () => {
    const packager = createPackager();

    const baseline = packager.package({
      themeId: 'classic',
      densityId: 'standard',
      layoutId: 'single-column'
    });

    expect(packager.package({
      themeId: 'modern',
      densityId: 'standard',
      layoutId: 'single-column'
    })).not.toBe(baseline);

    expect(packager.package({
      themeId: 'classic',
      densityId: 'compact',
      layoutId: 'single-column'
    })).not.toBe(baseline);

    expect(packager.package({
      themeId: 'classic',
      densityId: 'standard',
      layoutId: 'two-column'
    })).not.toBe(baseline);
  });

  it('rejects unknown ids with controlled errors', () => {
    const packager = createPackager();

    expect(() => packager.package({
      themeId: 'unknown' as never,
      densityId: 'standard',
      layoutId: 'single-column'
    })).toThrow(UnknownThemeError);

    expect(() => packager.package({
      themeId: 'classic',
      densityId: 'unknown' as never,
      layoutId: 'single-column'
    })).toThrow(UnknownDensityError);

    expect(() => packager.package({
      themeId: 'classic',
      densityId: 'standard',
      layoutId: 'unknown' as never
    })).toThrow(UnknownLayoutError);
  });

  it('uses LF newlines, no timestamps/random ids, and no @page rules', () => {
    const packager = createPackager();
    const css = packager.package({
      themeId: 'dark',
      densityId: 'high-density',
      layoutId: 'wide-content'
    });

    expect(css.includes('\r')).toBe(false);
    expect(css).not.toContain('Date.now');
    expect(css).not.toContain('new Date');
    expect(css).not.toContain('Math.random');
    expect(css).not.toContain('randomUUID');
    expect(css).not.toContain('@page');

    expect(css).toContain('--pub-color-text');
    expect(css).toContain('--pub-color-background');
    expect(css).toContain('.publication-reflection');
    expect(css).toContain('.publication-warning');
  });
});
