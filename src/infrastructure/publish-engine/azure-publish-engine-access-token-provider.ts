import type { AccessToken, GetTokenOptions, TokenCredential } from '@azure/core-auth';

import { PublishEngineAuthenticationError, PublishEngineConfigurationError } from './publish-engine-errors.js';
import type { PublishEngineAccessTokenProvider } from './publish-engine-access-token-provider.js';

export type AzurePublishEngineAccessTokenProviderDependencies = {
  readonly credential: TokenCredential;
  readonly scope: string;
  readonly refreshSkewMs?: number;
  readonly now?: () => Date;
};

type CachedToken = {
  readonly token: string;
  readonly expiresOnTimestamp: number;
  readonly acquiredAtMs: number;
  readonly lifetimeMs: number;
};

const DEFAULT_REFRESH_SKEW_MS = 300_000;
const MAX_REFRESH_SKEW_MS = 3_600_000;
const MIN_REFRESH_WINDOW_MS = 1_000;

function normalizeScope(scope: string): string {
  const normalized = scope.trim();
  if (normalized.length === 0) {
    throw new PublishEngineConfigurationError('Publish Engine scope is required for token acquisition.');
  }

  return normalized;
}

function normalizeRefreshSkewMs(refreshSkewMs: number | undefined): number {
  if (refreshSkewMs === undefined) {
    return DEFAULT_REFRESH_SKEW_MS;
  }

  if (!Number.isInteger(refreshSkewMs) || refreshSkewMs < 0 || refreshSkewMs > MAX_REFRESH_SKEW_MS) {
    throw new PublishEngineConfigurationError(
      `Publish Engine token refresh skew must be an integer between 0 and ${MAX_REFRESH_SKEW_MS}.`
    );
  }

  return refreshSkewMs;
}

function normalizeTokenResponse(token: AccessToken | null, nowMs: number): {
  token: string;
  expiresOnTimestamp: number;
  lifetimeMs: number;
} {
  if (!token) {
    throw new PublishEngineAuthenticationError('Publish Engine access token acquisition returned no token.');
  }

  const normalizedToken = token.token.trim();
  if (normalizedToken.length === 0) {
    throw new PublishEngineAuthenticationError('Publish Engine access token is empty.');
  }

  const expiresOnTimestamp = token.expiresOnTimestamp;
  if (!Number.isFinite(expiresOnTimestamp) || expiresOnTimestamp <= 0) {
    throw new PublishEngineAuthenticationError('Publish Engine access token expiration is missing or invalid.');
  }

  if (expiresOnTimestamp <= nowMs) {
    throw new PublishEngineAuthenticationError('Publish Engine access token is already expired.');
  }

  const lifetimeMs = Math.max(1, expiresOnTimestamp - nowMs);

  return {
    token: normalizedToken,
    expiresOnTimestamp,
    lifetimeMs
  };
}

function isTokenSafelyUsable(cached: CachedToken, nowMs: number, refreshSkewMs: number): boolean {
  const remainingMs = cached.expiresOnTimestamp - nowMs;
  if (remainingMs <= 0) {
    return false;
  }

  // Refresh window uses the safer of fixed skew and 10% lifetime so short-lived
  // tokens are not invalidated immediately while still refreshing before expiry.
  const proportionalWindowMs = Math.max(
    MIN_REFRESH_WINDOW_MS,
    Math.floor(cached.lifetimeMs * 0.1)
  );
  const refreshWindowMs = Math.min(refreshSkewMs, proportionalWindowMs);

  return remainingMs > refreshWindowMs;
}

export class AzurePublishEngineAccessTokenProvider implements PublishEngineAccessTokenProvider {
  private readonly scope: string;
  private readonly refreshSkewMs: number;
  private readonly now: () => Date;

  private cachedToken: CachedToken | null = null;
  private inFlightRefresh: Promise<string> | null = null;

  public constructor(private readonly dependencies: AzurePublishEngineAccessTokenProviderDependencies) {
    this.scope = normalizeScope(dependencies.scope);
    this.refreshSkewMs = normalizeRefreshSkewMs(dependencies.refreshSkewMs);
    this.now = dependencies.now ?? (() => new Date());
  }

  public async getAccessToken(options?: { signal?: AbortSignal }): Promise<string> {
    const nowMs = this.now().getTime();
    const safeCachedToken = this.getSafelyReusableCachedToken(nowMs);
    if (safeCachedToken) {
      return safeCachedToken;
    }

    if (this.inFlightRefresh) {
      try {
        return await this.inFlightRefresh;
      } catch {
        const fallbackNowMs = this.now().getTime();
        const fallbackToken = this.getSafelyReusableCachedToken(fallbackNowMs);
        if (fallbackToken) {
          return fallbackToken;
        }

        throw new PublishEngineAuthenticationError('Publish Engine access token acquisition failed.');
      }
    }

    this.inFlightRefresh = this.acquireAndCacheToken(options);

    try {
      return await this.inFlightRefresh;
    } catch (error) {
      const fallbackNowMs = this.now().getTime();
      const fallbackToken = this.getSafelyReusableCachedToken(fallbackNowMs);
      if (fallbackToken) {
        return fallbackToken;
      }

      if (error instanceof PublishEngineAuthenticationError) {
        throw error;
      }

      throw new PublishEngineAuthenticationError('Publish Engine access token acquisition failed.', undefined, error);
    } finally {
      this.inFlightRefresh = null;
    }
  }

  private getSafelyReusableCachedToken(nowMs: number): string | null {
    if (!this.cachedToken) {
      return null;
    }

    if (!isTokenSafelyUsable(this.cachedToken, nowMs, this.refreshSkewMs)) {
      return null;
    }

    return this.cachedToken.token;
  }

  private async acquireAndCacheToken(options?: { signal?: AbortSignal }): Promise<string> {
    const requestOptions: GetTokenOptions = {
      ...(options?.signal === undefined
        ? {}
        : { abortSignal: options.signal })
    };

    let response: AccessToken | null;
    try {
      response = await this.dependencies.credential.getToken(this.scope, requestOptions);
    } catch (error) {
      throw new PublishEngineAuthenticationError('Publish Engine credential token request failed.', undefined, error);
    }

    const nowMs = this.now().getTime();
    const normalized = normalizeTokenResponse(response, nowMs);

    this.cachedToken = {
      token: normalized.token,
      expiresOnTimestamp: normalized.expiresOnTimestamp,
      acquiredAtMs: nowMs,
      lifetimeMs: normalized.lifetimeMs
    };

    return normalized.token;
  }
}
