export const publishEngineOutputFormats = ['html', 'pdf', 'epub'] as const;
export type PublishEngineOutputFormat = (typeof publishEngineOutputFormats)[number];

export const publishEngineJobStates = [
  'queued',
  'accepted',
  'running',
  'processing',
  'succeeded',
  'failed',
  'cancelled'
] as const;

export type PublishEngineJobState = (typeof publishEngineJobStates)[number];

export const publishEngineTerminalSuccessStates = ['succeeded'] as const;
export const publishEngineTerminalFailureStates = ['failed', 'cancelled'] as const;

export type PublishEngineTerminalSuccessState =
  (typeof publishEngineTerminalSuccessStates)[number];
export type PublishEngineTerminalFailureState =
  (typeof publishEngineTerminalFailureStates)[number];

export type PublishEngineStyledHtmlSource = {
  readonly payloadRepresentation: 'styled-html';
  readonly mimeType: 'text/html; charset=utf-8';
  readonly fileExtension: '.html';
  readonly payload: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
};

export type PublishEnginePublicationMetadata = {
  readonly publicationId?: string;
  readonly title?: string;
  readonly language?: string;
  readonly theme?: string;
};

export type PublishEngineRenderOptions = {
  readonly densityId?: 'comfortable' | 'standard' | 'compact' | 'high-density';
  readonly layoutId?: 'single-column' | 'two-column' | 'wide-content';
  readonly includeToc?: boolean;
};

export type PublishEngineCtaPublicationMetadata = {
  readonly publicationId: string;
  readonly title: string;
  readonly language: string;
  readonly theme: string;
  readonly audience?: string;
};

export type PublishEngineCtaRenderOptions = PublishEngineRenderOptions;

export type SubmitRenderRequest = {
  readonly source: PublishEngineStyledHtmlSource;
  readonly outputFormat: PublishEngineOutputFormat;
  readonly publication?: PublishEnginePublicationMetadata;
  readonly renderOptions?: PublishEngineRenderOptions;
};

export type SubmitCtaRenderRequest = {
  readonly source: PublishEngineStyledHtmlSource;
  readonly outputFormat: PublishEngineOutputFormat;
  readonly publication: PublishEngineCtaPublicationMetadata;
  readonly renderOptions?: PublishEngineCtaRenderOptions;
};

export type PublishEngineJobError = {
  readonly code: string;
  readonly message: string;
  readonly correlationId?: string;
};

export type PublishEngineJob = {
  readonly jobId: string;
  readonly state: PublishEngineJobState;
  readonly outputFormat: PublishEngineOutputFormat;
  readonly correlationId?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly error?: PublishEngineJobError;
};

export type PublishEngineDownload = {
  readonly jobId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize?: number;
  readonly checksumSha256?: string;
  readonly downloadUrl?: string;
  readonly expiresAt?: string;
};

export type PublishEngineRemoteErrorBody = {
  readonly code: string;
  readonly message: string;
  readonly correlationId?: string;
};

export type PublishEngineRequestOptions = {
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
};

export type WaitForPublishEngineJobOptions = PublishEngineRequestOptions & {
  readonly pollIntervalMs?: number;
  readonly maxWaitMs?: number;
};

export type PublishEngineConfig = {
  readonly baseUrl: URL;
  readonly scope: string;
  readonly requestTimeoutMs: number;
  readonly pollIntervalMs: number;
  readonly maxWaitMs: number;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly retryMaxDelayMs: number;
  readonly retryJitterRatio: number;
};

export type PublishEngineLogger = {
  readonly debug?: (event: string, fields: Record<string, unknown>) => void;
  readonly info?: (event: string, fields: Record<string, unknown>) => void;
  readonly warn?: (event: string, fields: Record<string, unknown>) => void;
  readonly error?: (event: string, fields: Record<string, unknown>) => void;
};

export type PublishEngineFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;
