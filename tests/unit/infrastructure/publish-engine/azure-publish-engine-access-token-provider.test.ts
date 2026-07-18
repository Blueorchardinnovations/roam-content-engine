import { describe, expect, it, vi } from 'vitest';
import type { TokenCredential } from '@azure/core-auth';

import { AzurePublishEngineAccessTokenProvider } from '../../../../src/infrastructure/publish-engine/azure-publish-engine-access-token-provider.js';
import { PublishEngineAuthenticationError } from '../../../../src/infrastructure/publish-engine/publish-engine-errors.js';

function createClock(initialMs = Date.UTC(2026, 0, 1, 0, 0, 0)): {
  now: () => Date;
  advance: (ms: number) => void;
} {
  let current = initialMs;

  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    }
  };
}

function createCredential(
  implementation: Parameters<typeof vi.fn>[0]
): TokenCredential & { getToken: ReturnType<typeof vi.fn> } {
  const getToken = vi.fn(implementation);

  return {
    getToken
  } as TokenCredential & { getToken: ReturnType<typeof vi.fn> };
}

describe('azure publish engine access token provider', () => {
  it('obtains and returns a token on first request', async () => {
    const clock = createClock();
    const credential = createCredential(async () => ({
      token: 'token-first',
      expiresOnTimestamp: clock.now().getTime() + 600_000
    }));

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now
    });

    await expect(provider.getAccessToken()).resolves.toBe('token-first');
    expect(credential.getToken).toHaveBeenCalledTimes(1);
  });

  it('reuses a safely valid cached token without calling credential again', async () => {
    const clock = createClock();
    const credential = createCredential(async () => ({
      token: 'token-cache',
      expiresOnTimestamp: clock.now().getTime() + 600_000
    }));

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now
    });

    await expect(provider.getAccessToken()).resolves.toBe('token-cache');
    await expect(provider.getAccessToken()).resolves.toBe('token-cache');

    expect(credential.getToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes token before expiry when inside refresh window', async () => {
    const clock = createClock();
    let issued = 0;

    const credential = createCredential(async () => {
      issued += 1;
      return {
        token: `token-${issued}`,
        expiresOnTimestamp: clock.now().getTime() + 600_000
      };
    });

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now,
      refreshSkewMs: 300_000
    });

    await expect(provider.getAccessToken()).resolves.toBe('token-1');
    clock.advance(570_000);
    await expect(provider.getAccessToken()).resolves.toBe('token-2');

    expect(credential.getToken).toHaveBeenCalledTimes(2);
  });

  it('honors configured fixed refresh skew', async () => {
    const clock = createClock();
    let issued = 0;

    const credential = createCredential(async () => {
      issued += 1;
      return {
        token: `token-${issued}`,
        expiresOnTimestamp: clock.now().getTime() + 40_000
      };
    });

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now,
      refreshSkewMs: 5_000
    });

    await expect(provider.getAccessToken()).resolves.toBe('token-1');
    clock.advance(34_000);
    await expect(provider.getAccessToken()).resolves.toBe('token-1');
    clock.advance(2_000);
    await expect(provider.getAccessToken()).resolves.toBe('token-2');
  });

  it('uses proportional window for short-lived tokens and avoids immediate invalidation', async () => {
    const clock = createClock();
    let issued = 0;

    const credential = createCredential(async () => {
      issued += 1;
      return {
        token: `short-${issued}`,
        expiresOnTimestamp: clock.now().getTime() + 10_000
      };
    });

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now,
      refreshSkewMs: 300_000
    });

    await expect(provider.getAccessToken()).resolves.toBe('short-1');
    clock.advance(8_500);
    await expect(provider.getAccessToken()).resolves.toBe('short-1');
    clock.advance(600);
    await expect(provider.getAccessToken()).resolves.toBe('short-2');
  });

  it('never returns an expired cached token', async () => {
    const clock = createClock();
    let issued = 0;

    const credential = createCredential(async () => {
      issued += 1;
      return {
        token: `exp-${issued}`,
        expiresOnTimestamp: clock.now().getTime() + 5_000
      };
    });

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now,
      refreshSkewMs: 0
    });

    await expect(provider.getAccessToken()).resolves.toBe('exp-1');
    clock.advance(6_000);
    await expect(provider.getAccessToken()).resolves.toBe('exp-2');
  });

  it('rejects missing token responses', async () => {
    const clock = createClock();
    const credential = createCredential(async () => null);

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now
    });

    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(PublishEngineAuthenticationError);
  });

  it('rejects empty token responses', async () => {
    const clock = createClock();
    const credential = createCredential(async () => ({
      token: '   ',
      expiresOnTimestamp: clock.now().getTime() + 5_000
    }));

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now
    });

    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(PublishEngineAuthenticationError);
  });

  it('rejects token responses with invalid expiration values', async () => {
    const clock = createClock();
    const credential = createCredential(async () => ({
      token: 'bad-exp',
      expiresOnTimestamp: Number.NaN
    }));

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now
    });

    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(PublishEngineAuthenticationError);
  });

  it('rejects already expired token responses', async () => {
    const clock = createClock();
    const credential = createCredential(async () => ({
      token: 'expired',
      expiresOnTimestamp: clock.now().getTime() - 1
    }));

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now
    });

    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(PublishEngineAuthenticationError);
  });

  it('deduplicates concurrent refresh calls behind one in-flight promise', async () => {
    const clock = createClock();
    let resolver: ((value: { token: string; expiresOnTimestamp: number }) => void) | null = null;

    const credential = createCredential(async () => await new Promise<{ token: string; expiresOnTimestamp: number }>((resolvePromise) => {
      resolver = resolvePromise;
    }));

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now
    });

    const first = provider.getAccessToken();
    const second = provider.getAccessToken();

    resolver!({
      token: 'deduped-token',
      expiresOnTimestamp: clock.now().getTime() + 60_000
    });

    await expect(first).resolves.toBe('deduped-token');
    await expect(second).resolves.toBe('deduped-token');
    expect(credential.getToken).toHaveBeenCalledTimes(1);
  });

  it('clears in-flight refresh after failure and allows later retry', async () => {
    const clock = createClock();
    let attempts = 0;

    const credential = createCredential(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('first failure');
      }

      return {
        token: 'retry-success',
        expiresOnTimestamp: clock.now().getTime() + 60_000
      };
    });

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now
    });

    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(PublishEngineAuthenticationError);
    await expect(provider.getAccessToken()).resolves.toBe('retry-success');
    expect(credential.getToken).toHaveBeenCalledTimes(2);
  });

  it('returns cached token on refresh failure only when it remains safely reusable', async () => {
    const clock = createClock();
    let attempts = 0;

    const credential = createCredential(async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          token: 'safe-cache',
          expiresOnTimestamp: clock.now().getTime() + 120_000
        };
      }

      // Simulate time skew correction while refresh fails so cached token remains
      // outside the effective refresh window at fallback evaluation.
      clock.advance(-2_000);

      throw new Error('refresh failure');
    });

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now,
      refreshSkewMs: 300_000
    });

    await expect(provider.getAccessToken()).resolves.toBe('safe-cache');
    clock.advance(109_000);
    await expect(provider.getAccessToken()).resolves.toBe('safe-cache');
  });

  it('does not return unexpired cached token on refresh failure when token is already inside refresh window', async () => {
    const clock = createClock();
    let attempts = 0;

    const credential = createCredential(async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          token: 'inside-window-token',
          expiresOnTimestamp: clock.now().getTime() + 120_000
        };
      }

      throw new Error('refresh failure');
    });

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now,
      refreshSkewMs: 300_000
    });

    await expect(provider.getAccessToken()).resolves.toBe('inside-window-token');
    clock.advance(109_000);

    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(PublishEngineAuthenticationError);
  });

  it('fails authentication when refresh fails and there is no safe cached token', async () => {
    const clock = createClock();
    let attempts = 0;

    const credential = createCredential(async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          token: 'cache-first',
          expiresOnTimestamp: clock.now().getTime() + 2_000
        };
      }

      throw new Error('refresh failure');
    });

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now,
      refreshSkewMs: 0
    });

    await expect(provider.getAccessToken()).resolves.toBe('cache-first');
    clock.advance(3_000);
    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(PublishEngineAuthenticationError);
  });

  it('does not expose token values in authentication errors', async () => {
    const clock = createClock();
    const credential = createCredential(async () => ({
      token: 'super-secret-token-value',
      expiresOnTimestamp: clock.now().getTime() - 1
    }));

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now
    });

    await expect(provider.getAccessToken()).rejects.toThrowError(/already expired|acquisition failed/i);

    try {
      await provider.getAccessToken();
      throw new Error('Expected token acquisition to fail.');
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-token-value');
    }
  });

  it('never exposes credential objects through returned values', async () => {
    const clock = createClock();
    const credential = createCredential(async () => ({
      token: 'token-only',
      expiresOnTimestamp: clock.now().getTime() + 10_000
    }));

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now
    });

    const token = await provider.getAccessToken();
    expect(token).toBe('token-only');
    expect(typeof token).toBe('string');
    expect((token as unknown as { credential?: unknown }).credential).toBeUndefined();
  });

  it('forwards abort signal to credential getToken options', async () => {
    const clock = createClock();
    const credential = createCredential(async () => ({
      token: 'signal-token',
      expiresOnTimestamp: clock.now().getTime() + 10_000
    }));

    const provider = new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now
    });

    const controller = new AbortController();
    await provider.getAccessToken({ signal: controller.signal });

    const callOptions = credential.getToken.mock.calls[0]?.[1] as { abortSignal?: AbortSignal };
    expect(callOptions.abortSignal).toBe(controller.signal);
  });

  it('rejects invalid provider configuration with non-empty scope and bounded skew', () => {
    const clock = createClock();
    const credential = createCredential(async () => ({
      token: 'token',
      expiresOnTimestamp: clock.now().getTime() + 10_000
    }));

    expect(() => new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: '   ',
      now: clock.now
    })).toThrowError(/scope is required/i);

    expect(() => new AzurePublishEngineAccessTokenProvider({
      credential,
      scope: 'api://publish/.default',
      now: clock.now,
      refreshSkewMs: -1
    })).toThrowError(/refresh skew/i);
  });
});
