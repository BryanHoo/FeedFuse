export interface ArticleOutlineItem {
  id: string;
  level: 1 | 2 | 3;
  text: string;
  element: HTMLHeadingElement;
}

export interface ArticleOutlineMarker {
  id: string;
  level: 1 | 2 | 3;
  text: string;
  topRatio: number;
}

export interface ArticleOutlineViewport {
  top: number;
  height: number;
}

const selector = 'h1, h2, h3';

function slugifyHeading(text: string) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

export function extractArticleOutline(root: HTMLElement): ArticleOutlineItem[] {
  const seen = new Map<string, number>();

  return Array.from(root.querySelectorAll<HTMLHeadingElement>(selector)).flatMap((element) => {
    const text = element.textContent?.trim() ?? '';
    if (!text) return [];

    const base = `article-outline-${slugifyHeading(text)}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;

    if (!element.id) {
      element.id = id;
    }

    return [
      {
        id: element.id,
        level: Number(element.tagName[1]) as 1 | 2 | 3,
        text,
        element,
      },
    ];
  });
}
