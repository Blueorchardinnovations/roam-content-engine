import { z } from 'zod';

import {
  createCorrelationId,
  isPrefixedId,
  type PrefixedId
} from '../../platform/identity/ids/index.js';
import { ValidationError } from '../../platform/shared/errors/index.js';

export const projectIdSchema = z
  .string()
  .refine((value) => isPrefixedId(value, 'project'), 'Invalid project ID.');

export const sourceVersionIdSchema = z
  .string()
  .refine((value) => isPrefixedId(value, 'srcver'), 'Invalid source version ID.');

export const contentJobIdSchema = z
  .string()
  .refine((value) => isPrefixedId(value, 'job'), 'Invalid content job ID.');

export const tenantIdSchema = z
  .string()
  .refine((value) => isPrefixedId(value, 'tenant'), 'Invalid tenant ID.');

export const correlationIdSchema = z
  .string()
  .refine((value) => isPrefixedId(value, 'corr'), 'Invalid correlation ID.');

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1, 'Idempotency key is required.')
  .max(255, 'Idempotency key exceeds maximum length.');

export const tenantHeadersSchema = z
  .object({
    'x-tenant-id': tenantIdSchema
  })
  .passthrough();

export function parseSchema<TValue>(
  schema: z.ZodType<TValue>,
  input: unknown,
  message = 'Request validation failed.'
): TValue {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError(message, {
      issues: parsed.error.issues
    });
  }

  return parsed.data;
}

export function coerceCorrelationId(
  rawValue: unknown
): PrefixedId<'corr'> {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return createCorrelationId();
  }

  return parseSchema(
    correlationIdSchema,
    rawValue,
    'Invalid correlation header.'
  ) as PrefixedId<'corr'>;
}
