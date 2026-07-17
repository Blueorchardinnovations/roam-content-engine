import type { ErrorCodeValue } from '../../platform/shared/errors/codes.js';

export type ApiErrorResponse = {
  readonly error: {
    readonly code: ErrorCodeValue;
    readonly message: string;
    readonly requestId: string;
    readonly correlationId: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
};

export function buildApiErrorResponse(input: {
  code: ErrorCodeValue;
  message: string;
  requestId: string;
  correlationId: string;
  details?: Readonly<Record<string, unknown>>;
}): ApiErrorResponse {
  const detailsBlock =
    input.details === undefined
      ? {}
      : { details: input.details };

  return {
    error: {
      code: input.code,
      message: input.message,
      requestId: input.requestId,
      correlationId: input.correlationId,
      ...detailsBlock
    }
  };
}
