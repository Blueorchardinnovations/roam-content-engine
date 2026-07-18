import type {
  PublicationDensityId,
  PublicationLayoutId,
  PublicationThemeId,
  ThemeColorScheme
} from '../themes/types.js';
import type {
  PublicationPackageCompositionInput,
  ResolvedPublicationPresentation
} from './types.js';

export const defaultPublicationDensityId: PublicationDensityId = 'standard';
export const defaultPublicationLayoutId: PublicationLayoutId = 'single-column';

export function resolvePublicationPresentation(input: {
  readonly composition: PublicationPackageCompositionInput;
  readonly colorScheme: ThemeColorScheme;
}): ResolvedPublicationPresentation {
  const themeId: PublicationThemeId = input.composition.themeId ?? input.composition.document.theme;

  return {
    themeId,
    densityId: input.composition.densityId ?? defaultPublicationDensityId,
    layoutId: input.composition.layoutId ?? defaultPublicationLayoutId,
    colorScheme: input.colorScheme
  };
}
