const selectors = 'p,li,h1,h2,h3,h4,h5,h6,blockquote';

type Segment = {
  segmentIndex: number;
  status: string;
  translatedText: string | null;
};

export function buildImmersiveHtml(baseHtml: string, segments: Segment[]): string {
  const doc = new DOMParser().parseFromString(baseHtml, 'text/html');
  const nodes = Array.from(doc.body.querySelectorAll(selectors));

  for (const segment of segments) {
    if (segment.status !== 'succeeded') continue;

    const target = nodes[segment.segmentIndex];
    if (!target || !segment.translatedText) continue;

    const translated = doc.createElement('p');
    translated.className = 'ff-translation';
    translated.textContent = segment.translatedText;
    target.insertAdjacentElement('afterend', translated);
  }

  return doc.body.innerHTML;
}
