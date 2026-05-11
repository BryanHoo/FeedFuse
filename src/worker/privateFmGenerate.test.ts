import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('runPrivateFmGenerate', () => {
  it('fails the episode with a readable code when StepFun API key is missing', async () => {
    const pool = { query: vi.fn() } as unknown as Pool;
    const markFailed = vi.fn().mockResolvedValue(undefined);
    const { runPrivateFmGenerate } = await import('./privateFmGenerate');

    await runPrivateFmGenerate({
      pool,
      episodeId: 'episode-1',
      deps: {
        getPrivateFmEpisodeById: vi.fn().mockResolvedValue({
          id: 'episode-1',
          articleId: 'article-1',
          runId: 'run-1',
          status: 'queued',
        }),
        getPrivateFmApiKey: vi.fn().mockResolvedValue(''),
        markPrivateFmEpisodeRunning: vi.fn().mockResolvedValue(undefined),
        markPrivateFmEpisodeFailed: markFailed,
      },
    });

    expect(markFailed).toHaveBeenCalledWith(
      pool,
      'episode-1',
      expect.objectContaining({ errorCode: 'missing_private_fm_api_key' }),
    );
  });

  it('reuses an existing script when retrying after a TTS failure', async () => {
    const pool = { query: vi.fn() } as unknown as Pool;
    const composeScript = vi.fn().mockResolvedValue('新的口播稿');
    const synthesize = vi.fn().mockResolvedValue(Buffer.from('audio'));
    const mergeAudioParts = vi.fn().mockResolvedValue('private-fm/episode-1/full.mp3');
    const markScriptReady = vi.fn().mockResolvedValue(undefined);
    const markSucceeded = vi.fn().mockResolvedValue(undefined);
    const { runPrivateFmGenerate } = await import('./privateFmGenerate');

    await runPrivateFmGenerate({
      pool,
      episodeId: 'episode-1',
      deps: {
        getPrivateFmEpisodeById: vi.fn().mockResolvedValue({
          id: 'episode-1',
          articleId: 'article-1',
          runId: 'run-1',
          status: 'failed',
          scriptText: '已有口播稿',
          audioPaths: [],
        }),
        getPrivateFmApiKey: vi.fn().mockResolvedValue('tts-key'),
        getAiApiKey: vi.fn().mockResolvedValue('ai-key'),
        getUiSettings: vi.fn().mockResolvedValue({}),
        listSourceArticlesByRunId: vi.fn().mockResolvedValue([]),
        markPrivateFmEpisodeRunning: vi.fn().mockResolvedValue(undefined),
        markPrivateFmEpisodeScriptReady: markScriptReady,
        markPrivateFmEpisodeSucceeded: markSucceeded,
        markPrivateFmEpisodeFailed: vi.fn().mockResolvedValue(undefined),
        composePrivateFmScript: composeScript,
        synthesizeStepFunSpeech: synthesize,
        writePrivateFmAudioPart: vi.fn().mockResolvedValue('private-fm/episode-1/000.mp3'),
        mergePrivateFmAudioParts: mergeAudioParts,
      },
    });

    expect(composeScript).not.toHaveBeenCalled();
    expect(markScriptReady).toHaveBeenCalledWith(pool, 'episode-1', {
      scriptText: '已有口播稿',
    });
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ text: '已有口播稿' }),
    );
    expect(markSucceeded).toHaveBeenCalledWith(
      pool,
      'episode-1',
      expect.objectContaining({
        scriptText: '已有口播稿',
        mergedAudioPath: 'private-fm/episode-1/full.mp3',
      }),
    );
  });

  it('merges generated TTS parts before marking the episode succeeded', async () => {
    const pool = { query: vi.fn() } as unknown as Pool;
    const writeAudioPart = vi
      .fn()
      .mockResolvedValueOnce('private-fm/episode-1/000.mp3')
      .mockResolvedValueOnce('private-fm/episode-1/001.mp3');
    const mergeAudioParts = vi.fn().mockResolvedValue('private-fm/episode-1/full.mp3');
    const markSucceeded = vi.fn().mockResolvedValue(undefined);
    const { runPrivateFmGenerate } = await import('./privateFmGenerate');

    await runPrivateFmGenerate({
      pool,
      episodeId: 'episode-1',
      deps: {
        getPrivateFmEpisodeById: vi.fn().mockResolvedValue({
          id: 'episode-1',
          articleId: 'article-1',
          runId: 'run-1',
          status: 'script_ready',
          scriptText: `${'一'.repeat(999)}\n${'二'.repeat(999)}`,
          audioPaths: [],
        }),
        getPrivateFmApiKey: vi.fn().mockResolvedValue('tts-key'),
        getUiSettings: vi.fn().mockResolvedValue({}),
        markPrivateFmEpisodeRunning: vi.fn().mockResolvedValue(undefined),
        markPrivateFmEpisodeScriptReady: vi.fn().mockResolvedValue(undefined),
        markPrivateFmEpisodeSucceeded: markSucceeded,
        markPrivateFmEpisodeFailed: vi.fn().mockResolvedValue(undefined),
        synthesizeStepFunSpeech: vi.fn().mockResolvedValue(Buffer.from('audio')),
        writePrivateFmAudioPart: writeAudioPart,
        mergePrivateFmAudioParts: mergeAudioParts,
      },
    });

    expect(mergeAudioParts).toHaveBeenCalledWith({
      episodeId: 'episode-1',
      audioPaths: ['private-fm/episode-1/000.mp3', 'private-fm/episode-1/001.mp3'],
      extension: 'mp3',
    });
    expect(markSucceeded).toHaveBeenCalledWith(
      pool,
      'episode-1',
      expect.objectContaining({
        audioPaths: ['private-fm/episode-1/000.mp3', 'private-fm/episode-1/001.mp3'],
        mergedAudioPath: 'private-fm/episode-1/full.mp3',
      }),
    );
  });

  it('merges existing succeeded audio parts without regenerating TTS when merged audio is missing', async () => {
    const pool = { query: vi.fn() } as unknown as Pool;
    const mergeAudioParts = vi.fn().mockResolvedValue('private-fm/episode-1/full.mp3');
    const markSucceeded = vi.fn().mockResolvedValue(undefined);
    const synthesize = vi.fn();
    const { runPrivateFmGenerate } = await import('./privateFmGenerate');

    await runPrivateFmGenerate({
      pool,
      episodeId: 'episode-1',
      deps: {
        getPrivateFmEpisodeById: vi.fn().mockResolvedValue({
          id: 'episode-1',
          articleId: 'article-1',
          runId: 'run-1',
          status: 'succeeded',
          scriptText: '已有口播稿',
          audioPaths: ['private-fm/episode-1/000.mp3', 'private-fm/episode-1/001.mp3'],
          mergedAudioPath: null,
          ttsModel: 'stepaudio-2.5-tts',
          voice: 'elegantgentle-female',
          responseFormat: 'mp3',
        }),
        markPrivateFmEpisodeSucceeded: markSucceeded,
        mergePrivateFmAudioParts: mergeAudioParts,
        synthesizeStepFunSpeech: synthesize,
      },
    });

    expect(synthesize).not.toHaveBeenCalled();
    expect(mergeAudioParts).toHaveBeenCalledWith({
      episodeId: 'episode-1',
      audioPaths: ['private-fm/episode-1/000.mp3', 'private-fm/episode-1/001.mp3'],
      extension: 'mp3',
    });
    expect(markSucceeded).toHaveBeenCalledWith(
      pool,
      'episode-1',
      expect.objectContaining({ mergedAudioPath: 'private-fm/episode-1/full.mp3' }),
    );
  });

  it('skips stale jobs when a newer private FM job is recorded on the episode', async () => {
    const pool = { query: vi.fn() } as unknown as Pool;
    const markRunning = vi.fn().mockResolvedValue(undefined);
    const synthesize = vi.fn().mockResolvedValue(Buffer.from('audio'));
    const { runPrivateFmGenerate } = await import('./privateFmGenerate');

    await runPrivateFmGenerate({
      pool,
      episodeId: 'episode-1',
      jobId: 'job-old',
      deps: {
        getPrivateFmEpisodeById: vi.fn().mockResolvedValue({
          id: 'episode-1',
          articleId: 'article-1',
          runId: 'run-1',
          status: 'queued',
          scriptText: null,
          audioPaths: [],
          jobId: 'job-new',
        }),
        markPrivateFmEpisodeRunning: markRunning,
        synthesizeStepFunSpeech: synthesize,
      },
    });

    expect(markRunning).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('stores a readable StepFun HTTP error when TTS rejects the request', async () => {
    const pool = { query: vi.fn() } as unknown as Pool;
    const markFailed = vi.fn().mockResolvedValue(undefined);
    const { runPrivateFmGenerate } = await import('./privateFmGenerate');

    await runPrivateFmGenerate({
      pool,
      episodeId: 'episode-1',
      jobId: 'job-1',
      deps: {
        getPrivateFmEpisodeById: vi.fn().mockResolvedValue({
          id: 'episode-1',
          articleId: 'article-1',
          runId: 'run-1',
          status: 'queued',
          scriptText: '已有口播稿',
          audioPaths: [],
          jobId: 'job-1',
        }),
        getPrivateFmApiKey: vi.fn().mockResolvedValue('tts-key'),
        getUiSettings: vi.fn().mockResolvedValue({}),
        markPrivateFmEpisodeRunning: vi.fn().mockResolvedValue(undefined),
        markPrivateFmEpisodeScriptReady: vi.fn().mockResolvedValue(undefined),
        markPrivateFmEpisodeFailed: markFailed,
        synthesizeStepFunSpeech: vi.fn().mockRejectedValue(
          new Error('StepFun TTS failed: HTTP 400 {"error":"invalid voice"}'),
        ),
      },
    });

    expect(markFailed).toHaveBeenCalledWith(
      pool,
      'episode-1',
      expect.objectContaining({
        errorCode: 'private_fm_tts_http_error',
        errorMessage: expect.stringContaining('HTTP 400'),
      }),
    );
  });
});
