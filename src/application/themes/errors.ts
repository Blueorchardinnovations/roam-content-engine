export class ThemeModuleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ThemeModuleError';
  }
}

export class DuplicateThemeRegistrationError extends ThemeModuleError {
  public constructor(themeId: string) {
    super(`Duplicate theme registration: ${themeId}.`);
    this.name = 'DuplicateThemeRegistrationError';
  }
}

export class UnknownThemeError extends ThemeModuleError {
  public constructor(themeId: string) {
    super(`Unknown publication theme: ${themeId}.`);
    this.name = 'UnknownThemeError';
  }
}

export class UnknownDensityError extends ThemeModuleError {
  public constructor(densityId: string) {
    super(`Unknown publication density: ${densityId}.`);
    this.name = 'UnknownDensityError';
  }
}

export class UnknownLayoutError extends ThemeModuleError {
  public constructor(layoutId: string) {
    super(`Unknown publication layout: ${layoutId}.`);
    this.name = 'UnknownLayoutError';
  }
}

export class MissingCssSourceError extends ThemeModuleError {
  public constructor(layerId: string) {
    super(`Missing CSS source for required layer: ${layerId}.`);
    this.name = 'MissingCssSourceError';
  }
}

export class InvalidCssPackageConfigurationError extends ThemeModuleError {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidCssPackageConfigurationError';
  }
}

export class UnresolvedRequiredTokenError extends ThemeModuleError {
  public constructor(tokenName: string) {
    super(`Required CSS token is unresolved: ${tokenName}.`);
    this.name = 'UnresolvedRequiredTokenError';
  }
}
