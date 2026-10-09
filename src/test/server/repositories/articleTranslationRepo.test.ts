import { describe, expect, it, vi } from 'vitest';

describe('articleTranslationRepo', () => {
  it('upsertSession stores running session with hash and counters', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const mod = await import('@/server/domains/articles/repositories/articleTranslationRepo');
    await mod.upsertTranslationSession(pool as never, {
      articleId: 'a1',
      sourceHtmlHash: 'hash-1',
      status: 'running',
      totalSegments: 3,
      translatedSegments: 0,
      failedSegments: 0,
      rawErrorMessage: null,
    });
    expect(pool.query).toHaveBeenCalled();
    const sql = String(pool.query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('raw_error_message');
    expect(sql).toContain('on conflict (user_id, article_id) do update');
    expect(sql).not.toContain('user_id = excluded.user_id');
  });

  it('upsertSegment stores raw_error_message for failed segments', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const mod = await import('@/server/domains/articles/repositories/articleTranslationRepo');

    await mod.upsertTranslationSegment(pool as never, {
      sessionId: 'session-1',
      segmentIndex: 1,
      sourceText: 'A',
      translatedText: null,
      status: 'failed',
      errorCode: 'ai_rate_limited',
      errorMessage: '请求太频繁了，请稍后重试',
      rawErrorMessage: '429 rate limit',
    });

    const sql = String(pool.query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('raw_error_message');
    expect(sql).toContain('on conflict (user_id, session_id, segment_index) do update');
    expect(sql).not.toContain('user_id = excluded.user_id');
    expect(pool.query.mock.calls[0]?.[1]).toEqual([
      '1',
      'session-1',
      1,
      'A',
      null,
      'failed',
      'ai_rate_limited',
      '请求太频繁了，请稍后重试',
      '429 rate limit',
    ]);
  });
  it('limits replay batches and removes only expired intermediate events of the current user', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 12 });
    const mod = await import('@/server/domains/articles/repositories/articleTranslationRepo');
    await mod.listTranslationEventsAfter({ query } as never, { userId: '2', sessionId: 'session-1', afterEventId: 9 });
    expect(String(query.mock.calls[0][0])).toMatch(/limit 200/i);
    expect(await mod.deleteExpiredTranslationEvents({ query } as never, { userId: '2' })).toBe(12);
    const [sql, params] = query.mock.calls[1];
    // 活跃会话与终态事件必须保留，过期清理仍严格按当前用户限定范围。
    expect(sql).toContain("status in ('succeeded', 'failed')");
    expect(sql).toContain("event_type not in ('session.completed', 'session.failed')");
    expect(sql).toContain('finished_at < now()');
    expect(sql).toContain('e.user_id = $1');
    expect(sql).toContain('s.user_id = e.user_id');
    expect(sql).toContain('limit 5000');
    expect(params).toEqual(['2']);
  });

});
