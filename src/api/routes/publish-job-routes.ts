import type { FastifyInstance } from 'fastify';

import type {
  CancelPublishJob,
  CreatePublishJob,
  GetPublishJob,
  GetPublishJobEvents
} from '../../application/publish-jobs/index.js';
import type {
  PublishEngineCtaPublicationMetadata,
  PublishEnginePublicationMetadata,
  PublishEngineRenderOptions
} from '../../infrastructure/publish-engine/publish-engine-types.js';

import { getTenantRequestContext } from '../middleware/tenant-context.js';
import { parseSchema } from '../schemas/common-schemas.js';
import {
  createPublishJobBodySchema,
  createPublishJobHeadersSchema,
  publishJobParamsSchema
} from '../schemas/publish-job-schemas.js';
import {
  toPublishJobDto,
  toPublishJobEventDto
} from '../serializers/publish-job-serializer.js';

export type PublishJobRouteDependencies = {
  readonly createPublishJob: CreatePublishJob;
  readonly getPublishJob: GetPublishJob;
  readonly getPublishJobEvents: GetPublishJobEvents;
  readonly cancelPublishJob: CancelPublishJob;
};

function normalizeRenderOptions(
  input: unknown
): PublishEngineRenderOptions | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const value = input as Record<string, unknown>;

  const normalized: {
    densityId?: 'comfortable' | 'standard' | 'compact' | 'high-density';
    layoutId?: 'single-column' | 'two-column' | 'wide-content';
    includeToc?: boolean;
  } = {};

  if (typeof value.densityId === 'string') {
    normalized.densityId = value.densityId as 'comfortable' | 'standard' | 'compact' | 'high-density';
  }

  if (typeof value.layoutId === 'string') {
    normalized.layoutId = value.layoutId as 'single-column' | 'two-column' | 'wide-content';
  }

  if (value.includeToc !== undefined) {
    normalized.includeToc = value.includeToc as boolean;
  }

  return normalized;
}

function normalizePublicationMetadata(
  input: unknown
): PublishEnginePublicationMetadata | PublishEngineCtaPublicationMetadata | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const value = input as Record<string, unknown>;

  const normalized: Record<string, string> = {};
  if (value.publicationId !== undefined) {
    normalized.publicationId = value.publicationId as string;
  }
  if (value.title !== undefined) {
    normalized.title = value.title as string;
  }
  if (value.language !== undefined) {
    normalized.language = value.language as string;
  }
  if (value.theme !== undefined) {
    normalized.theme = value.theme as string;
  }
  if (value.audience !== undefined) {
    normalized.audience = value.audience as string;
  }

  return normalized as PublishEnginePublicationMetadata | PublishEngineCtaPublicationMetadata;
}

export async function registerPublishJobRoutes(
  app: FastifyInstance,
  dependencies: PublishJobRouteDependencies
): Promise<void> {
  app.post('/publish-jobs', async (request, reply) => {
    const requestContext = getTenantRequestContext(request);

    const headers = parseSchema(
      createPublishJobHeadersSchema,
      request.headers,
      'Invalid publish job request headers.'
    );

    const body = parseSchema(
      createPublishJobBodySchema,
      request.body,
      'Invalid publish job request body.'
    );

    const publishJob = await dependencies.createPublishJob.execute({
      tenantId: requestContext.tenantId,
      projectId: body.projectId,
      sourceContentJobId: body.sourceContentJobId,
      outputFormat: body.outputFormat,
      publishMode: body.publishMode,
      renderOptions: normalizeRenderOptions(body.renderOptions),
      publicationMetadata: normalizePublicationMetadata(body.publicationMetadata),
      idempotencyKey: headers['idempotency-key'],
      correlationId: requestContext.correlationId
    });

    return reply.status(202).send(toPublishJobDto(publishJob));
  });

  app.get('/publish-jobs/:publishJobId', async (request) => {
    const requestContext = getTenantRequestContext(request);

    const params = parseSchema(
      publishJobParamsSchema,
      request.params,
      'Invalid publish job ID.'
    );

    const publishJob = await dependencies.getPublishJob.execute({
      tenantId: requestContext.tenantId,
      publishJobId: params.publishJobId
    });

    return toPublishJobDto(publishJob);
  });

  app.get('/publish-jobs/:publishJobId/events', async (request) => {
    const requestContext = getTenantRequestContext(request);

    const params = parseSchema(
      publishJobParamsSchema,
      request.params,
      'Invalid publish job ID.'
    );

    const events = await dependencies.getPublishJobEvents.execute({
      tenantId: requestContext.tenantId,
      publishJobId: params.publishJobId
    });

    return {
      publishJobId: params.publishJobId,
      events: events.map(toPublishJobEventDto)
    };
  });

  app.post('/publish-jobs/:publishJobId/cancel', async (request) => {
    const requestContext = getTenantRequestContext(request);

    const params = parseSchema(
      publishJobParamsSchema,
      request.params,
      'Invalid publish job ID.'
    );

    const publishJob = await dependencies.cancelPublishJob.execute({
      tenantId: requestContext.tenantId,
      publishJobId: params.publishJobId
    });

    return toPublishJobDto(publishJob);
  });
}
