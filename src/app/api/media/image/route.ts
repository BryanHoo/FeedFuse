import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import sharp from 'sharp';
import { pipeline, Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { getServerEnv } from '@/server/infra/env';
import { fetchImageStream } from '@/server/infra/http/externalHttpClient';
import {
  getImageProxySecret,
  hasValidImageProxySignature,
} from '@/server/integrations/media/imageProxyUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  url: z.string().url(),
  // 转换参数必须参与签名，防止任意尺寸请求放大服务端计算开销。
  w: z.coerce.number().int().positive().max(2048).optional(),
  h: z.coerce.number().int().positive().max(2048).optional(),
  q: z.coerce.number().int().positive().max(100).optional(),
  sig: z.string().min(1),
});

const MAX_REDIRECTS = 3;

function createTransformedImageResponse(input: {
  upstream: Extract<Awaited<ReturnType<typeof fetchImageStream>>, { kind: 'ok' }>;
  width?: number;
  height?: number;
  quality?: number;
}) {
  const transformer = sharp({ failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .resize({
      width: input.width,
      height: input.height,
      fit: input.width && input.height ? 'cover' : 'inside',
      position: 'attention',
      withoutEnlargement: true,
    })
    .webp({ quality: input.quality ?? 75, effort: 4 });

  // pipeline 会双向传递错误和销毁：上游断流时及时结束响应，客户端取消时终止上游下载。
  // 普通 pipe 不转发源流错误，会导致未捕获异常；fromWeb 则确保取消能传递到 Web Stream。
  const source = Readable.fromWeb(input.upstream.body as NodeReadableStream<Uint8Array>);
  const transformedBody = pipeline(source, transformer, () => {
    // 错误已传递给输出流，由下方 Readable.toWeb 通知 Response 消费者，避免重复抛到进程级。
  });
  const headers = new Headers({
    'content-type': 'image/webp',
    'cache-control': 'public, max-age=86400, stale-while-revalidate=604800',
  });

  return new Response(Readable.toWeb(transformedBody) as ReadableStream<Uint8Array>, {
    status: input.upstream.status,
    headers,
  });
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

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

  const shouldTransform =
    upstream.status >= 200 &&
    upstream.status < 300 &&
    (parsed.data.w !== undefined || parsed.data.h !== undefined || parsed.data.q !== undefined);

  if (shouldTransform) {
    return createTransformedImageResponse({
      upstream,
      width: parsed.data.w,
      height: parsed.data.h,
      quality: parsed.data.q,
    });
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
