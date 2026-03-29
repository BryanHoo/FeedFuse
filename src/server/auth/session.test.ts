import { describe, expect, it } from 'vitest';
import {
  AUTH_SESSION_COOKIE_NAME,
  createSessionToken,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
  verifySessionToken,
} from './session';
import { hashPassword, verifyPassword, verifyPlainPassword } from './password';

describe('auth password helpers', () => {
  it('hashes and verifies passwords', () => {
    const hash = hashPassword('test-password');

    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('test-password', hash)).toBe(true);
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('verifies plain fallback password with constant-time comparison helper', () => {
    expect(verifyPlainPassword('initial-password', 'initial-password')).toBe(true);
    expect(verifyPlainPassword('initial-password', 'other-password')).toBe(false);
  });
});

describe('auth session helpers', () => {
  it('creates and verifies a signed session token', () => {
    const token = createSessionToken({
      secret: 'session-secret',
      nowMs: Date.UTC(2026, 0, 1, 0, 0, 0),
      maxAgeSeconds: 60,
    });

    expect(
      verifySessionToken({
        token,
        secret: 'session-secret',
        nowMs: Date.UTC(2026, 0, 1, 0, 0, 30),
      }),
    ).toBe(true);
  });

  it('rejects expired and tampered tokens', () => {
    const token = createSessionToken({
      secret: 'session-secret',
      nowMs: Date.UTC(2026, 0, 1, 0, 0, 0),
      maxAgeSeconds: 60,
    });

    expect(
      verifySessionToken({
        token,
        secret: 'session-secret',
        nowMs: Date.UTC(2026, 0, 1, 0, 1, 1),
      }),
    ).toBe(false);
    expect(
      verifySessionToken({
        token: `${token}tampered`,
        secret: 'session-secret',
        nowMs: Date.UTC(2026, 0, 1, 0, 0, 30),
      }),
    ).toBe(false);
  });

  it('serializes login and logout cookies', () => {
    const cookie = serializeSessionCookie('signed-token', 3600);
    const expiredCookie = serializeExpiredSessionCookie();

    expect(cookie).toContain(`${AUTH_SESSION_COOKIE_NAME}=signed-token`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=3600');
    expect(expiredCookie).toContain(`${AUTH_SESSION_COOKIE_NAME}=`);
    expect(expiredCookie).toContain('Max-Age=0');
  });
});
