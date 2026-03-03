import { JSDOM } from 'jsdom';

export const translatableSelectors = [
  'p',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'td',
  'th',
] as const;

export interface TranslatableSegment {
  id: string;
  tagName: string;
  text: string;
}

export interface TranslatedSegment extends TranslatableSegment {
  translatedText: string;
}

interface SegmentNodeRef {
  id: string;
  element: Element;
  text: string;
}

interface TranslateBatchInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  texts: string[];
}

interface TranslateSegmentsInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  segments: TranslatableSegment[];
  batchSize?: number;
}

interface ChatCompletionMessage {
  content?: unknown;
}

interface ChatCompletionChoice {
  message?: ChatCompletionMessage;
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizeVisibleText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function unwrapCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function getMessageContent(payload: unknown): string {
  const content = (
    payload as Partial<ChatCompletionResponse> | null
  )?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid bilingual translation response: missing content');
  }

  return unwrapCodeFence(content);
}

function parseBatchTranslations(content: string, expectedCount: number): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid bilingual translation response: expected JSON array');
  }

  if (!Array.isArray(parsed) || parsed.length !== expectedCount) {
    throw new Error('Invalid bilingual translation response: unexpected array length');
  }

  return parsed.map((item) => {
    if (typeof item !== 'string') {
      throw new Error('Invalid bilingual translation response: non-string item');
    }
    return item.trim();
  });
}

function collectSegmentNodeRefs(document: Document): SegmentNodeRef[] {
  const selector = translatableSelectors.join(',');
  const elements = Array.from(document.querySelectorAll(selector));
  const refs: SegmentNodeRef[] = [];
  let index = 0;

  for (const element of elements) {
    const cloned = element.cloneNode(true) as Element;
    cloned.querySelectorAll('code, pre').forEach((node) => node.remove());

    const text = normalizeVisibleText(cloned.textContent ?? '');
    if (!text) continue;

    refs.push({
      id: `seg-${index++}`,
      element,
      text,
    });
  }

  return refs;
}

async function translateBatch(input: TranslateBatchInput): Promise<string[]> {
  const baseUrl = normalizeBaseUrl(input.apiBaseUrl);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            '你是翻译助手。把用户给出的字符串数组逐项翻译为简体中文，保持数组顺序和长度完全一致。只输出 JSON 字符串数组，不要输出解释。',
        },
        {
          role: 'user',
          content: JSON.stringify(input.texts),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Bilingual translate API failed: ${response.status} ${detail}`.trim());
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const content = getMessageContent(payload);
  return parseBatchTranslations(content, input.texts.length);
}

export function extractTranslatableSegments(html: string): TranslatableSegment[] {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const segments: TranslatableSegment[] = collectSegmentNodeRefs(document).map((ref) => ({
    id: ref.id,
    tagName: ref.element.tagName.toLowerCase(),
    text: ref.text,
  }));

  dom.window.close();
  return segments;
}

export function reconstructBilingualHtml(
  html: string,
  translatedSegments: TranslatedSegment[],
): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const translatedById = new Map<string, TranslatedSegment>(
    translatedSegments.map((segment) => [segment.id, segment]),
  );

  const refs = collectSegmentNodeRefs(document);
  for (const ref of refs) {
    const translated = translatedById.get(ref.id);
    if (!translated) continue;

    const wrapper = document.createElement('div');
    wrapper.className = 'ff-bilingual-block';
    wrapper.setAttribute('data-segment-id', ref.id);

    const originalEl = ref.element.cloneNode(true) as Element;
    originalEl.classList.add('ff-original');

    const translationEl = document.createElement(ref.element.tagName.toLowerCase());
    translationEl.className = 'ff-translation';
    translationEl.textContent = translated.translatedText;

    wrapper.append(originalEl, translationEl);
    ref.element.replaceWith(wrapper);
  }

  const output = document.body.innerHTML;
  dom.window.close();
  return output;
}

export async function translateSegmentsInBatches(
  input: TranslateSegmentsInput,
): Promise<TranslatedSegment[]> {
  if (input.segments.length === 0) return [];

  const batchSize = Math.max(1, Math.floor(input.batchSize ?? 20));
  const translated: TranslatedSegment[] = [];

  for (let i = 0; i < input.segments.length; i += batchSize) {
    const batch = input.segments.slice(i, i + batchSize);
    const texts = batch.map((item) => item.text);
    const batchTranslatedTexts = await translateBatch({
      apiBaseUrl: input.apiBaseUrl,
      apiKey: input.apiKey,
      model: input.model,
      texts,
    });

    for (let j = 0; j < batch.length; j += 1) {
      translated.push({
        ...batch[j],
        translatedText: batchTranslatedTexts[j],
      });
    }
  }

  return translated;
}
