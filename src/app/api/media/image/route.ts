import { z } from 'zod';
import { getServerEnv } from '../../../../server/env';
import { fetchImageStream } from '../../../../server/http/externalHttpClient';
import {
  getImageProxySecret,
  hasValidImageProxySignature,
} from '../../../../server/media/imageProxyUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  url: z.string().url(),
  // Keep legacy transform params in the signature contract for previously issued URLs.
  w: z.coerce.number().int().positive().max(2048).optional(),
  h: z.coerce.number().int().positive().max(2048).optional(),
  q: z.coerce.number().int().positive().max(100).optional(),
  sig: z.string().min(1),
});

const MAX_REDIRECTS = 3;

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

  const upstream = await fetchImageStream(parsed.data.url, {
    maxRedirects: MAX_REDIRECTS,
    userAgent: 'FeedFuse Image Proxy/1.0',
  });

  if (upstream.kind === 'forbidden') {
    return new Response('Forbidden', { status: 403 });
  }

  if (upstream.kind === 'too_many_redirects') {
    return new Response('Too many redirects', { status: 502 });
  }

  if (upstream.kind === 'bad_gateway') {
    return new Response('Bad gateway', { status: 502 });
  }

  if (upstream.kind === 'unsupported_media_type') {
    return new Response('Unsupported media type', { status: 415 });
  }

  const headers = new Headers();
  if (upstream.contentType) headers.set('content-type', upstream.contentType);
  headers.set('cache-control', upstream.cacheControl);
  if (upstream.contentEncoding) headers.set('content-encoding', upstream.contentEncoding);
  if (upstream.contentLength) headers.set('content-length', upstream.contentLength);
  if (upstream.etag) headers.set('etag', upstream.etag);
  if (upstream.lastModified) headers.set('last-modified', upstream.lastModified);

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
