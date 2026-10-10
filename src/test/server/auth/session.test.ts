import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_SESSION_COOKIE_NAME,
  createSessionCookieHeader,
  createSessionToken,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
  verifyPasswordAgainstAuthConfig,
  verifySessionToken,
  verifyUserPassword,
} from '@/server/domains/auth/services/session';
import { hashPassword, verifyPassword, verifyPlainPassword } from '@/server/domains/auth/services/password';

const getPoolMock = vi.hoisted(() => vi.fn());
const getAuthSettingsMock = vi.hoisted(() => vi.fn());
const findUserByUsernameMock = vi.hoisted(() => vi.fn());
const getUserByIdMock = vi.hoisted(() => vi.fn());
const persistInitialAdminPasswordMock = vi.hoisted(() => vi.fn());
const getServerEnvMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/infra/db/pool', () => ({
  getPool: (...args: unknown[]) => getPoolMock(...args),
}));

vi.mock('@/server/domains/settings/repositories/settingsRepo', () => ({
  getAuthSettings: (...args: unknown[]) => getAuthSettingsMock(...args),
}));

vi.mock('@/server/domains/auth/repositories/usersRepo', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/repositories/usersRepo')>(
    '@/server/domains/auth/repositories/usersRepo',
  );
  return {
    ...actual,
    findUserByUsername: (...args: unknown[]) => findUserByUsernameMock(...args),
    getUserById: (...args: unknown[]) => getUserByIdMock(...args),
    persistInitialAdminPassword: (...args: unknown[]) => persistInitialAdminPasswordMock(...args),
  };
});

vi.mock('@/server/infra/env', () => ({
  getServerEnv: (...args: unknown[]) => getServerEnvMock(...args),
}));

