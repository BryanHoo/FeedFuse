import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPrivateFmEpisodeByIdMock = vi.fn();
const readPrivateFmAudioPartMock = vi.fn();

vi.mock('@/server/auth/session', () => ({
  requireApiSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../../../../server/db/pool', () => ({
  getPool: () => ({ query: vi.fn() }),
}));

vi.mock('../../../../../../../server/repositories/privateFmRepo', () => ({
  getPrivateFmEpisodeById: (...args: unknown[]) => getPrivateFmEpisodeByIdMock(...args),
}));

vi.mock('../../../../../../../server/private-fm/mediaStorage', () => ({
  readPrivateFmAudioPart: (...args: unknown[]) => readPrivateFmAudioPartMock(...args),
}));

describe('/api/private-fm/episodes/[episodeId]/audio/[part]', () => {
  beforeEach(() => {
    getPrivateFmEpisodeByIdMock.mockReset();
    readPrivateFmAudioPartMock.mockReset();
    readPrivateFmAudioPartMock.mockResolvedValue(Buffer.from('audio'));
  });

  it('streams merged audio when part is full', async () => {
    getPrivateFmEpisodeByIdMock.mockResolvedValue({
      id: '1',
      status: 'succeeded',
      mergedAudioPath: 'private-fm/1/full.mp3',
      audioPaths: ['private-fm/1/000.mp3'],
      responseFormat: 'mp3',
    });

    const mod = await import('./route');
    const res = await mod.GET(
      new Request('http://localhost/api/private-fm/episodes/1/audio/full'),
      { params: Promise.resolve({ episodeId: '1', part: 'full' }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(readPrivateFmAudioPartMock).toHaveBeenCalledWith('private-fm/1/full.mp3');
  });
});
