import { describe, expect, it } from 'vitest';
import { getRssNetworkConfig, parseEnv } from '@/server/infra/env';

describe('env', () => {
  it('throws when DATABASE_URL is missing', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('ignores AI_API_KEY from env input', () => {
    const env = parseEnv({ DATABASE_URL: 'postgres://example', AI_API_KEY: 'sk-test' });

    expect(Object.prototype.hasOwnProperty.call(env, 'AI_API_KEY')).toBe(false);
  });

  it('treats empty AUTH_INITIAL_PASSWORD as undefined', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://example',
      AUTH_INITIAL_PASSWORD: '',
    });

    expect(env.AUTH_INITIAL_PASSWORD).toBeUndefined();
  });

  it('parses AUTH_INITIAL_PASSWORD when provided', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://example',
      AUTH_INITIAL_PASSWORD: 'initial-password',
    });

    expect(env.AUTH_INITIAL_PASSWORD).toBe('initial-password');
  });

  it('treats empty IMAGE_PROXY_SECRET as undefined', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://example',
      IMAGE_PROXY_SECRET: '',
    });

    expect(env.IMAGE_PROXY_SECRET).toBeUndefined();
  });

  it('parses IMAGE_PROXY_SECRET when provided', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://example',
      IMAGE_PROXY_SECRET: 'test-image-proxy-secret',
    });

    expect(env.IMAGE_PROXY_SECRET).toBe('test-image-proxy-secret');
  });

  it('parses optional AUTH_COOKIE_SECURE values', () => {
    expect(parseEnv({ DATABASE_URL: 'postgres://example' }).AUTH_COOKIE_SECURE).toBeUndefined();
    expect(
      parseEnv({
        DATABASE_URL: 'postgres://example',
        AUTH_COOKIE_SECURE: 'true',
      }).AUTH_COOKIE_SECURE,
    ).toBe(true);
    expect(
      parseEnv({
        DATABASE_URL: 'postgres://example',
        AUTH_COOKIE_SECURE: 'false',
      }).AUTH_COOKIE_SECURE,
    ).toBe(false);
  });

  it('rejects invalid AUTH_COOKIE_SECURE values', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://example',
        AUTH_COOKIE_SECURE: 'sometimes',
      }),
    ).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it('only accepts explicit boolean values for AUTH_TRUST_PROXY', () => {
    expect(parseEnv({ DATABASE_URL: 'postgres://example' }).AUTH_TRUST_PROXY).toBeUndefined();
    expect(parseEnv({ DATABASE_URL: 'postgres://example', AUTH_TRUST_PROXY: 'true' }).AUTH_TRUST_PROXY).toBe(true);
    expect(parseEnv({ DATABASE_URL: 'postgres://example', AUTH_TRUST_PROXY: 'false' }).AUTH_TRUST_PROXY).toBe(false);
    expect(() => parseEnv({ DATABASE_URL: 'postgres://example', AUTH_TRUST_PROXY: 'all' })).toThrow(/AUTH_TRUST_PROXY/);
  });

  it('defaults RSS_NETWORK_MODE to public with empty allowed cidrs', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://example',
    });

    expect(env.RSS_NETWORK_MODE).toBe('public');
    expect(env.RSS_ALLOWED_CIDRS).toEqual([]);
  });

  it('parses RSS_NETWORK_MODE and RSS_ALLOWED_CIDRS', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://example',
      RSS_NETWORK_MODE: 'custom',
      RSS_ALLOWED_CIDRS: '192.168.0.0/16,10.0.0.0/8',
    });

    expect(env.RSS_NETWORK_MODE).toBe('custom');
    expect(env.RSS_ALLOWED_CIDRS).toEqual(['192.168.0.0/16', '10.0.0.0/8']);
  });

  it('parses RSS network config independently from DATABASE_URL', () => {
    expect(getRssNetworkConfig({})).toEqual({
      mode: 'public',
      allowedCidrs: [],
    });
    expect(
      getRssNetworkConfig({
        RSS_NETWORK_MODE: 'custom',
        RSS_ALLOWED_CIDRS: '100.64.0.0/10',
      }),
    ).toEqual({
      mode: 'custom',
      allowedCidrs: ['100.64.0.0/10'],
    });
  });

  it('rejects invalid RSS_ALLOWED_CIDRS values', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://example',
        RSS_NETWORK_MODE: 'custom',
        RSS_ALLOWED_CIDRS: 'bad-cidr',
      }),
    ).toThrow(/Invalid CIDR/);
  });
});
