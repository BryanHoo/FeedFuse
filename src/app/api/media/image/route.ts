import { z } from 'zod';
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
  sig: z.string().min(1),
});

const MAX_REDIRECTS = 3;
const MAX_BYTES = 5 * 1024 * 1024;

async function fetchImage(url: string, redirects = 0): Promise<Response> {
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
    return fetchImage(nextUrl, redirects + 1);
  }

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('image/')) {
    return new Response('Unsupported media type', { status: 415 });
  }

  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }

  return new Response(bytes, {
    status: upstream.status,
    headers: {
      'content-type': contentType,
      'cache-control': upstream.headers.get('cache-control') ?? 'public, max-age=3600',
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    url: url.searchParams.get('url'),
    sig: url.searchParams.get('sig'),
  });

  if (!parsed.success) {
    return new Response('Bad request', { status: 400 });
  }

  const secret = getImageProxySecret(getServerEnv().IMAGE_PROXY_SECRET);
  if (
    !hasValidImageProxySignature({
      sourceUrl: parsed.data.url,
      signature: parsed.data.sig,
      secret,
    })
  ) {
    return new Response('Forbidden', { status: 403 });
  }

  return fetchImage(parsed.data.url);
}
