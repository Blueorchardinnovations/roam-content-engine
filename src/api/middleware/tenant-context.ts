import type {
  FastifyReply,
  FastifyRequest
} from 'fastify';

import { parseSchema, tenantHeadersSchema } from '../schemas/common-schemas.js';
import {
  requestHeaders,
  type RequestContext
} from '../../platform/observability/request-context.js';
import { ErrorCode } from '../../platform/shared/errors/codes.js';
import { ValidationError } from '../../platform/shared/errors/index.js';

export async function requireTenantContext(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const rawTenantHeader = request.headers[requestHeaders.tenantIdHeader];

  if (
    rawTenantHeader === undefined ||
    (typeof rawTenantHeader === 'string' && rawTenantHeader.trim().length === 0)
  ) {
    throw new ValidationError('x-tenant-id header is required.', {
      code: ErrorCode.TENANT_CONTEXT_REQUIRED
    });
  }

  const headers = parseSchema(
    tenantHeadersSchema,
    request.headers,
    'Invalid tenant header.'
  );

  const tenantId = headers[requestHeaders.tenantIdHeader];

  const context: RequestContext = {
    ...request.baseRequestContext,
    tenantId
  };

  request.requestContext = context;
}

export function getTenantRequestContext(
  request: FastifyRequest
): RequestContext {
  if (!request.requestContext) {
    throw new ValidationError('x-tenant-id header is required.', {
      code: ErrorCode.TENANT_CONTEXT_REQUIRED
    });
  }

  return request.requestContext;
}
