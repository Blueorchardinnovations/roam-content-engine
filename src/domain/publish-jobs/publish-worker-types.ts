import type { PublishJobId, TenantId } from './types.js';

export type PublishWorkerId = string;

export type ClaimedPublishJob = {
  readonly tenantId: TenantId;
  readonly publishJobId: PublishJobId;
  readonly workerId: PublishWorkerId;
  readonly leaseExpiresAt: Date;
};

export type PublishJobSource = {
  acquireNext(input: {
    workerId: PublishWorkerId;
    leaseDurationMs: number;
    now: Date;
  }): Promise<ClaimedPublishJob | null>;

  renewLease(input: {
    tenantId: TenantId;
    publishJobId: PublishJobId;
    workerId: PublishWorkerId;
    leaseDurationMs: number;
    now: Date;
  }): Promise<ClaimedPublishJob | null>;
};
