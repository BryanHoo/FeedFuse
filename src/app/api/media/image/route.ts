import { z } from 'zod';
import sharp from 'sharp';
import { getServerEnv } from '../../../../server/env';
import {
  getImageProxySecret,
  hasValidImageProxySignature,
} from '../../../../server/media/imageProxyUrl';
import { isSafeMediaUrl } from '../../../../server/media/mediaProxyGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  url: z.string().url(),
  w: z.coerce.number().int().positive().max(2048).optional(),
  h: z.coerce.number().int().positive().max(2048).optional(),
  q: z.coerce.number().int().positive().max(100).optional(),
  sig: z.string().min(1),
});

const MAX_REDIRECTS = 3;
const MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_TRANSFORM_QUALITY = 75;
const PASSTHROUGH_TRANSFORM_CONTENT_TYPES = new Set(['image/gif', 'image/svg+xml']);

function normalizeContentType(contentType: string): string {
  return contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

async function maybeTransformImage(input: {
  bytes: ArrayBuffer;
  contentType: string;
  width?: number;
  height?: number;
  quality?: number;
}): Promise<{ bytes: Blob; contentType: string }> {
  const { bytes, contentType, width, height, quality } = input;
  const sourceBytes = new Uint8Array(bytes);
  const sourceBlob = new Blob([sourceBytes]);

  if (width === undefined && height === undefined && quality === undefined) {
    return { bytes: sourceBlob, contentType };
  }

  const normalizedContentType = normalizeContentType(contentType);
  if (PASSTHROUGH_TRANSFORM_CONTENT_TYPES.has(normalizedContentType)) {
    return { bytes: sourceBlob, contentType };
  }

  try {
    let pipeline = sharp(sourceBytes);

    if (width !== undefined || height !== undefined) {
      pipeline = pipeline.resize({
        width,
        height,
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: true,
      });
    }

    const transformed = await pipeline
      .webp({ quality: quality ?? DEFAULT_TRANSFORM_QUALITY })
      .toBuffer();
    const transformedBytes = Uint8Array.from(transformed);

    return {
      bytes: new Blob([transformedBytes]),
      contentType: 'image/webp',
    };
  } catch {
    return { bytes: sourceBlob, contentType };
  }
}

async function fetchImage(
  url: string,
  transform: { width?: number; height?: number; quality?: number },
  redirects = 0,
): Promise<Response> {
  if (!(await isSafeMediaUrl(url))) {
    return new Response('Forbidden', { status: 403 });
  }

  const upstream = await fetch(url, {
    redirect: 'manual',
    headers: {
      'user-agent': 'FeedFuse Image Proxy/1.0',
      accept: 'image/*,*/*;q=0.8',
    },
  }).catch(() => new Response('Bad gateway', { status: 502 }));

  if ([301, 302, 303, 307, 308].includes(upstream.status)) {
    if (redirects >= MAX_REDIRECTS) {
      return new Response('Too many redirects', { status: 502 });
    }

    const location = upstream.headers.get('location');
    if (!location) {
      return new Response('Bad gateway', { status: 502 });
    }

    const nextUrl = new URL(location, url).toString();
    return fetchImage(nextUrl, transform, redirects + 1);
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('image/')) {
    return new Response('Unsupported media type', { status: 415 });
  }

  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }

  const transformed = await maybeTransformImage({
    bytes,
    contentType,
    width: transform.width,
    height: transform.height,
    quality: transform.quality,
  });

  return new Response(transformed.bytes, {
    status: upstream.status,
    headers: {
      'content-type': transformed.contentType,
      'cache-control': upstream.headers.get('cache-control') ?? 'public, max-age=3600',
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    url: url.searchParams.get('url'),
    w: url.searchParams.get('w') ?? undefined,
    h: url.searchParams.get('h') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    sig: url.searchParams.get('sig'),
  });

  if (!parsed.success) {
    return new Response('Bad request', { status: 400 });
  }

  const secret = getImageProxySecret(getServerEnv().IMAGE_PROXY_SECRET);
  if (
    !hasValidImageProxySignature({
      sourceUrl: parsed.data.url,
      width: parsed.data.w,
      height: parsed.data.h,
      quality: parsed.data.q,
      signature: parsed.data.sig,
      secret,
    })
  ) {
    return new Response('Forbidden', { status: 403 });
  }

  return fetchImage(parsed.data.url, {
    width: parsed.data.w,
    height: parsed.data.h,
    quality: parsed.data.q,
  });
}
