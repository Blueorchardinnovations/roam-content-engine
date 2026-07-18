const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

function parseAbsoluteUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error('URL is malformed.');
  }
}

function validateParsedAbsoluteUrl(url: URL): void {
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error('Embedded URL credentials are not allowed.');
  }

  const protocol = url.protocol.toLowerCase();

  if (protocol === 'http:' || protocol === 'https:') {
    if (url.hostname.trim().length === 0) {
      throw new Error('URL host is invalid.');
    }

    if (url.port.length > 0) {
      const parsedPort = Number(url.port);

      if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        throw new Error('URL port is invalid.');
      }
    }
  }
}

function decodeOnceIfPossible(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeForSchemeCheck(raw: string): string {
  const trimmed = raw.trim();
  const decoded = decodeOnceIfPossible(trimmed);
  return decoded.toLowerCase();
}

function hasUnsafeScheme(value: string): boolean {
  const normalized = normalizeForSchemeCheck(value);
  return /^(javascript|data|file|vbscript|blob|chrome|about)\s*:/.test(normalized);
}

function hasSafeScheme(value: string, allowedSchemes: readonly string[]): boolean {
  const normalized = normalizeForSchemeCheck(value);
  return allowedSchemes.some((scheme) => normalized.startsWith(`${scheme.toLowerCase()}:`));
}

export function sanitizeUrlInput(value: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error('URL must not be empty.');
  }

  if (CONTROL_CHARACTERS.test(normalized)) {
    throw new Error('URL contains control characters.');
  }

  if (normalized.startsWith('//')) {
    throw new Error('Protocol-relative URLs are not allowed.');
  }

  if (hasUnsafeScheme(normalized)) {
    throw new Error('Unsafe URL scheme is not allowed.');
  }

  return normalized;
}

export function assertSafeExternalUrl(value: string, allowedSchemes: readonly string[] = ['https', 'http', 'mailto']): string {
  const normalized = sanitizeUrlInput(value);

  if (!hasSafeScheme(normalized, allowedSchemes)) {
    throw new Error('URL scheme is not allowed.');
  }

  const parsed = parseAbsoluteUrl(normalized);
  validateParsedAbsoluteUrl(parsed);

  return normalized;
}

export function assertSafeAssetUrl(value: string, allowedSchemes: readonly string[] = ['https', 'http', 'asset']): string {
  const normalized = sanitizeUrlInput(value);

  if (!hasSafeScheme(normalized, allowedSchemes)) {
    throw new Error('Asset URL scheme is not allowed.');
  }

  const parsed = parseAbsoluteUrl(normalized);
  validateParsedAbsoluteUrl(parsed);

  if (parsed.protocol.toLowerCase() === 'asset:') {
    const hasHost = parsed.hostname.trim().length > 0;
    const hasPath = parsed.pathname.trim().length > 0;

    if (!hasHost && !hasPath) {
      throw new Error('Asset URL path is invalid.');
    }
  }

  return normalized;
}

export function assertSafeInternalHref(value: string): string {
  const normalized = sanitizeUrlInput(value);

  if (!normalized.startsWith('#')) {
    throw new Error('Internal href must start with #.');
  }

  const target = normalized.slice(1);

  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(target)) {
    throw new Error('Internal href target is invalid.');
  }

  return normalized;
}
