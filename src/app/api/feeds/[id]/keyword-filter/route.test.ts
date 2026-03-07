import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUiSettingsMock = vi.fn();
const updateUiSettingsMock = vi.fn();
const getFeedCategoryAssignmentMock = vi.fn();
const pool = {};

vi.mock('../../../../../server/db/pool', () => ({ getPool: () => pool }));
vi.mock('../../../../../server/repositories/settingsRepo', () => ({
  getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
  updateUiSettings: (...args: unknown[]) => updateUiSettingsMock(...args),
}));
vi.mock('../../../../../server/repositories/feedsRepo', () => ({
  getFeedCategoryAssignment: (...args: unknown[]) => getFeedCategoryAssignmentMock(...args),
}));

describe('/api/feeds/[id]/keyword-filter', () => {
  beforeEach(() => {
    getUiSettingsMock.mockReset();
    updateUiSettingsMock.mockReset();
    getFeedCategoryAssignmentMock.mockReset();
  });

  it('PATCH stores keywords for a feed and returns normalized values', async () => {
    getFeedCategoryAssignmentMock.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      categoryId: null,
    });
    getUiSettingsMock.mockResolvedValue({
      rss: { articleKeywordFilter: { globalKeywords: [], feedKeywordsByFeedId: {} } },
    });
    updateUiSettingsMock.mockResolvedValue({
      rss: {
        articleKeywordFilter: {
          globalKeywords: [],
          feedKeywordsByFeedId: {
            '11111111-1111-4111-8111-111111111111': ['Sponsored'],
          },
        },
      },
    });

    const mod = await import('./route');
    const res = await mod.PATCH(
      new Request('http://localhost/api/feeds/11111111-1111-4111-8111-111111111111/keyword-filter', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keywords: [' Sponsored ', 'sponsored'] }),
      }),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.keywords).toEqual(['Sponsored']);
  });
});
