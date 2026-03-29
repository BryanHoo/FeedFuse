import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApiSessionMock = vi.fn();
const verifyPasswordAgainstAuthConfigMock = vi.fn();
const createSessionCookieHeaderMock = vi.fn();
const hashPasswordMock = vi.fn();
const updateAuthPasswordMock = vi.fn();

const pool = {};

vi.mock('@/server/auth/session', () => ({
  requireApiSession: (...args: unknown[]) => requireApiSessionMock(...args),
  verifyPasswordAgainstAuthConfig: (...args: unknown[]) =>
    verifyPasswordAgainstAuthConfigMock(...args),
  createSessionCookieHeader: (...args: unknown[]) => createSessionCookieHeaderMock(...args),
}));

vi.mock('@/server/auth/password', () => ({
  hashPassword: (...args: unknown[]) => hashPasswordMock(...args),
}));

vi.mock('@/server/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('@/server/repositories/settingsRepo', () => ({
  updateAuthPassword: (...args: unknown[]) => updateAuthPasswordMock(...args),
}));

describe('/api/settings/auth/password', () => {
  beforeEach(() => {
    requireApiSessionMock.mockReset().mockResolvedValue(null);
    verifyPasswordAgainstAuthConfigMock.mockReset().mockResolvedValue({ ok: true });
    createSessionCookieHeaderMock.mockReset().mockResolvedValue(
      'feedfuse_session=rotated-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600',
    );
    hashPasswordMock.mockReset().mockReturnValue('scrypt$hashed-next');
    updateAuthPasswordMock.mockReset().mockResolvedValue({
      authPasswordHash: 'scrypt$hashed-next',
      authSessionSecret: 'rotated-secret',
    });
  });

  it('updates password and rotates session cookie', async () => {
    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/settings/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'initial-password',
          nextPassword: 'next-password-123',
        }),
      }),
    );
    const json = await res.json();

    expect(hashPasswordMock).toHaveBeenCalledWith('next-password-123');
    expect(updateAuthPasswordMock).toHaveBeenCalledWith(pool, 'scrypt$hashed-next');
    expect(createSessionCookieHeaderMock).toHaveBeenCalledWith('rotated-secret');
    expect(res.headers.get('set-cookie')).toContain('feedfuse_session=rotated-token');
    expect(json.ok).toBe(true);
    expect(json.data.updated).toBe(true);
  });

  it('returns 401 when current password is invalid', async () => {
    verifyPasswordAgainstAuthConfigMock.mockResolvedValue({
      ok: false,
      reason: 'invalid_password',
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/settings/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'wrong-password',
          nextPassword: 'next-password-123',
        }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('unauthorized');
  });

  it('returns 400 when next password is too short', async () => {
    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/settings/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'initial-password',
          nextPassword: 'short',
        }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('validation_error');
  });
});
