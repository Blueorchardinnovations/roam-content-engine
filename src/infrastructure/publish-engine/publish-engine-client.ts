import type {
  PublishEngineDownload,
  PublishEngineJob,
  PublishEngineRequestOptions,
  SubmitCtaRenderRequest,
  SubmitRenderRequest,
  WaitForPublishEngineJobOptions
} from './publish-engine-types.js';

export interface PublishEngineClient {
  submitRender(
    request: SubmitRenderRequest,
    options?: PublishEngineRequestOptions
  ): Promise<PublishEngineJob>;

  submitCtaRender(
    request: SubmitCtaRenderRequest,
    options?: PublishEngineRequestOptions
  ): Promise<PublishEngineJob>;

  getJob(
    jobId: string,
    options?: PublishEngineRequestOptions
  ): Promise<PublishEngineJob>;

  getDownload(
    jobId: string,
    options?: PublishEngineRequestOptions
  ): Promise<PublishEngineDownload>;

  waitForJob(
    jobId: string,
    options?: WaitForPublishEngineJobOptions
  ): Promise<PublishEngineJob>;
}
