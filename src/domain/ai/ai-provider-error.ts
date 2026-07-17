import type { ErrorCodeValue } from '../../platform/shared/errors/codes.js';
import { ErrorCode } from '../../platform/shared/errors/codes.js';
import { PlatformError, type PlatformErrorDetails } from '../../platform/shared/errors/index.js';

export class AIProviderError extends PlatformError {
  public constructor(
    code: ErrorCodeValue,
    message: string,
    details?: PlatformErrorDetails,
    cause?: unknown
  ) {
    super(code, message, { details, cause });
    this.name = 'AIProviderError';
  }
}

export class AIValidationError extends AIProviderError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.AI_VALIDATION_ERROR, message, details, cause);
    this.name = 'AIValidationError';
  }
}

export class AIProviderUnavailableError extends AIProviderError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.AI_PROVIDER_UNAVAILABLE, message, details, cause);
    this.name = 'AIProviderUnavailableError';
  }
}

export class AIRateLimitError extends AIProviderError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.AI_RATE_LIMIT, message, details, cause);
    this.name = 'AIRateLimitError';
  }
}

export class AIAuthenticationError extends AIProviderError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.AI_AUTHENTICATION_ERROR, message, details, cause);
    this.name = 'AIAuthenticationError';
  }
}

export class AITimeoutError extends AIProviderError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.AI_TIMEOUT, message, details, cause);
    this.name = 'AITimeoutError';
  }
}

export class AIPermanentError extends AIProviderError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.AI_PERMANENT_ERROR, message, details, cause);
    this.name = 'AIPermanentError';
  }
}
