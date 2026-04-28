import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyPasswordAgainstAuthConfigMock = vi.fn();
const createSessionCookieHeaderMock = vi.fn();

vi.mock('@/server/auth/session', () => ({
  verifyPasswordAgainstAuthConfig: (...args: unknown[]) =>
    verifyPasswordAgainstAuthConfigMock(...args),
  createSessionCookieHeader: (...args: unknown[]) => createSessionCookieHeaderMock(...args),
}));

describe('/api/auth/login', () => {
  beforeEach(() => {
    verifyPasswordAgainstAuthConfigMock.mockReset();
    createSessionCookieHeaderMock.mockReset().mockResolvedValue(
      'feedfuse_session=signed-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600',
    );
  });

  it('returns authenticated true and sets session cookie on success', async () => {
    verifyPasswordAgainstAuthConfigMock.mockResolvedValue({ ok: true });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'initial-password' }),
      }),
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.authenticated).toBe(true);
    expect(createSessionCookieHeaderMock).toHaveBeenCalledWith();
    expect(res.headers.get('set-cookie')).toContain('feedfuse_session=signed-token');
  });

  it('returns 503 when initial password is missing', async () => {
    verifyPasswordAgainstAuthConfigMock.mockResolvedValue({
      ok: false,
      reason: 'missing_initial_password',
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'initial-password' }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('service_unavailable');
  });

  it('returns 401 when password is invalid', async () => {
    verifyPasswordAgainstAuthConfigMock.mockResolvedValue({
      ok: false,
      reason: 'invalid_password',
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'wrong-password' }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('unauthorized');
  });
});
