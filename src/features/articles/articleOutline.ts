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

export interface ArticleOutlineVisibilityInput {
  headingCount: number;
  contentHeight: number;
  viewportHeight: number;
  isDesktop: boolean;
}

export interface ArticleOutlinePanelLayoutInput {
  viewportLeft: number;
  viewportRight: number;
  contentRight: number;
}

export interface ArticleOutlinePanelLayout {
  visible: boolean;
  width: number;
  right: number;
}

const selector = 'h1, h2, h3';
const ACTIVE_HEADING_OFFSET_PX = 24;
const OUTLINE_MIN_CONTENT_RATIO = 1.25;
const OUTLINE_PANEL_GAP_PX = 16;
const OUTLINE_PANEL_RIGHT_PADDING_PX = 24;
const OUTLINE_PANEL_MIN_WIDTH_PX = 160;
const OUTLINE_PANEL_MAX_WIDTH_PX = 220;
const OUTLINE_PANEL_HIDE_THRESHOLD_PX =
  OUTLINE_PANEL_MIN_WIDTH_PX + OUTLINE_PANEL_GAP_PX + OUTLINE_PANEL_RIGHT_PADDING_PX;

function clampRatio(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

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

export function buildArticleOutlineMarkers(
  items: ArticleOutlineItem[],
  root: HTMLElement,
): ArticleOutlineMarker[] {
  const totalHeight = Math.max(root.scrollHeight, root.clientHeight, 1);

  return items.map((item) => ({
    id: item.id,
    level: item.level,
    text: item.text,
    topRatio: clampRatio(item.element.offsetTop / totalHeight),
  }));
}

export function getArticleOutlineViewport(scrollContainer: HTMLElement): ArticleOutlineViewport {
  const scrollHeight = Math.max(scrollContainer.scrollHeight, scrollContainer.clientHeight, 1);
  const maxScroll = Math.max(scrollHeight - scrollContainer.clientHeight, 1);

  return {
    top: clampRatio(scrollContainer.scrollTop / maxScroll),
    height: clampRatio(scrollContainer.clientHeight / scrollHeight),
  };
}

export function getActiveArticleOutlineHeadingId(
  items: ArticleOutlineItem[],
  scrollTop: number,
): string | null {
  if (items.length === 0) {
    return null;
  }

  const threshold = scrollTop + ACTIVE_HEADING_OFFSET_PX;
  let activeHeadingId = items[0]?.id ?? null;

  for (const item of items) {
    if (item.element.offsetTop <= threshold) {
      activeHeadingId = item.id;
      continue;
    }

    break;
  }

  return activeHeadingId;
}

export function shouldShowArticleOutline({
  headingCount,
  contentHeight,
  viewportHeight,
  isDesktop,
}: ArticleOutlineVisibilityInput) {
  if (!isDesktop || headingCount === 0) {
    return false;
  }

  if (!Number.isFinite(contentHeight) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return false;
  }

  return contentHeight / viewportHeight > OUTLINE_MIN_CONTENT_RATIO;
}

export function buildArticleOutlinePanelLayout({
  viewportLeft,
  viewportRight,
  contentRight,
}: ArticleOutlinePanelLayoutInput): ArticleOutlinePanelLayout {
  const availableWidth =
    viewportRight - contentRight - OUTLINE_PANEL_GAP_PX - OUTLINE_PANEL_RIGHT_PADDING_PX;

  if (
    !Number.isFinite(viewportLeft) ||
    !Number.isFinite(viewportRight) ||
    !Number.isFinite(contentRight) ||
    !Number.isFinite(availableWidth) ||
    availableWidth < OUTLINE_PANEL_MIN_WIDTH_PX
  ) {
    return { visible: false, width: 0, right: OUTLINE_PANEL_RIGHT_PADDING_PX };
  }

  return {
    visible: true,
    width: Math.min(
      OUTLINE_PANEL_MAX_WIDTH_PX,
      Math.max(OUTLINE_PANEL_MIN_WIDTH_PX, availableWidth),
    ),
    right: OUTLINE_PANEL_RIGHT_PADDING_PX,
  };
}
