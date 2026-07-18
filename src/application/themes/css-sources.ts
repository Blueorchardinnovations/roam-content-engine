import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MissingCssSourceError } from './errors.js';
import type { CssLayerId } from './types.js';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

const LAYER_SOURCE_PATHS: Readonly<Record<CssLayerId, string>> = {
  'tokens-primitives': 'tokens/primitives.css',
  'tokens-semantic': 'tokens/semantic.css',
  'tokens-components': 'tokens/components.css',
  'base-reset': 'base/reset.css',
  'base-document': 'base/document.css',
  'base-typography': 'base/typography.css',
  'base-accessibility': 'base/accessibility.css',
  'base-utilities': 'base/utilities.css',
  'layout-single-column': 'layouts/single-column.css',
  'layout-two-column': 'layouts/two-column.css',
  'layout-wide-content': 'layouts/wide-content.css',
  'component-publication': 'components/publication.css',
  'component-headings': 'components/headings.css',
  'component-paragraphs': 'components/paragraphs.css',
  'component-blockquotes': 'components/blockquotes.css',
  'component-lists': 'components/lists.css',
  'component-tables': 'components/tables.css',
  'component-figures': 'components/figures.css',
  'component-navigation': 'components/navigation.css',
  'component-dividers': 'components/dividers.css',
  'component-reflection': 'components/reflection.css',
  'component-prayer': 'components/prayer.css',
  'component-journal-prompt': 'components/journal-prompt.css',
  'component-call-to-action': 'components/call-to-action.css',
  'component-scripture': 'components/scripture.css',
  'component-sidebar': 'components/sidebar.css',
  'component-key-takeaway': 'components/key-takeaway.css',
  'component-highlight': 'components/highlight.css',
  'component-warning': 'components/warning.css',
  'density-comfortable': 'density/comfortable.css',
  'density-standard': 'density/standard.css',
  'density-compact': 'density/compact.css',
  'density-high-density': 'density/high-density.css',
  'preset-classic': 'presets/classic.css',
  'preset-modern': 'presets/modern.css',
  'preset-ministry': 'presets/ministry.css',
  'preset-workbook': 'presets/workbook.css',
  'preset-magazine': 'presets/magazine.css',
  'preset-dark': 'presets/dark.css',
  'preset-minimal': 'presets/minimal.css'
};

function normalizeCssNewlines(source: string): string {
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

export function loadCssLayer(layerId: CssLayerId): string {
  const relativePath = LAYER_SOURCE_PATHS[layerId];

  if (!relativePath) {
    throw new MissingCssSourceError(layerId);
  }

  const absolutePath = resolve(MODULE_DIR, relativePath);

  try {
    const source = readFileSync(absolutePath, 'utf8');
    return normalizeCssNewlines(source);
  } catch {
    throw new MissingCssSourceError(layerId);
  }
}
