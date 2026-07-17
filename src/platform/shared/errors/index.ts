import { ErrorCode, type ErrorCodeValue } from './codes.js';

export type PlatformErrorDetails = Readonly<
  Record<string, unknown>
>;

export type PlatformErrorOptions = {
  readonly details?: PlatformErrorDetails | undefined;
  readonly cause?: unknown;
};

export class PlatformError extends Error {
  public readonly code: ErrorCodeValue;
  public readonly details: PlatformErrorDetails | undefined;
  public override readonly cause: unknown;

  public constructor(
    code: ErrorCodeValue,
    message: string,
    options: PlatformErrorOptions = {}
  ) {
    super(message, {
      cause: options.cause
    });

    this.name = 'PlatformError';
    this.code = code;
    this.details = options.details;
    this.cause = options.cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends PlatformError {
  public constructor(
    message: string,
    details?: PlatformErrorDetails
  ) {
    super(ErrorCode.VALIDATION_ERROR, message, {
      details
    });

    this.name = 'ValidationError';
  }
}

export class ConflictError extends PlatformError {
  public constructor(
    code: ErrorCodeValue,
    message: string,
    details?: PlatformErrorDetails
  ) {
    super(code, message, {
      details
    });

    this.name = 'ConflictError';
  }
}

export class NotFoundError extends PlatformError {
  public constructor(
    resourceType: string,
    resourceId: string
  ) {
    super(
      ErrorCode.RESOURCE_NOT_FOUND,
      `${resourceType} was not found.`,
      {
        details: {
          resourceType,
          resourceId
        }
      }
    );

    this.name = 'NotFoundError';
  }
}
