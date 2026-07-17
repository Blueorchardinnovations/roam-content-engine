import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from 'fastify';

import { ErrorCode } from '../../platform/shared/errors/codes.js';
import {
  ConflictError,
  NotFoundError,
  PlatformError,
  ValidationError
} from '../../platform/shared/errors/index.js';

import { buildApiErrorResponse } from './api-error-response.js';

type ErrorMapping = {
  readonly statusCode: number;
  readonly code: keyof typeof ErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
};

function mapError(error: unknown): ErrorMapping {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE'
  ) {
    return {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload is too large.'
    };
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'FST_ERR_CTP_INVALID_JSON_BODY'
  ) {
    return {
      statusCode: 400,
      code: 'INVALID_JSON',
      message: 'Malformed JSON payload.'
    };
  }

  if (error instanceof ValidationError) {
    const details =
      error.details?.code === ErrorCode.TENANT_CONTEXT_REQUIRED
        ? { reason: ErrorCode.TENANT_CONTEXT_REQUIRED }
        : error.details;

    const detailsBlock =
      details === undefined ? {} : { details };

    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: error.message,
      ...detailsBlock
    };
  }

  if (error instanceof NotFoundError) {
    const detailsBlock =
      error.details === undefined ? {} : { details: error.details };

    return {
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: error.message,
      ...detailsBlock
    };
  }

  if (error instanceof ConflictError) {
    const detailsBlock =
      error.details === undefined ? {} : { details: error.details };

    return {
      statusCode: 409,
      code: error.code,
      message: error.message,
      ...detailsBlock
    };
  }

  if (
    error instanceof PlatformError &&
    error.code === ErrorCode.DATABASE_UNAVAILABLE
  ) {
    return {
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database is currently unavailable.'
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred.'
  };
}

export function registerApiErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const mapped = mapError(error);

    if (mapped.statusCode >= 500) {
      request.log.error(
        {
          err: error,
          code: mapped.code,
          requestId: request.baseRequestContext?.requestId,
          correlationId: request.baseRequestContext?.correlationId
        },
        'Unhandled API error.'
      );
    } else {
      request.log.warn(
        {
          code: mapped.code,
          requestId: request.baseRequestContext?.requestId,
          correlationId: request.baseRequestContext?.correlationId
        },
        'Handled API error.'
      );
    }

    const requestId =
      request.baseRequestContext?.requestId ??
      (typeof request.id === 'string' ? request.id : 'unknown');

    const correlationId =
      request.baseRequestContext?.correlationId ?? 'corr_unknown';

    const detailsBlock =
      mapped.details === undefined
        ? {}
        : { details: mapped.details };

    const response = buildApiErrorResponse({
      code: ErrorCode[mapped.code],
      message: mapped.message,
      requestId,
      correlationId,
      ...detailsBlock
    });

    reply.status(mapped.statusCode).send(response);
  });
}
