export interface PublishEngineAccessTokenProvider {
  getAccessToken(options?: { signal?: AbortSignal }): Promise<string>;
}
