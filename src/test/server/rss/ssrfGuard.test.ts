import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => {
  const lookup = vi.fn();
  return {
    lookup,
    default: { lookup },
  };
});

import { lookup } from 'node:dns/promises';
import { getExternalUrlSafety, isSafeExternalUrl } from '@/server/integrations/rss/ssrfGuard';

describe('ssrfGuard', () => {
  const lookupMock = vi.mocked(lookup);

  beforeEach(() => {
    lookupMock.mockReset();
    vi.unstubAllEnvs();
  });

  it.each(['127.0.0.1', '127.1', '2130706433', '[::1]', '[::ffff:127.0.0.1]'])(
    'rejects loopback IP literals by default: %s', async (host) => {
      await expect(isSafeExternalUrl(`http://${host}/feed`)).resolves.toBe(false);
    },
  );

  it.each(['public', 'fake-ip', 'lan'])('rejects localhost in %s mode', async (mode) => {
    vi.stubEnv('RSS_NETWORK_MODE', mode);
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(isSafeExternalUrl('http://localhost/feed')).resolves.toBe(false);
    await expect(isSafeExternalUrl('http://rss.localhost/feed')).resolves.toBe(false);
  });

  it('accepts loopback only when the administrator explicitly allows its CIDR', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '127.0.0.1/32,::1/128');
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(isSafeExternalUrl('http://localhost/feed')).resolves.toBe(true);
    await expect(isSafeExternalUrl('http://127.0.0.1/feed')).resolves.toBe(true);
    await expect(isSafeExternalUrl('http://[::1]/feed')).resolves.toBe(true);
    await expect(isSafeExternalUrl('http://127.0.0.2/feed')).resolves.toBe(false);
  });

  it('rejects Docker host alias by default and checks its resolved CIDR in custom mode', async () => {
    lookupMock.mockResolvedValue([{ address: '192.168.65.254', family: 4 }]);
    await expect(isSafeExternalUrl('http://host.docker.internal/feed')).resolves.toBe(false);
    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '192.168.65.254/32');
    await expect(isSafeExternalUrl('http://host.docker.internal/feed')).resolves.toBe(true);
    lookupMock.mockResolvedValue([{ address: '192.168.65.253', family: 4 }]);
    await expect(isSafeExternalUrl('http://host.docker.internal/feed')).resolves.toBe(false);
  });

  it.each(['localhost', 'rss.localhost', 'host.docker.internal', 'host.docker.internal.'])(
    'does not use unresolved-host fallback for local aliases: %s', async (host) => {
      lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
      await expect(isSafeExternalUrl(`http://${host}/feed`, {
        allowUnresolvedHostname: true,
      })).resolves.toBe(false);
    },
  );

  it('ignores allowed CIDRs outside custom mode', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'public');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '127.0.0.0/8');
    await expect(isSafeExternalUrl('http://127.0.0.1/feed')).resolves.toBe(false);
  });

  it('rejects non-http protocols', async () => {
    await expect(isSafeExternalUrl('ftp://example.com/feed')).resolves.toBe(false);
  });

  it('rejects urls with credentials', async () => {
    await expect(isSafeExternalUrl('https://user:pass@example.com/feed')).resolves.toBe(false);
  });

  it('rejects domains resolving to loopback', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(isSafeExternalUrl('https://internal.test/feed')).resolves.toBe(false);
  });

  it('accepts domains resolving to public ip', async () => {
    lookupMock.mockResolvedValue([{ address: '1.1.1.1', family: 4 }]);
    await expect(isSafeExternalUrl('https://public.test/feed')).resolves.toBe(true);
  });

  it('keeps rejecting unresolved hostnames by default', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND public.example'));
    await expect(isSafeExternalUrl('https://public.example/feed')).resolves.toBe(false);
  });

  it('accepts unresolved public hostnames when explicitly allowed', async () => {
    lookupMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND feeds.ruanyifeng.com'));
    await expect(
      isSafeExternalUrl('https://feeds.ruanyifeng.com/feed', {
        allowUnresolvedHostname: true,
      }),
    ).resolves.toBe(true);
  });

  it('rejects fake-ip addresses by default', async () => {
    await expect(isSafeExternalUrl('http://198.18.0.1/feed')).resolves.toBe(false);
  });

  it('explains fake-ip rejections with the resolved address', async () => {
    lookupMock.mockResolvedValue([{ address: '198.18.0.69', family: 4 }]);

    await expect(getExternalUrlSafety('https://daily.test/feed')).resolves.toEqual({
      safe: false,
      reason: 'fake_ip',
      address: '198.18.0.69',
      mode: 'public',
    });
  });

  it('accepts fake-ip addresses when compatibility is enabled', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'fake-ip');
    await expect(isSafeExternalUrl('http://198.18.0.1/feed')).resolves.toBe(true);
  });

  it('accepts IPv4-mapped fake-ip DNS answers when compatibility is enabled', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'fake-ip');
    lookupMock.mockResolvedValue([
      { address: '::ffff:198.18.0.41', family: 6 },
      { address: '198.18.0.41', family: 4 },
    ]);

    await expect(
      isSafeExternalUrl('https://www.ruanyifeng.com/blog/atom.xml'),
    ).resolves.toBe(true);
  });

  it('accepts IPv4-translated fake-ip DNS answers when compatibility is enabled', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'fake-ip');
    lookupMock.mockResolvedValue([{ address: '::ffff:0:c612:30', family: 6 }]);

    await expect(
      isSafeExternalUrl('https://www.ruanyifeng.com/blog/atom.xml'),
    ).resolves.toBe(true);
  });

  it('rejects fake-ip addresses when compatibility is disabled', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'public');
    await expect(isSafeExternalUrl('http://198.18.0.1/feed')).resolves.toBe(false);
  });

  it('accepts RFC1918 addresses in lan mode', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'lan');
    await expect(isSafeExternalUrl('http://192.168.1.10/feed')).resolves.toBe(true);
    await expect(isSafeExternalUrl('http://10.8.0.2/feed')).resolves.toBe(true);
    await expect(isSafeExternalUrl('http://172.16.5.20/feed')).resolves.toBe(true);
  });

  it('keeps rejecting fake-ip addresses in lan mode', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'lan');
    await expect(isSafeExternalUrl('http://198.18.0.1/feed')).resolves.toBe(false);
  });

  it('accepts .local hostnames when lan mode resolves to RFC1918 addresses', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'lan');
    lookupMock.mockResolvedValue([{ address: '192.168.1.10', family: 4 }]);
    await expect(isSafeExternalUrl('http://nas.local/feed')).resolves.toBe(true);
  });

  it('still rejects fake-ip addresses in custom mode unless CIDR is allowed', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '192.168.0.0/16');
    await expect(isSafeExternalUrl('http://198.18.0.1/feed')).resolves.toBe(false);
  });

  it('accepts explicitly allowed CIDRs in custom mode', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '100.64.0.0/10,192.168.0.0/16');
    await expect(isSafeExternalUrl('http://100.64.1.2/feed')).resolves.toBe(true);
    await expect(isSafeExternalUrl('http://192.168.1.2/feed')).resolves.toBe(true);
  });

  it('accepts .local hostnames when custom mode resolves inside allowed CIDR', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '192.168.0.0/16');
    lookupMock.mockResolvedValue([{ address: '192.168.1.10', family: 4 }]);
    await expect(isSafeExternalUrl('http://nas.local/feed')).resolves.toBe(true);
  });

  it('rejects domains with any unsafe ip', async () => {
    lookupMock.mockResolvedValue([
      { address: '1.1.1.1', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(isSafeExternalUrl('https://mixed.test/feed')).resolves.toBe(false);
  });
});
