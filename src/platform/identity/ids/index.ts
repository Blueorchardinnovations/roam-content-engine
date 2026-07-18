import { ulid } from 'ulid';

export type IdPrefix =
  | 'srcver'
  | 'job'
  | 'pjob'
  | 'evt'
  | 'pevt'
  | 'corr'
  | 'tenant'
  | 'project'
  | 'workflow'
  | 'pub'
  | 'img'
  | 'prompt'
  | 'provider';

export type PrefixedId<TPrefix extends IdPrefix> =
  `${TPrefix}_${string}`;

function createPrefixedId<TPrefix extends IdPrefix>(
  prefix: TPrefix
): PrefixedId<TPrefix> {
  return `${prefix}_${ulid()}` as PrefixedId<TPrefix>;
}

export function createSourceVersionId(): PrefixedId<'srcver'> {
  return createPrefixedId('srcver');
}

export function createContentJobId(): PrefixedId<'job'> {
  return createPrefixedId('job');
}

export function createPublishJobId(): PrefixedId<'pjob'> {
  return createPrefixedId('pjob');
}

export function createJobEventId(): PrefixedId<'evt'> {
  return createPrefixedId('evt');
}

export function createPublishJobEventId(): PrefixedId<'pevt'> {
  return createPrefixedId('pevt');
}

export function createCorrelationId(): PrefixedId<'corr'> {
  return createPrefixedId('corr');
}

export function createTenantId(): PrefixedId<'tenant'> {
  return createPrefixedId('tenant');
}

export function createProjectId(): PrefixedId<'project'> {
  return createPrefixedId('project');
}

export function isPrefixedId<TPrefix extends IdPrefix>(
  value: string,
  prefix: TPrefix
): value is PrefixedId<TPrefix> {
  return value.startsWith(`${prefix}_`) && value.length > prefix.length + 1;
}
