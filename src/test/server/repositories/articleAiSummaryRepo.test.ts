import { describe, expect, it, vi } from 'vitest';

describe('articleAiSummaryRepo', () => {
  it('upserts a running summary session and lists events after event id', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            articleId: 'article-1',
            sourceTextHash: 'hash-1',
            status: 'running',
            draftText: 'TL;DR',
            finalText: null,
            model: 'gpt-4o-mini',
            jobId: 'job-1',
            errorCode: null,
            errorMessage: null,
            rawErrorMessage: null,
            supersededBySessionId: null,
            startedAt: '2026-03-09T00:00:00.000Z',
            finishedAt: null,
            createdAt: '2026-03-09T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            eventId: 1,
            sessionId: 'session-1',
            eventType: 'summary.delta',
            payload: { deltaText: ' 第一段' },
            createdAt: '2026-03-09T00:00:01.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'session-1',
            articleId: 'article-1',
            sourceTextHash: 'hash-1',
            status: 'running',
            draftText: 'TL;DR',
            finalText: null,
            model: 'gpt-4o-mini',
            jobId: 'job-1',
            errorCode: null,
            errorMessage: null,
            rawErrorMessage: null,
            supersededBySessionId: null,
            startedAt: '2026-03-09T00:00:00.000Z',
            finishedAt: null,
            createdAt: '2026-03-09T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            eventId: 1,
            sessionId: 'session-1',
            eventType: 'summary.delta',
            payload: { deltaText: ' 第一段' },
            createdAt: '2026-03-09T00:00:01.000Z',
          },
        ],
      });

    const pool = { query };
    const mod = await import('@/server/domains/articles/repositories/articleAiSummaryRepo');

    const session = await mod.upsertAiSummarySession(pool as never, {
      articleId: 'article-1',
      sourceTextHash: 'hash-1',
      status: 'running',
      draftText: 'TL;DR',
      finalText: null,
      model: 'gpt-4o-mini',
      jobId: 'job-1',
      errorCode: null,
      errorMessage: null,
      rawErrorMessage: null,
    });

    await mod.insertAiSummaryEvent(pool as never, {
      sessionId: session.id,
      eventType: 'summary.delta',
      payload: { deltaText: ' 第一段' },
    });

    const active = await mod.getActiveAiSummarySessionByArticleId(pool as never, 'article-1');
    const events = await mod.listAiSummaryEventsAfter(pool as never, {
      sessionId: 'session-1',
      afterEventId: 0,
    });

    expect(active?.draftText).toBe('TL;DR');
    expect(events[0]?.eventType).toBe('summary.delta');

    const upsertSql = String(query.mock.calls[0]?.[0] ?? '');
    expect(upsertSql).toContain('insert into article_ai_summary_sessions');
    expect(upsertSql).toContain('raw_error_message');
    expect(upsertSql).not.toContain('gen_random_uuid');
    expect(String(query.mock.calls[1]?.[0] ?? '')).toContain('insert into article_ai_summary_events');
    expect(String(query.mock.calls[2]?.[0] ?? '')).toContain('superseded_by_session_id is null');
    expect(String(query.mock.calls[3]?.[0] ?? '')).toContain('event_id > $3');
  });

  it('failAiSummarySession stores raw_error_message', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'session-1',
          articleId: 'article-1',
          sourceTextHash: 'hash-1',
          status: 'failed',
          draftText: 'TL;DR',
          finalText: null,
          model: 'gpt-4o-mini',
          jobId: 'job-1',
          errorCode: 'ai_rate_limited',
          errorMessage: '请求太频繁了，请稍后重试',
          rawErrorMessage: '429 rate limit',
          supersededBySessionId: null,
          startedAt: '2026-03-09T00:00:00.000Z',
          finishedAt: '2026-03-09T00:00:10.000Z',
          createdAt: '2026-03-09T00:00:00.000Z',
          updatedAt: '2026-03-09T00:00:10.000Z',
        },
      ],
    });
    const pool = { query };
    const mod = await import('@/server/domains/articles/repositories/articleAiSummaryRepo');

    await mod.failAiSummarySession(pool as never, {
      sessionId: 'session-1',
      draftText: 'TL;DR',
      errorCode: 'ai_rate_limited',
      errorMessage: '请求太频繁了，请稍后重试',
      rawErrorMessage: '429 rate limit',
    });

    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('raw_error_message = $5');
    expect(query.mock.calls[0]?.[1]).toEqual([
      'session-1',
      'TL;DR',
      'ai_rate_limited',
      '请求太频繁了，请稍后重试',
      '429 rate limit',
      '1',
    ]);
  });

  it('does not reassign user_id when upserting an explicit summary session id', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'session-1',
          articleId: 'article-1',
          sourceTextHash: 'hash-1',
          status: 'running',
          draftText: 'TL;DR',
          finalText: null,
          model: null,
          jobId: 'job-1',
          errorCode: null,
          errorMessage: null,
          rawErrorMessage: null,
          supersededBySessionId: null,
          startedAt: '2026-03-09T00:00:00.000Z',
          finishedAt: null,
          createdAt: '2026-03-09T00:00:00.000Z',
          updatedAt: '2026-03-09T00:00:00.000Z',
        },
      ],
    });
    const pool = { query };
    const mod = await import('@/server/domains/articles/repositories/articleAiSummaryRepo');

    await mod.upsertAiSummarySession(pool as never, {
      sessionId: 'session-1',
      articleId: 'article-1',
      sourceTextHash: 'hash-1',
      status: 'running',
      draftText: 'TL;DR',
      jobId: 'job-1',
      userId: '2',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('on conflict (id) do update');
    expect(sql).toContain('where article_ai_summary_sessions.user_id = excluded.user_id');
    expect(sql).not.toContain('set\n        user_id = excluded.user_id');
  });
  it('limits replay batches and removes only expired intermediate events of the current user', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 12 });
    const mod = await import('@/server/domains/articles/repositories/articleAiSummaryRepo');
    await mod.listAiSummaryEventsAfter({ query } as never, { userId: '2', sessionId: 'session-1', afterEventId: 9 });
    expect(String(query.mock.calls[0][0])).toMatch(/limit 200/i);
    expect(await mod.deleteExpiredAiSummaryEvents({ query } as never, { userId: '2' })).toBe(12);
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
