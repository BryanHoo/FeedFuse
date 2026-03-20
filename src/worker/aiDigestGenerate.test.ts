import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const writeSystemLogMock = vi.fn();

vi.mock('../server/logging/systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));

describe('runAiDigestGenerate', () => {
  it('marks skipped_no_updates and advances last_window_end_at when no candidates', async () => {
    writeSystemLogMock.mockReset();
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

  it('uses selectedFeedIds only when resolving target feeds', async () => {
    writeSystemLogMock.mockReset();
    const pool = { query: vi.fn() } as unknown as Pool;

    const getAiDigestRunByIdMock = vi.fn().mockResolvedValue({
      id: 'run-2',
      feedId: 'feed-ai',
      windowStartAt: '2026-03-15T00:00:00.000Z',
      windowEndAt: '2026-03-15T01:00:00.000Z',
      status: 'queued',
      candidateTotal: 0,
      selectedCount: 0,
      articleId: null,
      model: null,
      errorCode: null,
      errorMessage: null,
      jobId: null,
      createdAt: '2026-03-15T00:00:00.000Z',
      updatedAt: '2026-03-15T00:00:00.000Z',
    });

    const getAiDigestConfigByFeedIdMock = vi.fn().mockResolvedValue({
      feedId: 'feed-ai',
      prompt: 'x',
      intervalMinutes: 60,
      topN: 10,
      selectedFeedIds: [],
      selectedCategoryIds: ['cat-tech'],
      lastWindowEndAt: '2026-03-15T00:00:00.000Z',
      createdAt: '2026-03-15T00:00:00.000Z',
      updatedAt: '2026-03-15T00:00:00.000Z',
    });

    const listFeedsMock = vi.fn().mockResolvedValue([
      { id: 'feed-ai', kind: 'ai_digest', title: 'AI解读', categoryId: null },
      { id: 'feed-rss-1', kind: 'rss', title: 'RSS 1', categoryId: 'cat-tech' },
    ]);
    const listAiDigestCandidateArticlesMock = vi.fn().mockResolvedValue([]);
    const updateAiDigestRunMock = vi.fn().mockResolvedValue(undefined);
    const updateAiDigestConfigLastWindowEndAtMock = vi.fn().mockResolvedValue(undefined);

    const { runAiDigestGenerate } = await import('./aiDigestGenerate');
    await runAiDigestGenerate({
      pool,
      runId: 'run-2',
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

    expect(listAiDigestCandidateArticlesMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ targetFeedIds: [] }),
    );
  });

  it('persists selected source article ids with deterministic positions on success', async () => {
    writeSystemLogMock.mockReset();
    const replaceAiDigestRunSourcesMock = vi.fn().mockResolvedValue(undefined);
    const insertArticleIgnoreDuplicateMock = vi.fn().mockResolvedValue({ id: 'digest-article-1' });
    const pool = { query: vi.fn() } as unknown as Pool;

    const { runAiDigestGenerate } = await import('./aiDigestGenerate');
    await runAiDigestGenerate({
      pool,
      runId: 'run-3',
      jobId: null,
      isFinalAttempt: true,
      deps: {
        getAiDigestRunById: vi.fn().mockResolvedValue({
          id: 'run-3',
          feedId: 'feed-ai',
          windowStartAt: '2026-03-17T00:00:00.000Z',
          windowEndAt: '2026-03-17T01:00:00.000Z',
          status: 'queued',
        }),
        getAiDigestConfigByFeedId: vi.fn().mockResolvedValue({
          feedId: 'feed-ai',
          prompt: 'x',
          intervalMinutes: 60,
          topN: 2,
          selectedFeedIds: ['feed-rss-1'],
          selectedCategoryIds: [],
        }),
        listFeeds: vi.fn().mockResolvedValue([
          { id: 'feed-ai', kind: 'ai_digest', title: 'AI解读', categoryId: null },
          { id: 'feed-rss-1', kind: 'rss', title: 'RSS 1', categoryId: null },
        ]) as never,
        listAiDigestCandidateArticles: vi.fn().mockResolvedValue([
          {
            id: 'candidate-1',
            feedTitle: 'RSS 1',
            title: '来源1',
            summary: 's1',
            link: null,
            fetchedAt: '2026-03-17T00:30:00.000Z',
            contentFullHtml: null,
          },
          {
            id: 'candidate-2',
            feedTitle: 'RSS 1',
            title: '来源2',
            summary: 's2',
            link: null,
            fetchedAt: '2026-03-17T00:20:00.000Z',
            contentFullHtml: null,
          },
        ]),
        updateAiDigestRun: vi.fn().mockResolvedValue(undefined),
        updateAiDigestConfigLastWindowEndAt: vi.fn().mockResolvedValue(undefined),
        getAiApiKey: vi.fn().mockResolvedValue('k'),
        getUiSettings: vi.fn().mockResolvedValue({}),
        aiDigestRerank: vi.fn().mockResolvedValue(['candidate-1', 'candidate-2']),
        aiDigestCompose: vi.fn().mockResolvedValue({ title: 'Digest', html: '<p>digest</p>' }),
        sanitizeContent: vi.fn().mockReturnValue('<p>digest</p>'),
        insertArticleIgnoreDuplicate: insertArticleIgnoreDuplicateMock,
        queryArticleIdByDedupeKey: vi.fn().mockResolvedValue('digest-article-1'),
        replaceAiDigestRunSources: replaceAiDigestRunSourcesMock,
      },
    });

    expect(replaceAiDigestRunSourcesMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        runId: 'run-3',
        sources: [
          { sourceArticleId: 'candidate-1', position: 0 },
          { sourceArticleId: 'candidate-2', position: 1 },
        ],
      }),
    );
    expect(insertArticleIgnoreDuplicateMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        filterStatus: 'passed',
        isFiltered: false,
        filteredBy: [],
        filterErrorMessage: null,
      }),
    );
    expect(writeSystemLogMock).toHaveBeenNthCalledWith(
      1,
      pool,
      expect.objectContaining({ message: 'AI digest started' }),
    );
    expect(writeSystemLogMock).toHaveBeenNthCalledWith(
      2,
      pool,
      expect.objectContaining({ message: 'AI digest succeeded' }),
    );
  });

  it('writes failed lifecycle logs when digest generation throws', async () => {
    writeSystemLogMock.mockReset();
    const updateAiDigestRunMock = vi.fn().mockResolvedValue(undefined);
    const pool = { query: vi.fn() } as unknown as Pool;

    const { runAiDigestGenerate } = await import('./aiDigestGenerate');
    await expect(
      runAiDigestGenerate({
        pool,
        runId: 'run-4',
        jobId: 'job-4',
        isFinalAttempt: true,
        deps: {
          getAiDigestRunById: vi.fn().mockResolvedValue({
            id: 'run-4',
            feedId: 'feed-ai',
            windowStartAt: '2026-03-18T00:00:00.000Z',
            windowEndAt: '2026-03-18T01:00:00.000Z',
            status: 'queued',
          }),
          getAiDigestConfigByFeedId: vi.fn().mockResolvedValue({
            feedId: 'feed-ai',
            prompt: 'x',
            intervalMinutes: 60,
            topN: 2,
            selectedFeedIds: ['feed-rss-1'],
            selectedCategoryIds: [],
          }),
          listFeeds: vi.fn().mockResolvedValue([
            { id: 'feed-ai', kind: 'ai_digest', title: 'AI解读', categoryId: null },
            { id: 'feed-rss-1', kind: 'rss', title: 'RSS 1', categoryId: null },
          ]) as never,
          listAiDigestCandidateArticles: vi.fn().mockResolvedValue([
            {
              id: 'candidate-1',
              feedTitle: 'RSS 1',
              title: '来源1',
              summary: 's1',
              link: null,
              fetchedAt: '2026-03-18T00:30:00.000Z',
              contentFullHtml: null,
            },
          ]),
          updateAiDigestRun: updateAiDigestRunMock,
          updateAiDigestConfigLastWindowEndAt: vi.fn().mockResolvedValue(undefined),
          getAiApiKey: vi.fn().mockResolvedValue(''),
        },
      }),
    ).rejects.toThrow('Missing AI API key');

    expect(writeSystemLogMock).toHaveBeenNthCalledWith(
      1,
      pool,
      expect.objectContaining({ message: 'AI digest started' }),
    );
    expect(writeSystemLogMock).toHaveBeenNthCalledWith(
      2,
      pool,
      expect.objectContaining({
        level: 'error',
        message: 'AI digest failed',
      }),
    );
    expect(updateAiDigestRunMock).toHaveBeenCalledWith(
      pool,
      'run-4',
      expect.objectContaining({ status: 'failed' }),
    );
  });
});
