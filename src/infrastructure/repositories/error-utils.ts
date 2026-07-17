import { ErrorCode } from '../../platform/shared/errors/codes.js';
import {
  PlatformError,
  ValidationError
} from '../../platform/shared/errors/index.js';

export function toDatabaseUnavailableError(
  error: unknown,
  message = 'Database operation failed.'
): PlatformError {
  if (error instanceof PlatformError) {
    return error;
  }

  return new PlatformError(
    ErrorCode.DATABASE_UNAVAILABLE,
    message,
    { cause: error }
  );
}

export function ensureNonEmpty(
  value: string,
  field: string
): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new ValidationError(`${field} cannot be empty.`, {
      field
    });
  }

  return trimmed;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