describe('auth password helpers', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('test-password');

    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('test-password', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('verifies plain fallback password with constant-time comparison helper', () => {
    expect(verifyPlainPassword('initial-password', 'initial-password')).toBe(true);
    expect(verifyPlainPassword('initial-password', 'other-password')).toBe(false);
  });
});

  describe('auth session helpers', () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
      getPoolMock.mockReset().mockReturnValue('pool');
      getAuthSettingsMock.mockReset().mockResolvedValue({ authSessionSecret: 'session-secret' });
      findUserByUsernameMock.mockReset();
      getUserByIdMock.mockReset();
      persistInitialAdminPasswordMock.mockReset();
    getServerEnvMock.mockReset().mockReturnValue({ AUTH_INITIAL_PASSWORD: 'initial-password' });
  });

  it('creates and verifies a signed session token', () => {
    const token = createSessionToken({
      secret: 'session-secret',
      userId: '42',
      role: 'admin',
      sessionVersion: 7,
      nowMs: Date.UTC(2026, 0, 1, 0, 0, 0),
      maxAgeSeconds: 60,
    });

    expect(
      verifySessionToken({
        token,
        secret: 'session-secret',
        nowMs: Date.UTC(2026, 0, 1, 0, 0, 30),
      }),
    ).toEqual({
      userId: '42',
      role: 'admin',
      sessionVersion: 7,
      iat: 1767225600,
      exp: 1767225660,
    });
  });

  it('rejects expired and tampered tokens', () => {
    const token = createSessionToken({
      secret: 'session-secret',
      userId: '42',
      role: 'admin',
      sessionVersion: 7,
      nowMs: Date.UTC(2026, 0, 1, 0, 0, 0),
      maxAgeSeconds: 60,
    });

    expect(
      verifySessionToken({
        token,
        secret: 'session-secret',
        nowMs: Date.UTC(2026, 0, 1, 0, 1, 1),
      }),
    ).toBeNull();
    expect(
      verifySessionToken({
        token: `${token}tampered`,
        secret: 'session-secret',
        nowMs: Date.UTC(2026, 0, 1, 0, 0, 30),
      }),
    ).toBeNull();
  });

  it('serializes login and logout cookies', () => {
    const cookie = serializeSessionCookie('signed-token', 3600);
    const expiredCookie = serializeExpiredSessionCookie();

    expect(cookie).toContain(`${AUTH_SESSION_COOKIE_NAME}=signed-token`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=3600');
    expect(expiredCookie).toContain(`${AUTH_SESSION_COOKIE_NAME}=`);
    expect(expiredCookie).toContain('Max-Age=0');
      expect(cookie).not.toContain('Secure');
      expect(expiredCookie).not.toContain('Secure');
    });

    it('adds Secure to session cookies in production', () => {
      vi.stubEnv('NODE_ENV', 'production');

      const cookie = serializeSessionCookie('signed-token', 3600);
      const expiredCookie = serializeExpiredSessionCookie();

      expect(cookie).toContain('Secure');
      expect(expiredCookie).toContain('Secure');
    });

    it('allows disabling Secure cookies for production HTTP deployments', () => {
      vi.stubEnv('NODE_ENV', 'production');
      getServerEnvMock.mockReturnValue({
        AUTH_INITIAL_PASSWORD: 'initial-password',
        AUTH_COOKIE_SECURE: false,
      });

      const cookie = serializeSessionCookie('signed-token', 3600);
      const expiredCookie = serializeExpiredSessionCookie();

      expect(cookie).not.toContain('Secure');
      expect(expiredCookie).not.toContain('Secure');
    });

    it('uses the fixed initial user id for legacy session cookie fallback', async () => {
    getUserByIdMock.mockResolvedValue({
      id: '1',
      username: 'renamed-admin',
      passwordHash: 'hash',
      role: 'admin',
      status: 'active',
      sessionVersion: 5,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    });

    const cookie = await createSessionCookieHeader('session-secret');
    const token = cookie.split(';')[0].split('=')[1];
    const payload = verifySessionToken({
      token: decodeURIComponent(token),
      secret: 'session-secret',
    });

    expect(getUserByIdMock).toHaveBeenCalledWith('pool', '1');
    expect(payload).toMatchObject({
      userId: '1',
      role: 'admin',
      sessionVersion: 5,
    });
  });

  it('awaits stored password verification and refuses an incorrect password', async () => {
    findUserByUsernameMock.mockResolvedValue({
      id: '2', role: 'member', status: 'active', sessionVersion: 1,
      passwordHash: await hashPassword('correct-password'),
    });
    expect(await verifyUserPassword({ username: 'member', password: 'wrong-password' }))
      .toEqual({ ok: false, reason: 'invalid_password' });
    expect(await verifyUserPassword({ username: 'member', password: 'correct-password' }))
      .toEqual({ ok: true, user: { userId: '2', role: 'member', sessionVersion: 1 } });
  });

  it('accepts initial password fallback for the renamed initial user', async () => {
    findUserByUsernameMock.mockResolvedValue({
      id: '1',
      username: 'renamed-admin',
      passwordHash: '',
      role: 'admin',
      status: 'active',
      sessionVersion: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });
    persistInitialAdminPasswordMock.mockResolvedValue({
      id: '1',
      username: 'renamed-admin',
      passwordHash: 'scrypt$persisted',
      role: 'admin',
      status: 'active',
      sessionVersion: 2,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    });

    const result = await verifyUserPassword({
      username: 'renamed-admin',
      password: 'initial-password',
    });

    expect(result).toEqual({
      ok: true,
      user: { userId: '1', role: 'admin', sessionVersion: 2 },
    });
  });

  it('verifies auth config password against the fixed initial user id', async () => {
    getUserByIdMock.mockResolvedValue({
      id: '1',
      username: 'renamed-admin',
      passwordHash: '',
      role: 'admin',
      status: 'active',
      sessionVersion: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });
    persistInitialAdminPasswordMock.mockResolvedValue({
      id: '1',
      username: 'renamed-admin',
      passwordHash: 'scrypt$persisted',
      role: 'admin',
      status: 'active',
      sessionVersion: 2,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    });

    const result = await verifyPasswordAgainstAuthConfig('initial-password');

    expect(getUserByIdMock).toHaveBeenCalledWith('pool', '1');
    expect(result).toEqual({ ok: true });
  });
});
