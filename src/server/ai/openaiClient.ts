import 'server-only';
import OpenAI from 'openai';

export function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function createOpenAIClient(input: { apiBaseUrl: string; apiKey: string }) {
  return new OpenAI({
    apiKey: input.apiKey,
    baseURL: normalizeBaseUrl(input.apiBaseUrl),
    dangerouslyAllowBrowser: true,
  });
}
