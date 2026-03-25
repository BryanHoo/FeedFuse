import { describe, expect, it } from 'vitest';
import { buildFeedFetchJobData, selectFeedsForRefreshAll } from './refreshAll';

describe('selectFeedsForRefreshAll', () => {
  it('selects all feeds when force is true', () => {
    const now = new Date('2026-03-01T01:00:00.000Z');
    const feeds = [
      { id: 'feed-1', fetchIntervalMinutes: 60, lastFetchedAt: '2026-03-01T00:50:00.000Z' },
      { id: 'feed-2', fetchIntervalMinutes: 60, lastFetchedAt: '2026-02-28T00:00:00.000Z' },
    ];

    expect(selectFeedsForRefreshAll(feeds, now, { force: true })).toEqual(feeds);
  });

  it('selects only due feeds when force is false', () => {
    const now = new Date('2026-03-01T01:00:00.000Z');
    const feeds = [
      { id: 'feed-1', fetchIntervalMinutes: 60, lastFetchedAt: '2026-03-01T00:30:00.000Z' },
      { id: 'feed-2', fetchIntervalMinutes: 60, lastFetchedAt: '2026-03-01T00:00:00.000Z' },
    ];

    expect(selectFeedsForRefreshAll(feeds, now, { force: false })).toEqual([feeds[1]]);
  });
});

describe('buildFeedFetchJobData', () => {
  it('omits force when force is false', () => {
    expect(buildFeedFetchJobData('feed-1', { force: false })).toEqual({ feedId: 'feed-1' });
  });

  it('includes force when force is true', () => {
    expect(buildFeedFetchJobData('feed-1', { force: true })).toEqual({
      feedId: 'feed-1',
      force: true,
    });
  });

  it('includes runId when refresh tracking is enabled', () => {
    expect(buildFeedFetchJobData('feed-1', { force: true, runId: 'run-1' })).toEqual({
      feedId: 'feed-1',
      force: true,
      runId: 'run-1',
    });
  });
});
