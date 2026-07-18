import { ErrorCode } from '../../platform/shared/errors/codes.js';
import {
  PlatformError,
  type PlatformErrorDetails
} from '../../platform/shared/errors/index.js';

export class PublishEngineError extends PlatformError {
  public constructor(
    code: string,
    message: string,
    details?: PlatformErrorDetails,
    cause?: unknown
  ) {
    super(code as any, message, {
      details,
      cause
    });
    this.name = 'PublishEngineError';
  }
}

export class PublishEngineConfigurationError extends PublishEngineError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.PUBLISH_ENGINE_CONFIGURATION_ERROR, message, details, cause);
    this.name = 'PublishEngineConfigurationError';
  }
}

export class PublishEngineAuthenticationError extends PublishEngineError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.PUBLISH_ENGINE_AUTHENTICATION_ERROR, message, details, cause);
    this.name = 'PublishEngineAuthenticationError';
  }
}

export class PublishEngineTransportError extends PublishEngineError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.PUBLISH_ENGINE_TRANSPORT_ERROR, message, details, cause);
    this.name = 'PublishEngineTransportError';
  }
}

export class PublishEngineTimeoutError extends PublishEngineError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.PUBLISH_ENGINE_TIMEOUT, message, details, cause);
    this.name = 'PublishEngineTimeoutError';
  }
}

export class PublishEngineCancelledError extends PublishEngineError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.PUBLISH_ENGINE_CANCELLED, message, details, cause);
    this.name = 'PublishEngineCancelledError';
  }
}

export class PublishEngineProtocolError extends PublishEngineError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.PUBLISH_ENGINE_PROTOCOL_ERROR, message, details, cause);
    this.name = 'PublishEngineProtocolError';
  }
}

export class PublishEngineRemoteRequestError extends PublishEngineError {
  public readonly status: number;

  public constructor(
    message: string,
    input: { status: number; details?: PlatformErrorDetails; cause?: unknown }
  ) {
    super(ErrorCode.PUBLISH_ENGINE_REMOTE_REQUEST_ERROR, message, {
      status: input.status,
      ...(input.details ?? {})
    }, input.cause);
    this.name = 'PublishEngineRemoteRequestError';
    this.status = input.status;
  }
}

export class PublishEngineIdempotencyConflictError extends PublishEngineRemoteRequestError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(message, {
      status: 409,
      ...(details === undefined
        ? {}
        : { details }),
      ...(cause === undefined
        ? {}
        : { cause })
    });
    this.name = 'PublishEngineIdempotencyConflictError';
  }
}

export class PublishEngineRetryExhaustedError extends PublishEngineError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.PUBLISH_ENGINE_RETRY_EXHAUSTED, message, details, cause);
    this.name = 'PublishEngineRetryExhaustedError';
  }
}

export class PublishEngineJobFailedError extends PublishEngineError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.PUBLISH_ENGINE_JOB_FAILED, message, details, cause);
    this.name = 'PublishEngineJobFailedError';
  }
}

export class PublishEngineJobCancelledError extends PublishEngineError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.PUBLISH_ENGINE_JOB_CANCELLED, message, details, cause);
    this.name = 'PublishEngineJobCancelledError';
  }
}

export class PublishEngineWaitTimeoutError extends PublishEngineError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.PUBLISH_ENGINE_WAIT_TIMEOUT, message, details, cause);
    this.name = 'PublishEngineWaitTimeoutError';
  }
}

export class PublishEngineArtifactValidationError extends PublishEngineError {
  public constructor(message: string, details?: PlatformErrorDetails, cause?: unknown) {
    super(ErrorCode.PUBLISH_ENGINE_ARTIFACT_INVALID, message, details, cause);
    this.name = 'PublishEngineArtifactValidationError';
  }
}
