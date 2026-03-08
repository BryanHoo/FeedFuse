import { createHmac, timingSafeEqual } from 'node:crypto';

const IMAGE_PROXY_ROUTE_PATH = '/api/media/image';

function normalizeSourceUrl(sourceUrl: string): string {
  return new URL(sourceUrl).toString();
}

function signSourceUrl(sourceUrl: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(normalizeSourceUrl(sourceUrl))
    .digest('base64url');
}

export function buildImageProxyUrl(input: { sourceUrl: string; secret: string }): string {
  const normalized = normalizeSourceUrl(input.sourceUrl);
  const params = new URLSearchParams({
    url: normalized,
    sig: signSourceUrl(normalized, input.secret),
  });

  return `${IMAGE_PROXY_ROUTE_PATH}?${params.toString()}`;
}

export function hasValidImageProxySignature(input: {
  sourceUrl: string;
  signature: string;
  secret: string;
}): boolean {
  const expected = signSourceUrl(input.sourceUrl, input.secret);
  const actual = input.signature;

  if (expected.length !== actual.length) return false;

  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function getImageProxySecret(secretFromEnv: string | undefined): string {
  const secret = secretFromEnv?.trim();
  if (!secret) {
    throw new Error('IMAGE_PROXY_SECRET is required');
  }

  return secret;
}
