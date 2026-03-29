import { requireApiSession } from '@/server/auth/session';
import { getPool } from '../../../../../server/db/pool';
import { numericIdSchema } from '../../../../../server/http/idSchemas';
import { getOrFetchFeedFavicon } from '../../../../../server/services/feedFaviconService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FAVICON_CACHE_CONTROL = 'private, no-cache';

function isFreshByEtag(request: Request, etag: string | null): boolean {
  if (!etag) {
    return false;
  }

  return request.headers.get('if-none-match') === etag;
}

function isFreshByLastModified(request: Request, lastModified: string | null): boolean {
  if (!lastModified) {
    return false;
  }

  return request.headers.get('if-modified-since') === lastModified;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  const params = await context.params;
  const parsedParams = numericIdSchema.safeParse(params.id);
  if (!parsedParams.success) {
    return new Response('Bad request', { status: 400 });
  }

  const asset = await getOrFetchFeedFavicon(getPool(), parsedParams.data);
  if (!asset) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'cache-control': FAVICON_CACHE_CONTROL,
      },
    });
  }

  if (isFreshByEtag(request, asset.etag) || isFreshByLastModified(request, asset.lastModified)) {
    const headers = new Headers();
    headers.set('cache-control', FAVICON_CACHE_CONTROL);
    if (asset.etag) headers.set('etag', asset.etag);
    if (asset.lastModified) headers.set('last-modified', asset.lastModified);
    return new Response(null, { status: 304, headers });
  }

  const headers = new Headers({
    'cache-control': FAVICON_CACHE_CONTROL,
    'content-length': String(asset.body.byteLength),
    'content-type': asset.contentType,
  });
  if (asset.etag) headers.set('etag', asset.etag);
  if (asset.lastModified) headers.set('last-modified', asset.lastModified);

  const body = new ArrayBuffer(asset.body.byteLength);
  new Uint8Array(body).set(asset.body);

  return new Response(body, {
    status: 200,
    headers,
  });
}
