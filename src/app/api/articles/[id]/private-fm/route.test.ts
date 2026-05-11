import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pool = { query: vi.fn() };
const createPrivateFmEpisodeMock = vi.fn();
const getPrivateFmEpisodeByArticleIdMock = vi.fn();
const markPrivateFmEpisodeFailedMock = vi.fn();
const enqueueWithResultMock = vi.fn();

vi.mock('@/server/auth/session', () => ({
  requireApiSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../../server/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../../../../../server/repositories/privateFmRepo', () => ({
  createPrivateFmEpisode: (...args: unknown[]) => createPrivateFmEpisodeMock(...args),
  getPrivateFmEpisodeByArticleId: (...args: unknown[]) =>
    getPrivateFmEpisodeByArticleIdMock(...args),
  markPrivateFmEpisodeFailed: (...args: unknown[]) => markPrivateFmEpisodeFailedMock(...args),
}));

vi.mock('../../../../../server/queue/queue', () => ({
  enqueueWithResult: (...args: unknown[]) => enqueueWithResultMock(...args),
}));

vi.mock('../../../../../server/queue/contracts', async () => {
  const actual = await vi.importActual<typeof import('../../../../../server/queue/contracts')>(
    '../../../../../server/queue/contracts',
  );
  return actual;
});

describe('/api/articles/[id]/private-fm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T07:00:00.000Z'));
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [{ runId: '8' }] });
    createPrivateFmEpisodeMock.mockReset();
    createPrivateFmEpisodeMock.mockResolvedValue({ id: '1' });
    getPrivateFmEpisodeByArticleIdMock.mockReset();
    getPrivateFmEpisodeByArticleIdMock.mockResolvedValue(null);
    markPrivateFmEpisodeFailedMock.mockReset();
    markPrivateFmEpisodeFailedMock.mockResolvedValue(undefined);
    enqueueWithResultMock.mockReset();
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-retry-1' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows retry when the existing private FM queued state is stale', async () => {
    getPrivateFmEpisodeByArticleIdMock.mockResolvedValue({
      id: '1',
      status: 'queued',
      updatedAt: '2026-05-09T06:30:00.000Z',
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/articles/61/private-fm', {
        method: 'POST',
        body: JSON.stringify({ mode: 'retry' }),
      }),
      { params: Promise.resolve({ id: '61' }) },
    );

    expect(await res.json()).toMatchObject({
      ok: true,
      data: { enqueued: true, jobId: 'job-retry-1', episodeId: '1' },
    });
    expect(enqueueWithResultMock).toHaveBeenCalled();
  });

  it('returns merged audio URL when the episode has a merged audio path', async () => {
    getPrivateFmEpisodeByArticleIdMock.mockResolvedValue({
      id: '1',
      status: 'succeeded',
      scriptText: '已有口播稿',
      audioPaths: ['private-fm/1/000.mp3', 'private-fm/1/001.mp3'],
      mergedAudioPath: 'private-fm/1/full.mp3',
      errorCode: null,
      errorMessage: null,
      updatedAt: '2026-05-09T06:58:00.000Z',
    });

    const mod = await import('./route');
    const res = await mod.GET(
      new Request('http://localhost/api/articles/61/private-fm'),
      { params: Promise.resolve({ id: '61' }) },
    );

    expect(await res.json()).toMatchObject({
      ok: true,
      data: {
        episode: {
          audioUrl: '/api/private-fm/episodes/1/audio/full',
          audioParts: [
            { index: 0, url: '/api/private-fm/episodes/1/audio/0' },
            { index: 1, url: '/api/private-fm/episodes/1/audio/1' },
          ],
        },
      },
    });
  });

  it('keeps a fresh private FM queued state idempotent', async () => {
    getPrivateFmEpisodeByArticleIdMock.mockResolvedValue({
      id: '1',
      status: 'queued',
      updatedAt: '2026-05-09T06:58:00.000Z',
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/articles/61/private-fm', {
        method: 'POST',
        body: JSON.stringify({ mode: 'retry' }),
      }),
      { params: Promise.resolve({ id: '61' }) },
    );

    expect(await res.json()).toMatchObject({
      ok: true,
      data: { enqueued: false, reason: 'already_running', episodeId: '1' },
    });
    expect(enqueueWithResultMock).not.toHaveBeenCalled();
  });

  it('rate-limits immediate retry after a recent private FM failure', async () => {
    getPrivateFmEpisodeByArticleIdMock.mockResolvedValue({
      id: '1',
      status: 'failed',
      updatedAt: '2026-05-09T06:59:45.000Z',
      errorCode: 'private_fm_failed',
      errorMessage: '私人 FM 生成失败，请稍后重试',
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/articles/61/private-fm', {
        method: 'POST',
        body: JSON.stringify({ mode: 'retry' }),
      }),
      { params: Promise.resolve({ id: '61' }) },
    );

    expect(await res.json()).toMatchObject({
      ok: true,
      data: { enqueued: false, reason: 'retry_cooldown', episodeId: '1' },
    });
    expect(enqueueWithResultMock).not.toHaveBeenCalled();
  });

  it('does not clear script text when regenerate is requested for a failed episode', async () => {
    getPrivateFmEpisodeByArticleIdMock.mockResolvedValue({
      id: '1',
      status: 'failed',
      updatedAt: '2026-05-09T06:58:00.000Z',
      scriptText: '已有口播稿',
    });

    const mod = await import('./route');
    await mod.POST(
      new Request('http://localhost/api/articles/61/private-fm', {
        method: 'POST',
        body: JSON.stringify({ mode: 'regenerate' }),
      }),
      { params: Promise.resolve({ id: '61' }) },
    );

    expect(createPrivateFmEpisodeMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ mode: 'retry' }),
    );
  });

  it('keeps retry status at script_ready when an existing script can be reused', async () => {
    getPrivateFmEpisodeByArticleIdMock.mockResolvedValue({
      id: '1',
      status: 'failed',
      updatedAt: '2026-05-09T06:58:00.000Z',
      scriptText: '已有口播稿',
    });

    const mod = await import('./route');
    await mod.POST(
      new Request('http://localhost/api/articles/61/private-fm', {
        method: 'POST',
        body: JSON.stringify({ mode: 'retry' }),
      }),
      { params: Promise.resolve({ id: '61' }) },
    );

    expect(createPrivateFmEpisodeMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ status: 'script_ready', mode: 'retry' }),
    );
  });

  it('queues a merge-only job for succeeded legacy episodes without clearing existing audio parts', async () => {
    getPrivateFmEpisodeByArticleIdMock.mockResolvedValue({
      id: '1',
      status: 'succeeded',
      updatedAt: '2026-05-09T06:58:00.000Z',
      scriptText: '已有口播稿',
      audioPaths: ['private-fm/1/000.mp3'],
      mergedAudioPath: null,
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/articles/61/private-fm', {
        method: 'POST',
        body: JSON.stringify({ mode: 'regenerate' }),
      }),
      { params: Promise.resolve({ id: '61' }) },
    );

    expect(await res.json()).toMatchObject({
      ok: true,
      data: { enqueued: true, jobId: 'job-retry-1', episodeId: '1' },
    });
    expect(createPrivateFmEpisodeMock).not.toHaveBeenCalled();
    expect(enqueueWithResultMock).toHaveBeenCalled();
  });
});
