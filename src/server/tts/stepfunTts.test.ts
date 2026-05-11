import { describe, expect, it, vi } from 'vitest';

describe('synthesizeStepFunSpeech', () => {
  it('passes an abort signal to StepFun fetch so TTS cannot hang forever', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Buffer.from('audio'), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { synthesizeStepFunSpeech } = await import('./stepfunTts');
    await synthesizeStepFunSpeech({
      apiBaseUrl: 'https://api.stepfun.com/v1',
      apiKey: 'tts-key',
      model: 'stepaudio-2.5-tts',
      voice: 'cixingnansheng',
      text: '早上好',
      responseFormat: 'mp3',
      speed: 1,
      volume: 1,
      timeoutMs: 1000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stepfun.com/v1/audio/speech',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('accepts a full StepFun speech endpoint without appending audio/speech twice', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Buffer.from('audio'), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { synthesizeStepFunSpeech } = await import('./stepfunTts');
    await synthesizeStepFunSpeech({
      apiBaseUrl: 'https://api.stepfun.com/v1/audio/speech',
      apiKey: 'tts-key',
      model: 'stepaudio-2.5-tts',
      voice: 'elegantgentle-female',
      text: '早上好',
      responseFormat: 'mp3',
      speed: 1,
      volume: 1,
      timeoutMs: 1000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stepfun.com/v1/audio/speech',
      expect.any(Object),
    );
  });
});
