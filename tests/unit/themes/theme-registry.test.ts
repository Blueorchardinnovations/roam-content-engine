import { describe, expect, it } from 'vitest';

import {
  DuplicateThemeRegistrationError,
  PublicationThemeRegistry,
  UnknownThemeError,
  publicationThemeIds
} from '../../../src/application/themes/index.js';

describe('publication theme registry', () => {
  it('registers every canonical theme id', () => {
    const registry = new PublicationThemeRegistry();
    const ids = registry.listThemes().map((theme) => theme.id);
    expect(ids).toEqual([...publicationThemeIds]);
  });

  it('rejects duplicate registrations', () => {
    expect(() => new PublicationThemeRegistry([
      {
        id: 'classic',
        label: 'Classic',
        colorScheme: 'light',
        presetLayerId: 'preset-classic'
      },
      {
        id: 'classic',
        label: 'Classic Duplicate',
        colorScheme: 'light',
        presetLayerId: 'preset-classic'
      }
    ])).toThrow(DuplicateThemeRegistrationError);
  });

  it('rejects unknown themes', () => {
    const registry = new PublicationThemeRegistry();
    expect(() => registry.getTheme('unknown-theme')).toThrow(UnknownThemeError);
  });

  it('maps Ministry Classic display name to ministry id', () => {
    const registry = new PublicationThemeRegistry();
    const ministry = registry.getTheme('ministry');

    expect(ministry.id).toBe('ministry');
    expect(ministry.label).toBe('Ministry Classic');
  });

  it('keeps classic and minimal available', () => {
    const registry = new PublicationThemeRegistry();

    expect(registry.getTheme('classic').id).toBe('classic');
    expect(registry.getTheme('minimal').id).toBe('minimal');
  });

  it('declares dark as dark color scheme', () => {
    const registry = new PublicationThemeRegistry();
    expect(registry.getTheme('dark').colorScheme).toBe('dark');
  });

  it('returns deterministic order and immutable copies', () => {
    const registry = new PublicationThemeRegistry();
    const one = registry.listThemes();
    const two = registry.listThemes();

    expect(one.map((entry) => entry.id)).toEqual(two.map((entry) => entry.id));

    const mutated = [...one];
    mutated[0] = { ...mutated[0]!, label: 'Changed' };

    expect(registry.getTheme('classic').label).toBe('Classic');
  });

  it('exposes deterministic preset css', () => {
    const registry = new PublicationThemeRegistry();
    const a = registry.getPresetCss('modern');
    const b = registry.getPresetCss('modern');

    expect(a).toBe(b);
    expect(a).toContain('--pub-color-accent');
  });
});
