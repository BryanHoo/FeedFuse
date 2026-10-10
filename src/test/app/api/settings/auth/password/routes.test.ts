import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireApiSessionMock = vi.fn();
const createSessionCookieHeaderMock = vi.fn();
const changeUserPasswordMock = vi.fn();
const getUserByIdMock = vi.fn();
const hashPasswordMock = vi.fn();
const verifyPasswordMock = vi.fn();

const pool = {};

vi.mock('@/server/domains/auth/services/session', () => ({
  requireApiSession: (...args: unknown[]) => requireApiSessionMock(...args),
  createSessionCookieHeader: (...args: unknown[]) => createSessionCookieHeaderMock(...args),
}));

vi.mock('@/server/domains/auth/services/password', () => ({
  verifyPassword: (...args: unknown[]) => verifyPasswordMock(...args),
  hashPassword: (...args: unknown[]) => hashPasswordMock(...args),
}));

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('@/server/domains/auth/repositories/usersRepo', () => ({
  changeUserPassword: (...args: unknown[]) => changeUserPasswordMock(...args),
  getUserById: (...args: unknown[]) => getUserByIdMock(...args),
}));

describe('/api/settings/auth/password', () => {
  beforeEach(() => {
    requireApiSessionMock.mockReset().mockResolvedValue({ userId: '1', role: 'admin', sessionVersion: 1 });
    createSessionCookieHeaderMock.mockReset().mockResolvedValue(
      'feedfuse_session=rotated-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600',
    );
    changeUserPasswordMock.mockReset().mockResolvedValue({
      id: '1',
      username: 'admin',
      role: 'admin',
      status: 'active',
      sessionVersion: 2,
      type: 'initial_admin',
    });
    getUserByIdMock.mockReset().mockResolvedValue({
      id: '1',
      username: 'admin',
      passwordHash: 'scrypt$old',
      role: 'admin',
      status: 'active',
      sessionVersion: 1,
      type: 'initial_admin',
    });
    hashPasswordMock.mockReset().mockResolvedValue('scrypt$hashed-next');
    verifyPasswordMock.mockReset().mockResolvedValue(true);
  });

  it('updates current initial user password and rotates session cookie', async () => {
    const mod = await import('../../../../../../app/api/settings/auth/password/route');
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
    expect(changeUserPasswordMock).toHaveBeenCalledWith(pool, {
      userId: '1',
      passwordHash: 'scrypt$hashed-next',
    });
    expect(createSessionCookieHeaderMock).toHaveBeenCalledWith({
      userId: '1',
      role: 'admin',
      sessionVersion: 2,
    });
    expect(res.headers.get('set-cookie')).toContain('feedfuse_session=rotated-token');
    expect(json.ok).toBe(true);
    expect(json.data.updated).toBe(true);
  });

  it('preserves leading and trailing spaces in compatibility password changes', async () => {
    const mod = await import('../../../../../../app/api/settings/auth/password/route');
    await mod.POST(
      new Request('http://localhost/api/settings/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: '  initial-password  ',
          nextPassword: '  next-password-123  ',
        }),
      }),
    );

    expect(verifyPasswordMock).toHaveBeenCalledWith('  initial-password  ', 'scrypt$old');
    expect(hashPasswordMock).toHaveBeenCalledWith('  next-password-123  ');
  });

  it('returns 403 when a non-initial admin tries to use the compatibility endpoint', async () => {
    requireApiSessionMock.mockResolvedValue({ userId: '3', role: 'admin', sessionVersion: 1 });
    getUserByIdMock.mockResolvedValue({
      id: '3',
      username: 'ops-admin',
      passwordHash: 'scrypt$old',
      role: 'admin',
      status: 'active',
      sessionVersion: 1,
      type: 'admin',
    });
    verifyPasswordMock.mockResolvedValue(true);

    const mod = await import('../../../../../../app/api/settings/auth/password/route');
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

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('forbidden');
    expect(changeUserPasswordMock).not.toHaveBeenCalled();
  });

  it('returns 401 when current password is invalid', async () => {
    verifyPasswordMock.mockResolvedValue(false);

    const mod = await import('../../../../../../app/api/settings/auth/password/route');
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
    const mod = await import('../../../../../../app/api/settings/auth/password/route');
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
