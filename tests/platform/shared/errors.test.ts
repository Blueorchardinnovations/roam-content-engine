import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  NotFoundError,
  PlatformError,
  ValidationError
} from '../../../src/platform/shared/errors/index.js';

describe('platform error hierarchy', () => {
  it('creates a base PlatformError with code, details, and cause', () => {
    const cause = new Error('database unavailable');

    const error = new PlatformError(
      'DATABASE_UNAVAILABLE',
      'The database is unavailable.',
      {
        details: {
          retryable: true
        },
        cause
      }
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PlatformError);
    expect(error.name).toBe('PlatformError');
    expect(error.code).toBe('DATABASE_UNAVAILABLE');
    expect(error.message).toBe('The database is unavailable.');
    expect(error.details).toEqual({
      retryable: true
    });
    expect(error.cause).toBe(cause);
  });

  it('creates a ValidationError with the standard code', () => {
    const error = new ValidationError(
      'The transcript is empty.',
      {
        field: 'transcript'
      }
    );

    expect(error).toBeInstanceOf(PlatformError);
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual({
      field: 'transcript'
    });
  });

  it('creates a ConflictError with a caller-provided code', () => {
    const error = new ConflictError(
      'IDEMPOTENCY_KEY_REUSED',
      'The idempotency key was reused with different input.',
      {
        idempotencyKey: 'test-001'
      }
    );

    expect(error.name).toBe('ConflictError');
    expect(error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(error.details).toEqual({
      idempotencyKey: 'test-001'
    });
  });

  it('creates a NotFoundError without exposing the resource ID in the message', () => {
    const error = new NotFoundError(
      'Content job',
      'job_01ABC'
    );

    expect(error.name).toBe('NotFoundError');
    expect(error.code).toBe('RESOURCE_NOT_FOUND');
    expect(error.message).toBe('Content job was not found.');
    expect(error.message).not.toContain('job_01ABC');
    expect(error.details).toEqual({
      resourceType: 'Content job',
      resourceId: 'job_01ABC'
    });
  });
});
