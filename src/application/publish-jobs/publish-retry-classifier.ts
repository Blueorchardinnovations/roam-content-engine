import { ErrorCode } from '../../platform/shared/errors/codes.js';
import { PlatformError } from '../../platform/shared/errors/index.js';
import {
  PublishEngineArtifactValidationError,
  PublishEngineAuthenticationError,
  PublishEngineCancelledError,
  PublishEngineIdempotencyConflictError,
  PublishEngineJobCancelledError,
  PublishEngineJobFailedError,
  PublishEngineProtocolError,
  PublishEngineRemoteRequestError,
  PublishEngineRetryExhaustedError,
  PublishEngineTimeoutError,
  PublishEngineTransportError,
  PublishEngineWaitTimeoutError
} from '../../infrastructure/publish-engine/publish-engine-errors.js';
import { isRetryableStatus } from '../../infrastructure/publish-engine/publish-engine-retry-policy.js';

export type PublishFailurePhase = 'submission' | 'poll' | 'download';

export type PublishRetryClassification = {
  readonly retryable: boolean;
  readonly errorCode: string;
  readonly errorMessage: string;
};

const MAX_ERROR_MESSAGE_CHARS = 500;

function sanitizeErrorMessage(message: string): string {
  if (message.length <= MAX_ERROR_MESSAGE_CHARS) {
    return message;
  }

  return message.slice(0, MAX_ERROR_MESSAGE_CHARS);
}

function messageFromError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return sanitizeErrorMessage(error.message);
  }

  return fallback;
}

export function classifyPublishOrchestrationFailure(input: {
  readonly error: unknown;
  readonly phase: PublishFailurePhase;
  readonly uncertainSubmission?: boolean;
}): PublishRetryClassification {
  const phasePrefix = `${input.phase} failed`;

  if (input.uncertainSubmission) {
    return {
      retryable: true,
      errorCode: ErrorCode.PUBLISH_ENGINE_TRANSPORT_ERROR,
      errorMessage: messageFromError(input.error, `${phasePrefix}: uncertain submission outcome`)
    };
  }

  if (input.error instanceof PublishEngineAuthenticationError) {
    return {
      retryable: false,
      errorCode: ErrorCode.PUBLISH_ENGINE_AUTHENTICATION_ERROR,
      errorMessage: messageFromError(input.error, `${phasePrefix}: authentication error`)
    };
  }

  if (input.error instanceof PublishEngineProtocolError) {
    return {
      retryable: false,
      errorCode: ErrorCode.PUBLISH_ENGINE_PROTOCOL_ERROR,
      errorMessage: messageFromError(input.error, `${phasePrefix}: protocol error`)
    };
  }

  if (input.error instanceof PublishEngineIdempotencyConflictError) {
    return {
      retryable: false,
      errorCode: ErrorCode.PUBLISH_JOB_IDEMPOTENCY_CONFLICT,
      errorMessage: messageFromError(input.error, `${phasePrefix}: idempotency conflict`)
    };
  }

  if (input.error instanceof PublishEngineArtifactValidationError) {
    return {
      retryable: false,
      errorCode: ErrorCode.PUBLISH_SOURCE_ARTIFACT_INVALID,
      errorMessage: messageFromError(input.error, `${phasePrefix}: invalid artifact`)
    };
  }

  if (input.error instanceof PublishEngineJobFailedError) {
    return {
      retryable: false,
      errorCode: ErrorCode.PUBLISH_REMOTE_JOB_FAILED,
      errorMessage: messageFromError(input.error, `${phasePrefix}: remote job failed`)
    };
  }

  if (input.error instanceof PublishEngineJobCancelledError || input.error instanceof PublishEngineCancelledError) {
    return {
      retryable: false,
      errorCode: ErrorCode.PUBLISH_REMOTE_JOB_CANCELLED,
      errorMessage: messageFromError(input.error, `${phasePrefix}: remote job cancelled`)
    };
  }

  if (
    input.error instanceof PublishEngineTransportError ||
    input.error instanceof PublishEngineTimeoutError ||
    input.error instanceof PublishEngineWaitTimeoutError ||
    input.error instanceof PublishEngineRetryExhaustedError
  ) {
    return {
      retryable: true,
      errorCode: input.error.code,
      errorMessage: messageFromError(input.error, `${phasePrefix}: retryable transport failure`)
    };
  }

  if (input.error instanceof PublishEngineRemoteRequestError) {
    if (input.error.status === 401 || input.error.status === 403) {
      return {
        retryable: false,
        errorCode: ErrorCode.PUBLISH_ENGINE_AUTHENTICATION_ERROR,
        errorMessage: messageFromError(input.error, `${phasePrefix}: unauthorized remote response`)
      };
    }

    if (isRetryableStatus(input.error.status)) {
      return {
        retryable: true,
        errorCode: ErrorCode.PUBLISH_ENGINE_REMOTE_REQUEST_ERROR,
        errorMessage: messageFromError(input.error, `${phasePrefix}: retryable remote response`)
      };
    }

    return {
      retryable: false,
      errorCode: ErrorCode.PUBLISH_ENGINE_REMOTE_REQUEST_ERROR,
      errorMessage: messageFromError(input.error, `${phasePrefix}: non-retryable remote response`)
    };
  }

  if (input.error instanceof PlatformError) {
    return {
      retryable: false,
      errorCode: input.error.code,
      errorMessage: messageFromError(input.error, `${phasePrefix}: platform error`)
    };
  }

  return {
    retryable: true,
    errorCode: ErrorCode.PUBLISH_ENGINE_TRANSPORT_ERROR,
    errorMessage: messageFromError(input.error, `${phasePrefix}: unexpected retryable failure`)
  };
}
