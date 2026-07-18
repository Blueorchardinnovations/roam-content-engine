import { ErrorCode } from '../../platform/shared/errors/codes.js';

export class RenderValidationError extends Error {
  public readonly code = ErrorCode.RENDER_VALIDATION_ERROR;

  public constructor(message = 'Render request validation failed.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'RenderValidationError';
  }
}

export class UnsupportedRenderFormatError extends Error {
  public readonly code = ErrorCode.UNSUPPORTED_FORMAT;

  public constructor(message = 'Requested render format is not supported.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'UnsupportedRenderFormatError';
  }
}

export class UnsupportedRenderThemeError extends Error {
  public readonly code = ErrorCode.UNSUPPORTED_THEME;

  public constructor(message = 'Requested render theme is not supported.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'UnsupportedRenderThemeError';
  }
}

export class RenderFailedError extends Error {
  public readonly code = ErrorCode.RENDER_FAILED;

  public constructor(message = 'Rendering failed.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'RenderFailedError';
  }
}

export class InvalidRenderAssetError extends Error {
  public readonly code = ErrorCode.INVALID_ASSET;

  public constructor(message = 'Render request contains an invalid asset reference.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidRenderAssetError';
  }
}

export class RenderCancelledError extends Error {
  public constructor(message = 'Rendering was cancelled.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'RenderCancelledError';
  }
}
