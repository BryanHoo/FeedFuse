import { JSDOM } from 'jsdom';

function rewriteSrcset(value: string, rewriteUrl: (url: string) => string): string {
  return value
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => {
      const [rawUrl, ...descriptorParts] = candidate.split(/\s+/);
      const descriptor = descriptorParts.join(' ').trim();
      const proxied = rewriteUrl(rawUrl);

      return descriptor ? `${proxied} ${descriptor}` : proxied;
    })
    .join(', ');
}

export function rewriteHtmlImages(
  html: string | null | undefined,
  rewriteUrl: (url: string) => string,
): string | null {
  if (!html) return null;

  const dom = new JSDOM(`<body>${html}</body>`);
  const { document } = dom.window;

  document.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    if (src) img.setAttribute('src', rewriteUrl(src));

    const srcset = img.getAttribute('srcset');
    if (srcset) img.setAttribute('srcset', rewriteSrcset(srcset, rewriteUrl));
  });

  return document.body.innerHTML;
}
