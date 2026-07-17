import { ErrorCode } from '../../platform/shared/errors/codes.js';

export class RetryableWorkerError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code: string = ErrorCode.WORKER_RETRYABLE
  ) {
    super(message);
    this.name = 'RetryableWorkerError';
    this.code = code;
  }
}

export class PermanentWorkerError extends Error {
  public readonly code: string;

  public constructor(
    message: string,
    code: string = ErrorCode.WORKER_PERMANENT
  ) {
    super(message);
    this.name = 'PermanentWorkerError';
    this.code = code;
  }
}

export class LeaseLostError extends Error {
  public constructor(message = 'Worker lease was lost.') {
    super(message);
    this.name = 'LeaseLostError';
  }
}

export class UnsupportedJobTypeError extends PermanentWorkerError {
  public constructor(jobType: string) {
    super(`Unsupported job type: ${jobType}`, ErrorCode.WORKER_UNSUPPORTED_JOB_TYPE);
    this.name = 'UnsupportedJobTypeError';
  }
}

export class WorkerCancelledError extends Error {
  public constructor(message = 'Worker execution was cancelled.') {
    super(message);
    this.name = 'WorkerCancelledError';
  }
}
