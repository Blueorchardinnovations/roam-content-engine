import { ErrorCode } from '../../platform/shared/errors/codes.js';
import { ConflictError } from '../../platform/shared/errors/index.js';

import type { ContentJobStatus } from './types.js';

const allowedTransitions: Readonly<Record<ContentJobStatus, readonly ContentJobStatus[]>> = {
  queued: ['processing', 'cancelled'],
  processing: ['completed', 'retrying', 'failed'],
  retrying: ['processing', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: []
};

export function isTransitionAllowed(
  from: ContentJobStatus,
  to: ContentJobStatus
): boolean {
  return allowedTransitions[from].includes(to);
}

export function assertTransitionAllowed(
  from: ContentJobStatus,
  to: ContentJobStatus
): void {
  if (from === 'completed') {
    throw new ConflictError(
      ErrorCode.JOB_ALREADY_COMPLETED,
      'Completed jobs cannot transition to another state.'
    );
  }

  if (!isTransitionAllowed(from, to)) {
    throw new ConflictError(
      ErrorCode.INVALID_WORKFLOW_STATE,
      `Transition from ${from} to ${to} is not allowed.`
    );
  }
}

export const contentJobTransitionPolicy = allowedTransitions;
