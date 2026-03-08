const selectors = 'p,li,h1,h2,h3,h4,h5,h6,blockquote';

type Segment = {
  segmentIndex: number;
  status: string;
  translatedText: string | null;
  errorMessage?: string | null;
};

function ensureRenderableNodes(doc: Document): Element[] {
  const nodes = Array.from(doc.body.querySelectorAll(selectors));
  if (nodes.length > 0) return nodes;

  const plainText = doc.body.textContent?.trim() ?? '';
  if (!plainText || doc.body.children.length > 0) return nodes;

  const paragraph = doc.createElement('p');
  paragraph.textContent = plainText;
  doc.body.innerHTML = '';
  doc.body.appendChild(paragraph);
  return [paragraph];
}

export function buildImmersiveHtml(baseHtml: string, segments: Segment[]): string {
  if (typeof DOMParser !== 'function') {
    return baseHtml;
  }

  const doc = new DOMParser().parseFromString(baseHtml, 'text/html');
  const nodes = ensureRenderableNodes(doc);

  const latestByIndex = new Map<number, Segment>();
  for (const segment of segments) {
    if (!Number.isInteger(segment.segmentIndex) || segment.segmentIndex < 0) continue;
    latestByIndex.set(segment.segmentIndex, segment);
  }

  const orderedIndices = Array.from(latestByIndex.keys()).sort((a, b) => a - b);

  for (const segmentIndex of orderedIndices) {
    const segment = latestByIndex.get(segmentIndex);
    if (!segment) continue;

    const target = nodes[segmentIndex];
    if (!target) {
      console.warn(`[immersiveRender] Missing target node for segmentIndex=${segmentIndex}`);
      continue;
    }

    if (segment.status === 'succeeded') {
      if (!segment.translatedText) continue;
      const translated = doc.createElement('p');
      translated.className = 'ff-translation';
      translated.textContent = segment.translatedText;
      target.insertAdjacentElement('afterend', translated);
      continue;
    }

    if (segment.status === 'running' || segment.status === 'pending') {
      const pending = doc.createElement('p');
      pending.className = 'ff-translation ff-translation-pending';
      pending.textContent = '正在翻译这段…';
      target.insertAdjacentElement('afterend', pending);
      continue;
    }

    if (segment.status === 'failed') {
      const failed = doc.createElement('div');
      failed.className = 'ff-translation ff-translation-failed';
      failed.setAttribute('data-segment-index', String(segmentIndex));

      const message = doc.createElement('p');
      message.textContent = segment.errorMessage || '这段内容暂时翻译失败';
      failed.appendChild(message);

      const retryButton = doc.createElement('button');
      retryButton.setAttribute('type', 'button');
      retryButton.setAttribute('data-action', 'retry-segment');
      retryButton.setAttribute('data-segment-index', String(segmentIndex));
      retryButton.textContent = '重试这段';
      failed.appendChild(retryButton);

      target.insertAdjacentElement('afterend', failed);
    }
  }

  return doc.body.innerHTML;
}
