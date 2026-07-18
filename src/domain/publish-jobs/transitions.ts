import { ErrorCode } from '../../platform/shared/errors/codes.js';
import { ConflictError } from '../../platform/shared/errors/index.js';

import type { PublishJobStatus } from './types.js';

const transitionPolicy: Readonly<Record<PublishJobStatus, readonly PublishJobStatus[]>> = {
  queued: ['processing', 'cancelled'],
  processing: ['waiting', 'retrying', 'completed', 'failed', 'cancelled'],
  waiting: ['processing', 'cancelled'],
  retrying: ['processing', 'cancelled', 'failed'],
  completed: [],
  failed: [],
  cancelled: []
};

export function isPublishJobTransitionAllowed(
  from: PublishJobStatus,
  to: PublishJobStatus
): boolean {
  return transitionPolicy[from].includes(to);
}

export function assertPublishJobTransitionAllowed(
  from: PublishJobStatus,
  to: PublishJobStatus
): void {
  if (!isPublishJobTransitionAllowed(from, to)) {
    throw new ConflictError(
      ErrorCode.PUBLISH_JOB_INVALID_STATE,
      `Publish job transition from ${from} to ${to} is not allowed.`
    );
  }
}

export const publishJobTransitionPolicy = transitionPolicy;
