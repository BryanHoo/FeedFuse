import type { Pool } from 'pg';
import {
  getFeedFaviconCache,
  upsertFeedFaviconCache,
  upsertFeedFaviconFailure,
} from '../repositories/feedFaviconsRepo';
import { getFeedFaviconTarget } from '../repositories/feedsRepo';
import { discoverFeedFavicon } from '../rss/discoverFeedFavicon';

export interface FeedFaviconAsset {
  contentType: string;
  body: Buffer;
  etag: string | null;
  lastModified: string | null;
  updatedAt: string;
}

const FAILED_FAVICON_RETRY_WINDOW_MS = 6 * 60 * 60 * 1000;

function buildInternalEtag(feedId: string, updatedAt: string): string {
  return `W/"feed-favicon-${feedId}-${Date.parse(updatedAt)}"`;
}

function shouldRetryFailedFetch(nextRetryAt: string | null): boolean {
  if (!nextRetryAt) {
    return true;
  }

  return Date.parse(nextRetryAt) <= Date.now();
}

export async function getOrFetchFeedFavicon(
  pool: Pool,
  feedId: string,
): Promise<FeedFaviconAsset | null> {
  const cached = await getFeedFaviconCache(pool, feedId);
  if (cached) {
    if (cached.fetchStatus === 'ready' && cached.contentType && cached.body) {
      return {
        contentType: cached.contentType,
        body: cached.body,
        etag: cached.etag ?? buildInternalEtag(feedId, cached.updatedAt),
        lastModified: cached.lastModified,
        updatedAt: cached.updatedAt,
      };
    }

    if (cached.fetchStatus === 'failed' && !shouldRetryFailedFetch(cached.nextRetryAt)) {
      return null;
    }
  }

  const feed = await getFeedFaviconTarget(pool, feedId);
  if (!feed || feed.kind !== 'rss' || !feed.siteUrl) {
    return null;
  }

  const discovered = await discoverFeedFavicon(feed.siteUrl);
  if (!discovered) {
    await upsertFeedFaviconFailure(pool, {
      feedId,
      failureReason: 'favicon_not_found',
      nextRetryAt: new Date(Date.now() + FAILED_FAVICON_RETRY_WINDOW_MS).toISOString(),
    });
    return null;
  }

  await upsertFeedFaviconCache(pool, {
    feedId,
    sourceUrl: discovered.sourceUrl,
    contentType: discovered.contentType,
    body: discovered.body,
    etag: discovered.etag,
    lastModified: discovered.lastModified,
  });

  const refreshed = await getFeedFaviconCache(pool, feedId);
  if (!refreshed || refreshed.fetchStatus !== 'ready' || !refreshed.contentType || !refreshed.body) {
    return null;
  }

  return {
    contentType: refreshed.contentType,
    body: refreshed.body,
    etag: refreshed.etag ?? buildInternalEtag(feedId, refreshed.updatedAt),
    lastModified: refreshed.lastModified,
    updatedAt: refreshed.updatedAt,
  };
}
