import type {
  FastifyInstance,
  FastifyRequest
} from 'fastify';

import {
  coerceCorrelationId
} from '../schemas/common-schemas.js';
import {
  requestHeaders,
  type BaseRequestContext,
  type RequestContext
} from '../../platform/observability/request-context.js';

declare module 'fastify' {
  interface FastifyRequest {
    baseRequestContext: BaseRequestContext;
    requestContext?: RequestContext;
  }
}

export async function registerRequestContext(
  app: FastifyInstance
): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    const requestId =
      typeof request.id === 'string' && request.id.length > 0
        ? request.id
        : coerceCorrelationId(undefined);

    const correlationHeader = request.headers[requestHeaders.correlationIdHeader];

    const correlationId = coerceCorrelationId(
      Array.isArray(correlationHeader)
        ? correlationHeader[0]
        : correlationHeader
    );

    request.baseRequestContext = {
      requestId,
      correlationId
    };

    reply.header(requestHeaders.requestIdHeader, requestId);
    reply.header(requestHeaders.correlationIdHeader, correlationId);
  });

  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        requestId: request.baseRequestContext.requestId,
        correlationId: request.baseRequestContext.correlationId,
        tenantId: request.requestContext?.tenantId,
        method: request.method,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime
      },
      'Request completed.'
    );
  });
}

export function getRequestContext(
  request: FastifyRequest
): BaseRequestContext {
  return request.baseRequestContext;
}
