import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('privateFmRepo', () => {
  it('creates an episode for a digest article with queued status', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'episode-1' }] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./privateFmRepo')) as typeof import('./privateFmRepo');

    await mod.createPrivateFmEpisode(pool, {
      articleId: 'article-1',
      runId: 'run-1',
      status: 'queued',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('insert into private_fm_episodes');
    expect(sql).toContain('article_id');
    expect(sql).toContain('run_id');
    expect(sql).toContain('status');
  });

  it('stores generated script and ordered audio paths on success', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./privateFmRepo')) as typeof import('./privateFmRepo');

    await mod.markPrivateFmEpisodeSucceeded(pool, 'episode-1', {
      scriptText: '早上好',
      audioPaths: ['private-fm/episode-1/000.mp3', 'private-fm/episode-1/001.mp3'],
      mergedAudioPath: 'private-fm/episode-1/full.mp3',
      ttsModel: 'stepaudio-2.5-tts',
      voice: 'cixingnansheng',
      responseFormat: 'mp3',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('script_text');
    expect(sql).toContain('audio_paths');
    expect(sql).toContain('merged_audio_path');
    expect(sql).toContain('status =');
    expect(query.mock.calls[0]?.[1]).toContain('private-fm/episode-1/full.mp3');
    expect(query.mock.calls[0]?.[1]).toContain('succeeded');
  });

  it('marks an episode as script_ready after script generation', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./privateFmRepo')) as typeof import('./privateFmRepo');

    await mod.markPrivateFmEpisodeScriptReady(pool, 'episode-1', {
      scriptText: '已有口播稿',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain("status = 'script_ready'");
    expect(sql).toContain('script_text = $2');
  });
});
