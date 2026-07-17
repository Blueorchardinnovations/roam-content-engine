import { ErrorCode } from '../../platform/shared/errors/codes.js';

export class PublicationValidationError extends Error {
  public readonly code = ErrorCode.PUBLICATION_VALIDATION_ERROR;

  public constructor(message = 'Publication validation failed.') {
    super(message);
    this.name = 'PublicationValidationError';
  }
}

export class UnsupportedPublicationTypeError extends Error {
  public readonly code = ErrorCode.PUBLICATION_UNSUPPORTED_TYPE;

  public constructor(publicationType: string) {
    super(`Unsupported publication type: ${publicationType}`);
    this.name = 'UnsupportedPublicationTypeError';
  }
}

export class PublicationBuildError extends Error {
  public readonly code = ErrorCode.PUBLICATION_BUILD_ERROR;

  public constructor(message = 'Publication build failed.') {
    super(message);
    this.name = 'PublicationBuildError';
  }
}

export class PublicationCancelledError extends Error {
  public constructor(message = 'Publication generation was cancelled.') {
    super(message);
    this.name = 'PublicationCancelledError';
  }
}