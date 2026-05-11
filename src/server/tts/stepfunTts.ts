const DEFAULT_STEPFUN_TTS_TIMEOUT_MS = 120_000;

function resolveStepFunSpeechUrl(apiBaseUrl: string): string {
  const normalized = apiBaseUrl.replace(/\/+$/, '') || 'https://api.stepfun.com/v1';
  if (/\/audio\/speech$/i.test(normalized)) return normalized;
  return `${normalized}/audio/speech`;
}

export async function synthesizeStepFunSpeech(input: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  text: string;
  responseFormat: string;
  speed: number;
  volume: number;
  timeoutMs?: number;
}): Promise<Buffer> {
  const speechUrl = resolveStepFunSpeechUrl(input.apiBaseUrl);
  const signal = AbortSignal.timeout(input.timeoutMs ?? DEFAULT_STEPFUN_TTS_TIMEOUT_MS);
  const res = await fetch(speechUrl, {
    method: 'POST',
    signal,
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      input: input.text,
      voice: input.voice,
      response_format: input.responseFormat,
      speed: input.speed,
      volume: input.volume,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`StepFun TTS failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
