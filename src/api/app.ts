import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';

import { CreateContentJob } from '../application/content-jobs/create-content-job.js';
import { GetContentJob } from '../application/content-jobs/get-content-job.js';
import { GetContentJobEvents } from '../application/content-jobs/get-content-job-events.js';
import { CancelContentJob } from '../application/content-jobs/cancel-content-job.js';
import { CreateSourceVersion } from '../application/source-versions/create-source-version.js';
import { GetSourceVersion } from '../application/source-versions/get-source-version.js';
import type { ContentJobRepository } from '../domain/repositories/content-job-repository.js';
import type { JobEventRepository } from '../domain/repositories/job-event-repository.js';
import type { SourceVersionRepository } from '../domain/repositories/source-version-repository.js';
import { createApiLoggerOptions } from '../platform/observability/logger.js';

import { registerApiErrorHandler } from './errors/api-error-handler.js';
import { registerRequestContext } from './middleware/request-context.js';
import { requireTenantContext } from './middleware/tenant-context.js';
import { registerContentJobRoutes } from './routes/content-job-routes.js';
import { registerHealthRoutes } from './routes/health-routes.js';
import { registerSourceVersionRoutes } from './routes/source-version-routes.js';

export const API_BODY_LIMIT_BYTES = 1_048_576;

export type AppDependencies = {
  readonly sourceVersionRepository: SourceVersionRepository;
  readonly contentJobRepository: ContentJobRepository;
  readonly jobEventRepository: JobEventRepository;
  readonly checkDatabaseHealth: () => Promise<boolean>;
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly bodyLimitBytes?: number;
};

export async function createApp(
  dependencies: AppDependencies
): Promise<FastifyInstance> {
  const app: FastifyInstance = Fastify({
    logger: createApiLoggerOptions(dependencies.nodeEnv),
    bodyLimit: dependencies.bodyLimitBytes ?? API_BODY_LIMIT_BYTES
  });

  await app.register(sensible);
  await registerRequestContext(app);
  registerApiErrorHandler(app);

  await registerHealthRoutes(app, {
    checkDatabaseHealth: dependencies.checkDatabaseHealth
  });

  const createSourceVersion = new CreateSourceVersion(
    dependencies.sourceVersionRepository
  );
  const getSourceVersion = new GetSourceVersion(
    dependencies.sourceVersionRepository
  );

  const createContentJob = new CreateContentJob(
    dependencies.contentJobRepository
  );
  const getContentJob = new GetContentJob(
    dependencies.contentJobRepository
  );
  const getContentJobEvents = new GetContentJobEvents(
    dependencies.contentJobRepository,
    dependencies.jobEventRepository
  );
  const cancelContentJob = new CancelContentJob(
    dependencies.contentJobRepository
  );

  await app.register(
    async (tenantScopedApp) => {
      tenantScopedApp.addHook('preHandler', requireTenantContext);

      await registerSourceVersionRoutes(tenantScopedApp, {
        createSourceVersion,
        getSourceVersion
      });

      await registerContentJobRoutes(tenantScopedApp, {
        createContentJob,
        getContentJob,
        getContentJobEvents,
        cancelContentJob
      });
    },
    { prefix: '/v1' }
  );

  return app;
}
