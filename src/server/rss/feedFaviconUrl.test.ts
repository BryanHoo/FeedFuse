import { describe, expect, it } from 'vitest';
import { buildFeedFaviconPath } from './feedFaviconUrl';

describe('buildFeedFaviconPath', () => {
  it('builds the internal feed favicon route from the feed id', () => {
    expect(buildFeedFaviconPath('123')).toBe('/api/feeds/123/favicon');
  });
});
