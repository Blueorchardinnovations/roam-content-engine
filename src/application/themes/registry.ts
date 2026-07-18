import { loadCssLayer } from './css-sources.js';
import {
  DuplicateThemeRegistrationError,
  UnknownThemeError
} from './errors.js';
import type {
  PresetLayerId,
  PublicationThemeId,
  PublicationThemeMetadata
} from './types.js';
import { publicationThemeIds } from './types.js';

const DEFAULT_THEME_REGISTRATION: readonly PublicationThemeMetadata[] = [
  {
    id: 'classic',
    label: 'Classic',
    colorScheme: 'light',
    presetLayerId: 'preset-classic'
  },
  {
    id: 'modern',
    label: 'Modern',
    colorScheme: 'light',
    presetLayerId: 'preset-modern'
  },
  {
    id: 'ministry',
    label: 'Ministry Classic',
    colorScheme: 'light',
    presetLayerId: 'preset-ministry'
  },
  {
    id: 'workbook',
    label: 'Workbook',
    colorScheme: 'light',
    presetLayerId: 'preset-workbook'
  },
  {
    id: 'magazine',
    label: 'Magazine',
    colorScheme: 'light',
    presetLayerId: 'preset-magazine'
  },
  {
    id: 'dark',
    label: 'Dark',
    colorScheme: 'dark',
    presetLayerId: 'preset-dark'
  },
  {
    id: 'minimal',
    label: 'Minimal',
    colorScheme: 'light',
    presetLayerId: 'preset-minimal'
  }
];

function cloneThemeMetadata(theme: PublicationThemeMetadata): PublicationThemeMetadata {
  return {
    id: theme.id,
    label: theme.label,
    colorScheme: theme.colorScheme,
    presetLayerId: theme.presetLayerId
  };
}

export class PublicationThemeRegistry {
  private readonly themesById = new Map<PublicationThemeId, PublicationThemeMetadata>();
  private readonly orderedThemeIds: readonly PublicationThemeId[];

  public constructor(themes: readonly PublicationThemeMetadata[] = DEFAULT_THEME_REGISTRATION) {
    for (const theme of themes) {
      if (this.themesById.has(theme.id)) {
        throw new DuplicateThemeRegistrationError(theme.id);
      }

      this.themesById.set(theme.id, cloneThemeMetadata(theme));
    }

    this.orderedThemeIds = [...publicationThemeIds];

    for (const themeId of this.orderedThemeIds) {
      if (!this.themesById.has(themeId)) {
        throw new UnknownThemeError(themeId);
      }
    }
  }

  public listThemes(): readonly PublicationThemeMetadata[] {
    return this.orderedThemeIds
      .map((themeId) => this.getTheme(themeId));
  }

  public getTheme(themeId: PublicationThemeId | string): PublicationThemeMetadata {
    const resolved = this.themesById.get(themeId as PublicationThemeId);

    if (!resolved) {
      throw new UnknownThemeError(String(themeId));
    }

    return cloneThemeMetadata(resolved);
  }

  public getPresetLayerId(themeId: PublicationThemeId): PresetLayerId {
    return this.getTheme(themeId).presetLayerId;
  }

  public getPresetCss(themeId: PublicationThemeId): string {
    return loadCssLayer(this.getPresetLayerId(themeId));
  }
}

export const publicationThemeRegistry = new PublicationThemeRegistry();
