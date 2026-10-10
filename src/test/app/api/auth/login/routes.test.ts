import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyUserPasswordMock = vi.fn();
const createSessionCookieHeaderMock = vi.fn();

vi.mock('@/server/domains/auth/services/session', () => ({
  verifyUserPassword: (...args: unknown[]) =>
    verifyUserPasswordMock(...args),
  createSessionCookieHeader: (...args: unknown[]) => createSessionCookieHeaderMock(...args),
}));

describe('/api/auth/login', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('AUTH_TRUST_PROXY', 'true');
    verifyUserPasswordMock.mockReset().mockResolvedValue({ ok: false, reason: 'invalid_password' });
    createSessionCookieHeaderMock.mockReset().mockResolvedValue(
      'feedfuse_session=signed-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600',
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  async function login(username = 'admin', source = '192.0.2.1', password = 'wrong-password') {
    const { POST } = await import('../../../../../app/api/auth/login/route');
    return POST(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': source },
      body: JSON.stringify({ username, password }),
    }));
  }

  it('shares account failures across source IPs and username casing, with progressive cooldown', async () => {
    vi.useFakeTimers();
    verifyUserPasswordMock.mockResolvedValue({ ok: false, reason: 'invalid_password' });
    for (let i = 0; i < 5; i++) expect((await login()).status).toBe(401);
    const blocked = await login(' ADMIN ', '192.0.2.2');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('1');
    expect(blocked.headers.get('set-cookie')).toBeNull();
    expect(verifyUserPasswordMock).toHaveBeenCalledTimes(5);
    vi.advanceTimersByTime(1000);
    expect((await login()).status).toBe(401);
    expect((await login()).headers.get('retry-after')).toBe('2');
    vi.advanceTimersByTime(2000);
    verifyUserPasswordMock.mockResolvedValue({ ok: true, user: { userId: '1', role: 'admin', sessionVersion: 1 } });
    expect((await login()).status).toBe(200);
    verifyUserPasswordMock.mockResolvedValue({ ok: false, reason: 'invalid_password' });
    expect((await login()).status).toBe(401);
  });

  it('limits a source even when it rotates accounts', async () => {
    verifyUserPasswordMock.mockResolvedValue({ ok: false, reason: 'invalid_password' });
    for (let i = 0; i < 10; i++) expect((await login(`user-${i}`)).status).toBe(401);
    expect((await login('another-user')).status).toBe(429);
    expect((await login('another-user', '192.0.2.2')).status).toBe(401);
    expect(verifyUserPasswordMock).toHaveBeenCalledTimes(11);
  });

  it('does not trust a client-controlled source header by default', async () => {
    vi.stubEnv('AUTH_TRUST_PROXY', 'false');
    verifyUserPasswordMock.mockResolvedValue({ ok: false, reason: 'invalid_password' });
    for (let i = 0; i < 10; i++) await login(`user-${i}`, `192.0.2.${i + 1}`);
    expect((await login('another-user', '198.51.100.1')).status).toBe(429);
  });

  it('reserves the account before asynchronous verification so concurrent requests cannot bypass limits', async () => {
    let finish!: (value: unknown) => void;
    const verifying = new Promise((resolve) => { finish = resolve; });
    let started!: () => void;
    const verificationStarted = new Promise<void>((resolve) => { started = resolve; });
    verifyUserPasswordMock.mockImplementation(() => { started(); return verifying; });
    const first = login();
    await verificationStarted;
    const second = login('ADMIN', '192.0.2.2');
    // 先结束在途验证，再读取响应，避免旧实现的无限等待掩盖缺少并发保护。
    await new Promise((resolve) => setTimeout(resolve, 10));
    finish({ ok: false, reason: 'invalid_password' });
    expect((await first).status).toBe(401);
    expect((await second).status).toBe(429);
    expect(verifyUserPasswordMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { username: 'a'.repeat(129), password: 'password' },
    { username: 'admin', password: 'a'.repeat(1025) },
    { username: 'admin', password: '界'.repeat(400) },
    { username: 'admin', password: 'ﷺ'.repeat(100) },
  ])('rejects oversized credentials before verification (case %#)', async ({ username, password }) => {
    const res = await login(username, '192.0.2.1', password);
    expect(res.status).toBe(400);
    expect(verifyUserPasswordMock).not.toHaveBeenCalled();
  });

  it('enforces the body byte limit without trusting Content-Length', async () => {
    const { POST } = await import('../../../../../app/api/auth/login/route');
    const res = await POST(new Request('http://localhost/api/auth/login', {
      method: 'POST', headers: { 'content-length': '1' },
      body: JSON.stringify({ username: 'admin', password: 'password', extra: 'a'.repeat(8192) }),
    }));
    expect(res.status).toBe(400);
    expect(verifyUserPasswordMock).not.toHaveBeenCalled();
  });

  it('cancels a chunked body as soon as its actual byte size exceeds the limit', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(5000)); },
      cancel() { cancelled = true; },
    });
    const { POST } = await import('../../../../../app/api/auth/login/route');
    const response = await POST(new Request('http://localhost/api/auth/login', {
      method: 'POST', body, ...{ duplex: 'half' },
    }));
    expect(response.status).toBe(400);
    expect(cancelled).toBe(true);
    expect(verifyUserPasswordMock).not.toHaveBeenCalled();
  });

  it('releases the account after a verification exception without counting it as a credential failure', async () => {
    verifyUserPasswordMock.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await login()).status).toBe(500);
    expect((await login()).status).toBe(401);
    expect(verifyUserPasswordMock).toHaveBeenCalledTimes(2);
  });

  it('returns authenticated true and sets session cookie on success', async () => {
    verifyUserPasswordMock.mockResolvedValue({
      ok: true,
      user: { userId: '1', role: 'admin', sessionVersion: 2 },
    });

    const mod = await import('../../../../../app/api/auth/login/route');
    const res = await mod.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'initial-password' }),
      }),
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.authenticated).toBe(true);
    expect(json.data.user).toEqual({ id: '1', type: 'initial_admin', role: 'admin' });
    expect(verifyUserPasswordMock).toHaveBeenCalledWith({
      username: 'admin',
      password: 'initial-password',
    });
    expect(createSessionCookieHeaderMock).toHaveBeenCalledWith({
      userId: '1',
      role: 'admin',
      sessionVersion: 2,
    });
    expect(res.headers.get('set-cookie')).toContain('feedfuse_session=signed-token');
  });

  it('preserves leading and trailing spaces in password input', async () => {
    verifyUserPasswordMock.mockResolvedValue({
      ok: true,
      user: { userId: '2', role: 'member', sessionVersion: 1 },
    });

    const mod = await import('../../../../../app/api/auth/login/route');
    await mod.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: ' member ', password: '  password-123  ' }),
      }),
    );

    expect(verifyUserPasswordMock).toHaveBeenCalledWith({
      username: 'member',
      password: '  password-123  ',
    });
  });

  it('returns 503 when initial password is missing', async () => {
    verifyUserPasswordMock.mockResolvedValue({
      ok: false,
      reason: 'missing_initial_password',
    });

    const mod = await import('../../../../../app/api/auth/login/route');
    const res = await mod.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'initial-password' }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('service_unavailable');
  });

  it('returns 401 when password is invalid', async () => {
    verifyUserPasswordMock.mockResolvedValue({
      ok: false,
      reason: 'invalid_password',
    });

    const mod = await import('../../../../../app/api/auth/login/route');
    const res = await mod.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('unauthorized');
  });
});
