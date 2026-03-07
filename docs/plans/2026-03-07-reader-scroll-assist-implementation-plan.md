# Reader Scroll Assist Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 用右下角滚动辅助按钮组替代当前阅读页右侧目录，在桌面端为长文提供阅读百分比和回到顶部入口。

**Architecture:** 继续把滚动事实源留在 `ArticleView`，移除 `ArticleOutlineRail` 的渲染路径，并新增一个局部 `ArticleScrollAssist` 展示组件。显示条件复用现有标题显隐链路，阅读进度基于正文滚动容器的真实高度计算，避免引入新的全局状态或布局列。

**Tech Stack:** React、TypeScript、Vitest、Testing Library、shadcn/ui `Button`、`lucide-react`

---

## Relevant Prior Learnings

- `docs/summaries/2026-03-06-reader-resizable-three-column-layout.md`
- `docs/summaries/2026-03-07-reader-outline-panel-redesign.md`
- `docs/summaries/2026-03-05-translation-preserve-html-structure.md`

### Task 1: Add a dedicated scroll assist component

**Files:**

- Create: `src/features/articles/ArticleScrollAssist.tsx`
- Create: `src/features/articles/ArticleScrollAssist.test.tsx`

**Step 1: Write the failing test**

Create `src/features/articles/ArticleScrollAssist.test.tsx` to cover visibility, percent rendering, clamping, and click passthrough:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArticleScrollAssist from './ArticleScrollAssist';

