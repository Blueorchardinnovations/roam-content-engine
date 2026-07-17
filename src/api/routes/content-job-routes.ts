import type { FastifyInstance } from 'fastify';

import type { CancelContentJob } from '../../application/content-jobs/cancel-content-job.js';
import type { CreateContentJob } from '../../application/content-jobs/create-content-job.js';
import type { GetContentJob } from '../../application/content-jobs/get-content-job.js';
import type { GetContentJobEvents } from '../../application/content-jobs/get-content-job-events.js';

import { getTenantRequestContext } from '../middleware/tenant-context.js';
import { parseSchema } from '../schemas/common-schemas.js';
import {
  contentJobParamsSchema,
  createContentJobBodySchema,
  createContentJobHeadersSchema
} from '../schemas/content-job-schemas.js';
import {
  toContentJobDto,
  toJobEventDto
} from '../serializers/content-job-serializer.js';

export type ContentJobRouteDependencies = {
  readonly createContentJob: CreateContentJob;
  readonly getContentJob: GetContentJob;
  readonly getContentJobEvents: GetContentJobEvents;
  readonly cancelContentJob: CancelContentJob;
};

export async function registerContentJobRoutes(
  app: FastifyInstance,
  dependencies: ContentJobRouteDependencies
): Promise<void> {
  app.post('/content-jobs', async (request, reply) => {
    const requestContext = getTenantRequestContext(request);

    const headers = parseSchema(
      createContentJobHeadersSchema,
      request.headers,
      'Invalid content job request headers.'
    );

    const body = parseSchema(
      createContentJobBodySchema,
      request.body,
      'Invalid content job request body.'
    );

    const job = await dependencies.createContentJob.execute({
      tenantId: requestContext.tenantId,
      projectId: body.projectId,
      sourceVersionId: body.sourceVersionId,
      idempotencyKey: headers['idempotency-key'],
      correlationId: requestContext.correlationId,
      jobType: body.jobType,
      requestSchemaVersion: body.requestSchemaVersion
    });

    return reply.status(202).send(toContentJobDto(job));
  });

  app.get('/content-jobs/:jobId', async (request) => {
    const requestContext = getTenantRequestContext(request);

    const params = parseSchema(
      contentJobParamsSchema,
      request.params,
      'Invalid content job ID.'
    );

    const job = await dependencies.getContentJob.execute({
      tenantId: requestContext.tenantId,
      jobId: params.jobId
    });

    return toContentJobDto(job);
  });

  app.get('/content-jobs/:jobId/events', async (request) => {
    const requestContext = getTenantRequestContext(request);

    const params = parseSchema(
      contentJobParamsSchema,
      request.params,
      'Invalid content job ID.'
    );

    const events = await dependencies.getContentJobEvents.execute({
      tenantId: requestContext.tenantId,
      jobId: params.jobId
    });

    return {
      jobId: params.jobId,
      events: events.map(toJobEventDto)
    };
  });

  app.post('/content-jobs/:jobId/cancel', async (request) => {
    const requestContext = getTenantRequestContext(request);

    const params = parseSchema(
      contentJobParamsSchema,
      request.params,
      'Invalid content job ID.'
    );

    const job = await dependencies.cancelContentJob.execute({
      tenantId: requestContext.tenantId,
      jobId: params.jobId
    });

    return toContentJobDto(job);
  });
}
