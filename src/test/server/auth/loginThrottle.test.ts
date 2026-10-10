import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLoginSource, LoginThrottle } from '@/server/domains/auth/services/loginThrottle';
import { TooManyRequestsError } from '@/server/infra/http/errors';

describe('login throttle boundaries', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it('limits successful attempts by source without clearing its failure history', () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < 9; i++) {
      const attempt = throttle.begin('source');
      attempt.reserveAccount(`user-${i}`);
      attempt.finish('failure');
    }
    const success = throttle.begin('source');
    success.reserveAccount('valid-user');
    success.finish('success');
    const lastFailure = throttle.begin('source');
    lastFailure.reserveAccount('another-user');
    lastFailure.finish('failure');
    expect(() => throttle.begin('source')).toThrow(TooManyRequestsError);
  });

  it('caps all attempts at 30 per source per minute, including successful logins', () => {
    vi.useFakeTimers();
    const throttle = new LoginThrottle();
    for (let i = 0; i < 30; i++) {
      const attempt = throttle.begin('source');
      attempt.reserveAccount('valid-user');
      attempt.finish('success');
    }
    expect(() => throttle.begin('source')).toThrow(TooManyRequestsError);
    vi.advanceTimersByTime(60_000);
    expect(() => throttle.begin('source').finish()).not.toThrow();
  });

  it('caps concurrent verification across accounts and releases reservations exactly once on exceptions', () => {
    const throttle = new LoginThrottle();
    const first = throttle.begin('source-a');
    const second = throttle.begin('source-b');
    const third = throttle.begin('source-c');
    first.reserveAccount('user-a');
    second.reserveAccount('user-b');
    expect(() => third.reserveAccount('user-c')).toThrow(TooManyRequestsError);
    first.finish();
    first.finish();
    third.reserveAccount('user-c');
    const fourth = throttle.begin('source-d');
    expect(() => fourth.reserveAccount('user-d')).toThrow(TooManyRequestsError);
    second.finish();
    third.finish();
    fourth.reserveAccount('user-d');
    fourth.finish();
  });

  it('caps progressive cooldown at 15 minutes and lets stale failures expire', () => {
    vi.useFakeTimers();
    const throttle = new LoginThrottle();
    for (let i = 0; i < 15; i++) {
      const attempt = throttle.begin(`source-${i}`);
      attempt.reserveAccount('admin');
      attempt.finish('failure');
      if (i < 4) continue;
      const wait = Math.min(2 ** (i - 4), 900);
      const blocked = throttle.begin(`blocked-source-${i}`);
      try {
        expect(() => blocked.reserveAccount('admin')).toThrow(expect.objectContaining({ retryAfterSeconds: wait }));
      } finally { blocked.finish(); }
      vi.advanceTimersByTime(wait * 1000);
    }
    vi.advanceTimersByTime(15 * 60 * 1000);
    const expired = throttle.begin('new-source');
    expired.reserveAccount('admin');
    expired.finish('failure');
    const next = throttle.begin('another-source');
    expect(() => next.reserveAccount('admin')).not.toThrow();
    next.finish();
  });

  it('bounds state without evicting live cooldowns and recovers capacity after expiry', () => {
    vi.useFakeTimers();
    const throttle = new LoginThrottle();
    for (let i = 0; i < 5000; i++) {
      const attempt = throttle.begin(`source-${i}`);
      attempt.reserveAccount(`user-${i}`);
      attempt.finish('failure');
    }
    expect(() => throttle.begin('extra-source')).toThrow(TooManyRequestsError);
    const existing = throttle.begin('source-0');
    expect(() => existing.reserveAccount('user-0')).not.toThrow();
    existing.finish();
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(() => throttle.begin('extra-source').finish()).not.toThrow();
  });

  it('canonicalizes trusted source IPs and falls back safely for missing or invalid headers', () => {
    vi.stubEnv('AUTH_TRUST_PROXY', 'true');
    const request = (ip: string) => new Request('http://localhost', { headers: { 'x-real-ip': ip } });
    expect(getLoginSource(request('::ffff:192.0.2.1'))).toBe(getLoginSource(request('192.0.2.1')));
    expect(getLoginSource(request('2001:0db8:0000::1'))).toBe(getLoginSource(request('2001:db8::1')));
    expect(getLoginSource(request('192.0.2.1, 198.51.100.1'))).toBe('unknown');
    expect(getLoginSource(request('fe80::1%eth0'))).toBe('unknown');
    expect(getLoginSource(new Request('http://localhost', { headers: { 'x-forwarded-for': '192.0.2.1' } }))).toBe('unknown');
    vi.stubEnv('AUTH_TRUST_PROXY', 'false');
    expect(getLoginSource(request('192.0.2.1'))).toBe('unknown');
  });
});
