import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(
  app: FastifyInstance,
  dependencies: {
    checkDatabaseHealth: () => Promise<boolean>;
  }
): Promise<void> {
  app.get('/health/live', async () => ({
    status: 'ok',
    service: 'roam-content-engine'
  }));

  app.get('/health/ready', async (request, reply) => {
    try {
      const isHealthy = await dependencies.checkDatabaseHealth();

      if (!isHealthy) {
        throw new Error('Database reported unhealthy state.');
      }

      return {
        status: 'ready',
        service: 'roam-content-engine',
        database: 'available'
      };
    } catch {
      request.log.warn('Readiness check failed.');

      return reply.status(503).send({
        status: 'not-ready',
        service: 'roam-content-engine',
        database: 'unavailable'
      });
    }
  });
}
