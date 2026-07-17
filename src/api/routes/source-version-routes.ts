import type { FastifyInstance } from 'fastify';

import type { CreateSourceVersion } from '../../application/source-versions/create-source-version.js';
import type { GetSourceVersion } from '../../application/source-versions/get-source-version.js';

import { getTenantRequestContext } from '../middleware/tenant-context.js';
import {
  parseSchema
} from '../schemas/common-schemas.js';
import {
  createSourceVersionBodySchema,
  getSourceVersionParamsSchema
} from '../schemas/source-version-schemas.js';
import { toSourceVersionDto } from '../serializers/source-version-serializer.js';

export type SourceVersionRouteDependencies = {
  readonly createSourceVersion: CreateSourceVersion;
  readonly getSourceVersion: GetSourceVersion;
};

export async function registerSourceVersionRoutes(
  app: FastifyInstance,
  dependencies: SourceVersionRouteDependencies
): Promise<void> {
  app.post('/source-versions', async (request, reply) => {
    const requestContext = getTenantRequestContext(request);

    const body = parseSchema(
      createSourceVersionBodySchema,
      request.body,
      'Invalid source version request body.'
    );

    const sourceVersion = await dependencies.createSourceVersion.execute({
      tenantId: requestContext.tenantId,
      projectId: body.projectId,
      transcriptText: body.transcriptText
    });

    return reply.status(201).send(toSourceVersionDto(sourceVersion));
  });

  app.get('/source-versions/:sourceVersionId', async (request) => {
    const requestContext = getTenantRequestContext(request);

    const params = parseSchema(
      getSourceVersionParamsSchema,
      request.params,
      'Invalid source version ID.'
    );

    const sourceVersion = await dependencies.getSourceVersion.execute({
      tenantId: requestContext.tenantId,
      sourceVersionId: params.sourceVersionId
    });

    return toSourceVersionDto(sourceVersion);
  });
}
