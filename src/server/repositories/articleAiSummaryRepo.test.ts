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
    const mod = await import('./articleAiSummaryRepo');

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
    expect(upsertSql).not.toContain('gen_random_uuid');
    expect(String(query.mock.calls[1]?.[0] ?? '')).toContain('insert into article_ai_summary_events');
    expect(String(query.mock.calls[2]?.[0] ?? '')).toContain('superseded_by_session_id is null');
    expect(String(query.mock.calls[3]?.[0] ?? '')).toContain('event_id > $2');
  });
});
