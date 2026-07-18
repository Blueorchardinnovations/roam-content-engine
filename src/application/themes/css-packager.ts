import { loadCssLayer } from './css-sources.js';
import {
  InvalidCssPackageConfigurationError,
  UnknownDensityError,
  UnknownLayoutError,
  UnknownThemeError
} from './errors.js';
import {
  PublicationThemeRegistry,
  publicationThemeRegistry
} from './registry.js';
import type {
  CssLayerId,
  CssPackageRequest,
  PublicationDensityId,
  PublicationLayoutId,
  PublicationThemeId
} from './types.js';
import {
  publicationDensityIds,
  publicationLayoutIds,
  publicationThemeIds
} from './types.js';

const SHARED_LAYER_ORDER: readonly CssLayerId[] = [
  'tokens-primitives',
  'tokens-semantic',
  'tokens-components',
  'base-reset',
  'base-document',
  'base-typography',
  'base-accessibility',
  'base-utilities',
  'component-publication',
  'component-headings',
  'component-paragraphs',
  'component-blockquotes',
  'component-lists',
  'component-tables',
  'component-figures',
  'component-navigation',
  'component-dividers',
  'component-reflection',
  'component-prayer',
  'component-journal-prompt',
  'component-call-to-action',
  'component-scripture',
  'component-sidebar',
  'component-key-takeaway',
  'component-highlight',
  'component-warning'
] as const;

const LAYOUT_LAYER_BY_ID: Readonly<Record<PublicationLayoutId, CssLayerId>> = {
  'single-column': 'layout-single-column',
  'two-column': 'layout-two-column',
  'wide-content': 'layout-wide-content'
};

const DENSITY_LAYER_BY_ID: Readonly<Record<PublicationDensityId, CssLayerId>> = {
  comfortable: 'density-comfortable',
  standard: 'density-standard',
  compact: 'density-compact',
  'high-density': 'density-high-density'
};

function assertKnownTheme(themeId: string): asserts themeId is PublicationThemeId {
  if (!publicationThemeIds.includes(themeId as PublicationThemeId)) {
    throw new UnknownThemeError(themeId);
  }
}

function assertKnownDensity(densityId: string): asserts densityId is PublicationDensityId {
  if (!publicationDensityIds.includes(densityId as PublicationDensityId)) {
    throw new UnknownDensityError(densityId);
  }
}

function assertKnownLayout(layoutId: string): asserts layoutId is PublicationLayoutId {
  if (!publicationLayoutIds.includes(layoutId as PublicationLayoutId)) {
    throw new UnknownLayoutError(layoutId);
  }
}

function normalizeCssPackageOutput(source: string): string {
  return source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export class PublicationCssPackager {
  public constructor(
    private readonly registry: PublicationThemeRegistry = publicationThemeRegistry
  ) {}

  public package(input: CssPackageRequest): string {
    const request = {
      themeId: input.themeId,
      densityId: input.densityId,
      layoutId: input.layoutId
    };

    assertKnownTheme(request.themeId);
    assertKnownDensity(request.densityId);
    assertKnownLayout(request.layoutId);

    const layoutLayerId = LAYOUT_LAYER_BY_ID[request.layoutId];
    const densityLayerId = DENSITY_LAYER_BY_ID[request.densityId];
    const presetLayerId = this.registry.getPresetLayerId(request.themeId);

    if (!layoutLayerId || !densityLayerId || !presetLayerId) {
      throw new InvalidCssPackageConfigurationError('CSS package configuration is invalid.');
    }

    const orderedLayers: readonly CssLayerId[] = [
      ...SHARED_LAYER_ORDER.slice(0, 8),
      layoutLayerId,
      ...SHARED_LAYER_ORDER.slice(8),
      densityLayerId,
      presetLayerId
    ];

    const sections = orderedLayers.map((layerId) => {
      const layer = loadCssLayer(layerId);
      return `/* layer:${layerId} */\n${layer}`;
    });

    const output = sections.join('\n');
    return normalizeCssPackageOutput(output);
  }
}

export const publicationCssPackager = new PublicationCssPackager();
