import type { TenantId } from '../../domain/source-versions/types.js';
import type { CorrelationId } from '../../domain/content-jobs/types.js';

export interface BaseRequestContext {
  readonly requestId: string;
  readonly correlationId: CorrelationId;
}

export interface RequestContext extends BaseRequestContext {
  readonly tenantId: TenantId;
}

export type RequestHeaders = {
  readonly requestIdHeader: 'x-request-id';
  readonly correlationIdHeader: 'x-correlation-id';
  readonly tenantIdHeader: 'x-tenant-id';
};

export const requestHeaders: RequestHeaders = {
  requestIdHeader: 'x-request-id',
  correlationIdHeader: 'x-correlation-id',
  tenantIdHeader: 'x-tenant-id'
};
