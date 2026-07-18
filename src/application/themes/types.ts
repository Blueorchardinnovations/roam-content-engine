export const publicationThemeIds = [
  'classic',
  'modern',
  'ministry',
  'workbook',
  'magazine',
  'dark',
  'minimal'
] as const;

export type PublicationThemeId = (typeof publicationThemeIds)[number];

export const publicationDensityIds = [
  'comfortable',
  'standard',
  'compact',
  'high-density'
] as const;

export type PublicationDensityId = (typeof publicationDensityIds)[number];

export const publicationLayoutIds = [
  'single-column',
  'two-column',
  'wide-content'
] as const;

export type PublicationLayoutId = (typeof publicationLayoutIds)[number];

export type ThemeColorScheme = 'light' | 'dark';

export const presetLayerIds = [
  'preset-classic',
  'preset-modern',
  'preset-ministry',
  'preset-workbook',
  'preset-magazine',
  'preset-dark',
  'preset-minimal'
] as const;

export type PresetLayerId = (typeof presetLayerIds)[number];

export type PublicationThemeMetadata = {
  readonly id: PublicationThemeId;
  readonly label: string;
  readonly colorScheme: ThemeColorScheme;
  readonly presetLayerId: PresetLayerId;
};

export type CssPackageRequest = {
  readonly themeId: PublicationThemeId;
  readonly densityId: PublicationDensityId;
  readonly layoutId: PublicationLayoutId;
};

export const cssLayerIds = [
  'tokens-primitives',
  'tokens-semantic',
  'tokens-components',
  'base-reset',
  'base-document',
  'base-typography',
  'base-accessibility',
  'base-utilities',
  'layout-single-column',
  'layout-two-column',
  'layout-wide-content',
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
  'component-warning',
  'density-comfortable',
  'density-standard',
  'density-compact',
  'density-high-density',
  ...presetLayerIds
] as const;

export type CssLayerId = (typeof cssLayerIds)[number];