describe('ArticleScrollAssist', () => {
  it('does not render when visible is false', () => {
    const { container } = render(
      <ArticleScrollAssist visible={false} percent={0} onBackToTop={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the rounded percent text and back-to-top button', () => {
    render(<ArticleScrollAssist visible percent={37} onBackToTop={vi.fn()} />);

    expect(screen.getByText('37%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回到顶部' })).toBeInTheDocument();
  });

  it('clamps invalid percent values to the 0-100 range', () => {
    const { rerender } = render(
      <ArticleScrollAssist visible percent={-12} onBackToTop={vi.fn()} />,
    );

    expect(screen.getByText('0%')).toBeInTheDocument();

    rerender(<ArticleScrollAssist visible percent={160} onBackToTop={vi.fn()} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('calls onBackToTop when the button is clicked', () => {
    const onBackToTop = vi.fn();
    render(<ArticleScrollAssist visible percent={52} onBackToTop={onBackToTop} />);

    fireEvent.click(screen.getByRole('button', { name: '回到顶部' }));

    expect(onBackToTop).toHaveBeenCalledTimes(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/articles/ArticleScrollAssist.test.tsx --project=jsdom --no-file-parallelism`

Expected: FAIL with `Cannot find module './ArticleScrollAssist'`.

**Step 3: Write minimal implementation**

Create `src/features/articles/ArticleScrollAssist.tsx` with a compact vertical floating group, an SVG progress ring, and a shadcn-styled back-to-top button:

```tsx
import { ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export default function ArticleScrollAssist({ visible, percent, onBackToTop }) {
  const safePercent = clampPercent(percent);
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safePercent / 100);

  if (!visible) return null;

  return (
    <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/60 bg-background/80 shadow-sm backdrop-blur-sm">
        <svg viewBox="0 0 48 48" className="absolute h-12 w-12 -rotate-90">
          <circle cx="24" cy="24" r={radius} className="fill-none stroke-border/50" strokeWidth="4" />
          <circle
            cx="24"
            cy="24"
            r={radius}
            className="fill-none stroke-primary transition-all"
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        <span className="relative text-xs font-medium text-foreground">{safePercent}%</span>
      </div>

      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label="回到顶部"
        className="h-14 w-14 rounded-full bg-background/80 shadow-sm backdrop-blur-sm"
        onClick={onBackToTop}
      >
        <ChevronUp className="size-5" />
      </Button>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/articles/ArticleScrollAssist.test.tsx --project=jsdom --no-file-parallelism`

Expected: PASS with `4 passed`.

**Step 5: Commit**

```bash
git add src/features/articles/ArticleScrollAssist.tsx src/features/articles/ArticleScrollAssist.test.tsx
git commit -m "✨ feat(reader-scroll-assist): 添加滚动辅助组件" \
  -m "- 添加阅读百分比圆环与回顶按钮组件\n- 添加显示、clamp 与点击透传测试"
```

### Task 2: Replace the outline panel integration in ArticleView

**Files:**

- Modify: `src/features/articles/ArticleView.tsx`
- Modify: `src/features/articles/ArticleView.outline.test.tsx`

**Step 1: Write the failing test**

Update `src/features/articles/ArticleView.outline.test.tsx` to reflect the new behavior:

```tsx
it('does not render the scroll assist while the title is still visible', async () => {
  renderArticleView();

  expect(screen.queryByText('0%')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '回到顶部' })).not.toBeInTheDocument();
});

it('renders the scroll assist after the article title leaves the viewport', async () => {
  renderArticleView();
  const scrollContainer = await screen.findByTestId('article-scroll-container');

  Object.defineProperty(scrollContainer, 'scrollHeight', { value: 2400, configurable: true });
  Object.defineProperty(scrollContainer, 'clientHeight', { value: 1200, configurable: true });
  scrollContainer.scrollTop = 240;

  fireEvent.scroll(scrollContainer);

  expect(await screen.findByText('20%')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '回到顶部' })).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: '文章目录' })).not.toBeInTheDocument();
});

it('scrolls the article container to top when the back-to-top button is clicked', async () => {
  renderArticleView();
  const scrollContainer = await screen.findByTestId('article-scroll-container');
  const scrollTo = vi.fn();
  scrollContainer.scrollTo = scrollTo;

  Object.defineProperty(scrollContainer, 'scrollHeight', { value: 2400, configurable: true });
  Object.defineProperty(scrollContainer, 'clientHeight', { value: 1200, configurable: true });
  scrollContainer.scrollTop = 240;

  fireEvent.scroll(scrollContainer);
  fireEvent.click(await screen.findByRole('button', { name: '回到顶部' }));

  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/articles/ArticleView.outline.test.tsx --project=jsdom --no-file-parallelism`

Expected: FAIL because the old outline nav still renders and the new scroll assist is missing.

**Step 3: Write minimal implementation**

In `src/features/articles/ArticleView.tsx`:

```tsx
const [scrollAssistPercent, setScrollAssistPercent] = useState(0);
const [articleTitleVisible, setArticleTitleVisible] = useState(true);

const updateScrollAssistState = useCallback((element: HTMLDivElement) => {
  const maxScroll = Math.max(element.scrollHeight - element.clientHeight, 0);
  const nextProgress = maxScroll <= 0 ? 0 : Math.min(1, Math.max(0, element.scrollTop / maxScroll));
  setScrollAssistPercent(Math.round(nextProgress * 100));
  setArticleTitleVisible(element.scrollTop <= FLOATING_TITLE_SCROLL_THRESHOLD_PX);
}, []);

const onArticleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
  const element = event.currentTarget;
  syncOutlineActiveHeading(element, outlineItems);
  reportTitleVisibility(element.scrollTop <= FLOATING_TITLE_SCROLL_THRESHOLD_PX);
  updateScrollAssistState(element);
}, [outlineItems, reportTitleVisibility, syncOutlineActiveHeading, updateScrollAssistState]);

const handleBackToTop = useCallback(() => {
  scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
}, []);

const showScrollAssist = isDesktop && !articleTitleVisible && (scrollContainerRef.current?.scrollHeight ?? 0) > (scrollContainerRef.current?.clientHeight ?? 0);
```

Remove the `ArticleOutlineRail` render block and replace it with:

```tsx
<ArticleScrollAssist
  visible={showScrollAssist}
  percent={scrollAssistPercent}
  onBackToTop={handleBackToTop}
/>
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/articles/ArticleView.outline.test.tsx --project=jsdom --no-file-parallelism`

Expected: PASS with the updated scroll assist assertions.

**Step 5: Commit**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/ArticleView.outline.test.tsx
git commit -m "✨ feat(reader-scroll-assist): 接入阅读页滚动辅助按钮" \
  -m "- 移除阅读页右侧目录入口并接入滚动辅助按钮\n- 复用标题显隐阈值控制显示时机"
```

### Task 3: Remove obsolete outline-only surface and align tests

**Files:**

- Delete: `src/features/articles/ArticleOutlineRail.tsx`
- Delete: `src/features/articles/ArticleOutlineRail.test.tsx`
- Modify: `src/features/articles/articleOutline.test.ts`

**Step 1: Write the failing test**

Add or update a lightweight regression in `src/features/articles/articleOutline.test.ts` or adjacent integration tests to verify that the article no longer renders an outline navigation surface by default:

```tsx
it('does not render outline navigation for long articles anymore', async () => {
  renderArticleView();
  const scrollContainer = await screen.findByTestId('article-scroll-container');

  Object.defineProperty(scrollContainer, 'scrollHeight', { value: 2400, configurable: true });
  Object.defineProperty(scrollContainer, 'clientHeight', { value: 1200, configurable: true });
  scrollContainer.scrollTop = 300;

  fireEvent.scroll(scrollContainer);

  expect(screen.queryByRole('navigation', { name: '文章目录' })).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/articles/ArticleView.outline.test.tsx src/features/articles/ArticleOutlineRail.test.tsx --project=jsdom --no-file-parallelism`

Expected: FAIL because the old outline component and tests are still present.

**Step 3: Write minimal implementation**

Delete the obsolete outline rail files if they are no longer referenced:

```bash
rm src/features/articles/ArticleOutlineRail.tsx
rm src/features/articles/ArticleOutlineRail.test.tsx
```

If `articleOutline.ts` still contains panel layout helpers that become unused after the UI swap, remove only the dead exports while keeping any still-needed heading utilities for future use.

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/articles/ArticleScrollAssist.test.tsx src/features/articles/ArticleView.outline.test.tsx --project=jsdom --no-file-parallelism`

Expected: PASS with all scroll-assist assertions and no outline-panel expectations.

**Step 5: Commit**

```bash
git add src/features/articles/articleOutline.test.ts src/features/articles/ArticleScrollAssist.test.tsx src/features/articles/ArticleView.outline.test.tsx
git add -u src/features/articles
git commit -m "🧹 chore(reader-scroll-assist): 清理旧目录浮层实现" \
  -m "- 删除不再使用的目录浮层组件与测试\n- 对齐阅读页滚动辅助的新回归断言"
```

### Task 4: Run focused verification and document results

**Files:**

- Modify: `docs/summaries/2026-03-07-reader-scroll-assist.md`

**Step 1: Write the failing test**

There is no new failing unit test for this documentation task. Instead, define the verification matrix before implementation completes:

```md
- `pnpm exec vitest run src/features/articles/ArticleScrollAssist.test.tsx --project=jsdom --no-file-parallelism`
- `pnpm exec vitest run src/features/articles/ArticleView.outline.test.tsx --project=jsdom --no-file-parallelism`
- `pnpm exec vitest run src/features/reader/ReaderLayout.test.tsx -t "floating title"`
```

**Step 2: Run test to verify it fails**

Run each command before implementation and record the expected failures where applicable.

Expected: At least the first two commands fail before the code changes are complete.

**Step 3: Write minimal implementation**

Create `docs/summaries/2026-03-07-reader-scroll-assist.md` after the code lands, capturing:

```md
# 阅读页滚动辅助按钮

## Context

- Related plan: `docs/plans/2026-03-07-reader-scroll-assist-implementation-plan.md`

## What Shipped

- 移除阅读页右侧目录
- 添加右下角阅读百分比圆环与回顶按钮
- 复用标题离开视口的显示时机

## Verification

- 列出实际运行过的 Vitest 命令和结果
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/articles/ArticleScrollAssist.test.tsx src/features/articles/ArticleView.outline.test.tsx src/features/reader/ReaderLayout.test.tsx --project=jsdom --no-file-parallelism`

Expected: PASS for all targeted tests relevant to the change.

**Step 5: Commit**

```bash
git add docs/summaries/2026-03-07-reader-scroll-assist.md
git commit -m "📝 docs(reader-scroll-assist): 记录滚动辅助按钮验证结果" \
  -m "- 记录目录替换为滚动辅助按钮的变更背景\n- 更新聚焦测试命令与验证结果"
```
