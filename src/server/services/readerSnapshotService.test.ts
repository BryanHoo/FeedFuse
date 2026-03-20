import { describe, expect, it } from 'vitest';
import { buildArticleFilter, decodeCursor, encodeCursor } from './readerSnapshotService';
import { AI_DIGEST_VIEW_ID } from '../../lib/view';

const RSS_ONLY = "feed_id in (select id from feeds where kind = 'rss')";
const AI_DIGEST_ONLY = "feed_id in (select id from feeds where kind = 'ai_digest')";

describe('readerSnapshotService', () => {
  it('filters unread view and excludes ai_digest', () => {
    const filter = buildArticleFilter({ view: 'unread' });
    expect(filter.whereSql).toMatch(/is_read = false/);
    expect(filter.whereSql).toContain(RSS_ONLY);
  });

  it('filters starred view and excludes ai_digest', () => {
    const filter = buildArticleFilter({ view: 'starred' });
    expect(filter.whereSql).toMatch(/is_starred = true/);
    expect(filter.whereSql).toContain(RSS_ONLY);
  });

  it('filters all view and excludes ai_digest', () => {
    const filter = buildArticleFilter({ view: 'all' });
    expect(filter.whereSql).toContain(RSS_ONLY);
    expect(filter.whereSql).toContain('filter_status = any');
    expect(filter.params[0]).toEqual(['passed', 'error']);
  });

  it('filters ai-digest smart view and only returns ai_digest feeds', () => {
    const filter = buildArticleFilter({ view: AI_DIGEST_VIEW_ID });
    expect(filter.whereSql).toContain(AI_DIGEST_ONLY);
    expect(filter.whereSql).not.toContain(RSS_ONLY);
  });

  it('does not force rss-only when viewing a specific feedId', () => {
    const filter = buildArticleFilter({ view: 'feed-id-1' });
    expect(filter.whereSql).toMatch(/feed_id/);
    expect(filter.whereSql).not.toContain(RSS_ONLY);
    expect(filter.whereSql).not.toContain(AI_DIGEST_ONLY);
  });

  it('allows filtered articles only for a single feed when includeFiltered=true', () => {
    const filter = buildArticleFilter({ view: 'feed-id-1', includeFiltered: true });
    expect(filter.params[1]).toEqual(['passed', 'error', 'filtered']);

    const aggregate = buildArticleFilter({ view: 'all', includeFiltered: true });
    expect(aggregate.params[0]).toEqual(['passed', 'error']);
  });

  it('roundtrips cursor', () => {
    const cursor = encodeCursor({ publishedAt: '2026-01-01T00:00:00.000Z', id: 'id-1' });
    expect(decodeCursor(cursor)).toEqual({
      publishedAt: '2026-01-01T00:00:00.000Z',
      id: 'id-1',
    });
  });
});
