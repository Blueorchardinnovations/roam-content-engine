import type { FastifyServerOptions } from 'fastify';

export function createApiLoggerOptions(
  nodeEnv: 'development' | 'test' | 'production'
): Exclude<FastifyServerOptions['logger'], undefined> {
  if (nodeEnv === 'test') {
    return false;
  }

  return {
    level: nodeEnv === 'production' ? 'info' : 'debug'
  };
}
