import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => {
  const lookup = vi.fn();
  return {
    lookup,
    default: { lookup },
  };
});

import { lookup } from 'node:dns/promises';
import { isSafeMediaUrl } from '@/server/integrations/media/mediaProxyGuard';

describe('mediaProxyGuard', () => {
  const lookupMock = vi.mocked(lookup);

  beforeEach(() => {
    lookupMock.mockReset();
    vi.unstubAllEnvs();
  });

  it('rejects local media targets by default', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(isSafeMediaUrl('http://localhost/image.jpg')).resolves.toBe(false);
    await expect(isSafeMediaUrl('http://127.0.0.1/image.jpg')).resolves.toBe(false);
    await expect(isSafeMediaUrl('http://host.docker.internal/image.jpg')).resolves.toBe(false);
  });

  it('rejects domains resolving to private addresses', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    await expect(isSafeMediaUrl('https://internal.example/image.jpg')).resolves.toBe(false);
  });

  it('accepts public https urls without credentials', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    await expect(isSafeMediaUrl('https://public.example/image.jpg')).resolves.toBe(true);
  });

  it('accepts fake-ip media targets when network compatibility is enabled', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'fake-ip');
    lookupMock.mockResolvedValue([{ address: '198.18.0.46', family: 4 }]);

    await expect(isSafeMediaUrl('https://img.3dmgame.com/image.jpg')).resolves.toBe(true);
    await expect(isSafeMediaUrl('https://cdn.3dmgame.com/video.mp4')).resolves.toBe(true);
    await expect(isSafeMediaUrl('https://cdn.3dmgame.com/audio.mp3')).resolves.toBe(true);
  });

  it('keeps rejecting fake-ip media targets by default', async () => {
    lookupMock.mockResolvedValue([{ address: '198.18.0.46', family: 4 }]);

    await expect(isSafeMediaUrl('https://img.3dmgame.com/image.jpg')).resolves.toBe(false);
    await expect(isSafeMediaUrl('https://cdn.3dmgame.com/video.mp4')).resolves.toBe(false);
  });

  it('accepts RFC1918 media targets in lan mode', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'lan');
    lookupMock.mockResolvedValue([{ address: '192.168.1.20', family: 4 }]);

    await expect(isSafeMediaUrl('https://nas.example/image.jpg')).resolves.toBe(true);
    await expect(isSafeMediaUrl('http://10.8.0.2/video.mp4')).resolves.toBe(true);
    await expect(isSafeMediaUrl('http://172.16.5.20/audio.mp3')).resolves.toBe(true);
  });

  it('accepts explicitly allowed media CIDRs in custom mode', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '100.64.0.0/10,192.168.0.0/16');
    lookupMock.mockResolvedValue([{ address: '100.64.1.2', family: 4 }]);

    await expect(isSafeMediaUrl('https://media.example/image.jpg')).resolves.toBe(true);
    await expect(isSafeMediaUrl('http://192.168.1.2/audio.mp3')).resolves.toBe(true);
  });

  it('accepts .local media hostnames after lan/custom DNS resolution', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'lan');
    lookupMock.mockResolvedValue([{ address: '192.168.1.10', family: 4 }]);
    await expect(isSafeMediaUrl('http://nas.local/image.jpg')).resolves.toBe(true);

    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '192.168.0.0/16');
    lookupMock.mockResolvedValue([{ address: '192.168.1.11', family: 4 }]);
    await expect(isSafeMediaUrl('http://media.local/video.mp4')).resolves.toBe(true);
  });

  it('rejects loopback media in lan mode and checks the Docker host address', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'lan');

    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(isSafeMediaUrl('http://localhost/image.jpg')).resolves.toBe(false);
    await expect(isSafeMediaUrl('http://127.0.0.1/image.jpg')).resolves.toBe(false);
    lookupMock.mockResolvedValue([{ address: '192.168.65.254', family: 4 }]);
    await expect(isSafeMediaUrl('http://host.docker.internal/image.jpg')).resolves.toBe(true);
  });

  it('accepts DNS loopback when custom CIDR allows it', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '127.0.0.0/8');
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(isSafeMediaUrl('https://loopback.example/image.jpg')).resolves.toBe(true);
  });

  it('rejects credentialed urls', async () => {
    await expect(isSafeMediaUrl('https://user:pass@example.com/image.jpg')).resolves.toBe(false);
  });
});
