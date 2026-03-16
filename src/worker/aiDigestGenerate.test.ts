import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('runAiDigestGenerate', () => {
  it('marks skipped_no_updates and advances last_window_end_at when no candidates', async () => {
    const pool = { query: vi.fn() } as unknown as Pool;

    const getAiDigestRunByIdMock = vi.fn().mockResolvedValue({
      id: 'run-1',
      feedId: 'feed-ai',
      windowStartAt: '2026-03-14T00:00:00.000Z',
      windowEndAt: '2026-03-14T01:00:00.000Z',
      status: 'queued',
      candidateTotal: 0,
      selectedCount: 0,
      articleId: null,
      model: null,
      errorCode: null,
      errorMessage: null,
      jobId: null,
      createdAt: '2026-03-14T00:00:00.000Z',
      updatedAt: '2026-03-14T00:00:00.000Z',
    });

    const getAiDigestConfigByFeedIdMock = vi.fn().mockResolvedValue({
      feedId: 'feed-ai',
      prompt: '请解读本时间窗口内的更新',
      intervalMinutes: 60,
      topN: 10,
      selectedFeedIds: ['feed-rss-1'],
      selectedCategoryIds: [],
      lastWindowEndAt: '2026-03-14T00:00:00.000Z',
      createdAt: '2026-03-14T00:00:00.000Z',
      updatedAt: '2026-03-14T00:00:00.000Z',
    });

    const listFeedsMock = vi.fn().mockResolvedValue([
      { id: 'feed-ai', kind: 'ai_digest', title: 'AI解读', categoryId: null },
      { id: 'feed-rss-1', kind: 'rss', title: 'RSS 1', categoryId: null },
    ]);

    const listAiDigestCandidateArticlesMock = vi.fn().mockResolvedValue([]);
    const updateAiDigestRunMock = vi.fn().mockResolvedValue(undefined);
    const updateAiDigestConfigLastWindowEndAtMock = vi.fn().mockResolvedValue(undefined);

    const { runAiDigestGenerate } = await import('./aiDigestGenerate');
    await runAiDigestGenerate({
      pool,
      runId: 'run-1',
      jobId: null,
      isFinalAttempt: true,
      deps: {
        getAiDigestRunById: getAiDigestRunByIdMock,
        getAiDigestConfigByFeedId: getAiDigestConfigByFeedIdMock,
        listFeeds: listFeedsMock as never,
        listAiDigestCandidateArticles: listAiDigestCandidateArticlesMock,
        updateAiDigestRun: updateAiDigestRunMock,
        updateAiDigestConfigLastWindowEndAt: updateAiDigestConfigLastWindowEndAtMock,
      },
    });

    expect(updateAiDigestRunMock).toHaveBeenCalledWith(
      pool,
      'run-1',
      expect.objectContaining({ status: 'skipped_no_updates' }),
    );
    expect(updateAiDigestConfigLastWindowEndAtMock).toHaveBeenCalledWith(
      pool,
      'feed-ai',
      '2026-03-14T01:00:00.000Z',
    );
  });
});

