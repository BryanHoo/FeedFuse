import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../../../../app/api/health/route';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('pg', () => ({ Pool: class {
  query = query;
  on = vi.fn();
} }));
vi.mock('@/server/infra/env', () => ({
  getServerEnv: () => ({ DATABASE_URL: 'postgresql://localhost/health_test' }),
}));

beforeEach(() => { query.mockReset(); });

describe('/api/health', () => {
  it('returns 200 only when the database and a worker are ready', async () => {
    query.mockResolvedValueOnce({ rows: [{ ready: 1 }] })
      .mockResolvedValueOnce({ rows: [{ last_seen_at: new Date('2026-10-09T00:00:00Z'), fresh: true }] });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toMatchObject({
      ok: true, data: { status: 'ok', checks: { database: 'ok', worker: 'ok' } },
    });
  });

  it('returns 503 for database failure without exposing connection details', async () => {
    query.mockRejectedValue(new Error('password=secret database connection failed'));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false, data: { status: 'unavailable', checks: { database: 'unavailable', worker: 'unknown' } },
    });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing', []],
    ['stale', [{ last_seen_at: new Date('2026-10-09T00:00:00Z'), fresh: false }]],
  ])('returns 503 when worker heartbeat is %s', async (status, rows) => {
    query.mockResolvedValueOnce({ rows: [{ ready: 1 }] }).mockResolvedValueOnce({ rows });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      ok: false, data: { checks: { database: 'ok', worker: status } },
    });
  });

  it('reports unavailable worker detection when heartbeat schema is not ready', async () => {
    query.mockResolvedValueOnce({ rows: [{ ready: 1 }] })
      .mockRejectedValueOnce(new Error('relation worker_heartbeats does not exist'));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      ok: false, data: { checks: { database: 'ok', worker: 'unavailable' } },
    });
  });
});
