import { createHmac, timingSafeEqual } from 'node:crypto';

const IMAGE_PROXY_ROUTE_PATH = '/api/media/image';

type ImageProxyTransformOptions = {
  width?: number;
  height?: number;
  quality?: number;
};

function normalizeSourceUrl(sourceUrl: string): string {
  return new URL(sourceUrl).toString();
}

function buildSignedImageProxyParams(input: { sourceUrl: string } & ImageProxyTransformOptions) {
  const params = new URLSearchParams({
    url: normalizeSourceUrl(input.sourceUrl),
  });

  if (input.width !== undefined) {
    params.set('w', String(input.width));
  }

  if (input.height !== undefined) {
    params.set('h', String(input.height));
  }

  if (input.quality !== undefined) {
    params.set('q', String(input.quality));
  }

  return params;
}

function signSourceUrl(input: { sourceUrl: string; secret: string } & ImageProxyTransformOptions): string {
  return createHmac('sha256', input.secret)
    .update(buildSignedImageProxyParams(input).toString())
    .digest('base64url');
}

export function buildImageProxyUrl(
  input: { sourceUrl: string; secret: string } & ImageProxyTransformOptions,
): string {
  const params = buildSignedImageProxyParams(input);
  params.set('sig', signSourceUrl(input));

  return `${IMAGE_PROXY_ROUTE_PATH}?${params.toString()}`;
}

export function hasValidImageProxySignature(input: {
  sourceUrl: string;
  width?: number;
  height?: number;
  quality?: number;
  signature: string;
  secret: string;
}): boolean {
  const expected = signSourceUrl(input);
  const actual = input.signature;

  if (expected.length !== actual.length) return false;

  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function getOptionalImageProxySecret(secretFromEnv: string | undefined): string | undefined {
  const secret = secretFromEnv?.trim();
  return secret ? secret : undefined;
}

export function getImageProxySecret(secretFromEnv: string | undefined): string {
  const secret = secretFromEnv?.trim();
  if (!secret) {
    throw new Error('IMAGE_PROXY_SECRET is required');
  }

  return secret;
}
