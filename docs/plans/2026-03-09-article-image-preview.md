# 文章内图片大图预览 Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 让阅读器中的文章正文图片在桌面端与移动端都可以点击查看单张大图，同时保持现有图片代理、正文渲染链路和阅读滚动位置不变。

**Architecture:** 在 `ArticleView` 中通过正文容器的事件委托识别 `img` 点击和键盘触发，维护轻量的预览状态；新增一个专用的图片预览组件来封装现有 `Dialog` 展示层。继续复用正文里已经存在的图片 URL，不新增后端接口、路由或媒体下载逻辑；所有异常都在预览层静默降级，不影响正文阅读。

**Tech Stack:** React 19、Next.js 16、Radix Dialog（shadcn `Dialog`）、Vitest、Testing Library、Zustand

---

## 已知上下文

- 设计文档：`docs/plans/2026-03-09-article-image-preview-design.md`
- 正文渲染入口：`src/features/articles/ArticleView.tsx`
- 可复用弹层：`src/components/ui/dialog.tsx`
- 图片 URL 改写链路：`src/server/media/rewriteHtmlImages.ts`
- 图片代理入口：`src/app/api/media/image/route.ts`
- 相关现有测试：
  - `src/features/articles/ArticleView.aiSummary.test.tsx`
  - `src/features/articles/ArticleView.outline.test.tsx`
  - `src/features/articles/ArticleView.titleLink.test.tsx`

截至 2026-03-09，仓库中没有 `docs/summaries/` 目录，因此本计划不引用历史总结文档，只依赖现有代码与设计文档。

## 实施守则

- 遵循 `@workflow-test-driven-development`：每个任务先写失败测试，再写最小实现。
- 遵循 `@workflow-verification-before-completion`：不要在没有跑过验证命令前宣称完成。
- 保持 YAGNI：只做单图预览，不做图组切换、下载、原图外跳或手势缩放。
- 每个任务结束后单独提交，提交信息使用简体中文 Conventional Commits。

### Task 1: 建立单图预览基础交互

**Files:**

- Create: `src/features/articles/ArticleImagePreview.tsx`
- Create: `src/features/articles/ArticleView.imagePreview.test.tsx`
- Modify: `src/features/articles/ArticleView.tsx`
- Reference: `src/components/ui/dialog.tsx`

**Step 1: Write the failing test**

在 `src/features/articles/ArticleView.imagePreview.test.tsx` 建立最小测试夹具，复用现有 `ArticleView` 测试里的 store 初始化模式，先覆盖基础点击行为：

```tsx
it('opens a preview dialog when clicking an article image', async () => {
  const { container } = await renderArticleViewWithContent(
    '<p>Before</p><img src="https://example.com/cover.jpg" alt="封面图" /><p>After</p>',
  );

  const bodyImage = container.querySelector(
    '[data-testid="article-html-content"] img',
  ) as HTMLImageElement | null;

  expect(bodyImage).not.toBeNull();
  fireEvent.click(bodyImage!);

  const dialog = await screen.findByRole('dialog', { name: '图片预览' });
  expect(dialog).toBeInTheDocument();
  expect(within(dialog).getByRole('img', { name: '封面图' })).toHaveAttribute(
    'src',
    'https://example.com/cover.jpg',
  );
});

it('does not open the preview when clicking non-image content', async () => {
  const { container } = await renderArticleViewWithContent(
    '<p>Paragraph</p><img src="https://example.com/cover.jpg" alt="封面图" />',
  );

  fireEvent.click(
    container.querySelector('[data-testid="article-html-content"] p') as HTMLParagraphElement,
  );

  expect(screen.queryByRole('dialog', { name: '图片预览' })).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/features/articles/ArticleView.imagePreview.test.tsx --project jsdom
```

Expected:

- FAIL，提示找不到 `dialog` 或预览图片，因为当前组件还没有图片预览状态和弹层。

**Step 3: Write minimal implementation**

1. 在 `src/features/articles/ArticleView.tsx` 中新增轻量预览状态，并保留现有重试分段逻辑优先级：

```tsx
type ImagePreviewState = {
  src: string;
  alt: string;
};

const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);

const openImagePreview = useCallback((image: HTMLImageElement) => {
  const src = image.currentSrc || image.getAttribute('src') || image.src;
  if (!src) return;

  setImagePreview({
    src,
    alt: image.getAttribute('alt')?.trim() || '文章图片',
  });
}, []);
```

2. 在现有 `onArticleContentClick` 中先处理 `retry-segment`，再识别 `img` 点击并打开预览：

```tsx
const onArticleContentClick = useCallback(
  (event: MouseEvent<HTMLDivElement>) => {
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) return;

    const retryTarget = eventTarget.closest('[data-action="retry-segment"]');
    if (retryTarget) {
      // 保持现有重试逻辑
      return;
    }

    const image = eventTarget.closest('img');
    if (!(image instanceof HTMLImageElement)) return;

    event.preventDefault();
    openImagePreview(image);
  },
  [immersiveTranslation, openImagePreview],
);
```

3. 新建 `src/features/articles/ArticleImagePreview.tsx`，封装现有 `Dialog`：

```tsx
type ArticleImagePreviewProps = {
  image: { src: string; alt: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function ArticleImagePreview({
  image,
  open,
  onOpenChange,
}: ArticleImagePreviewProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="关闭图片预览" className="max-w-5xl p-3 sm:p-4">
        <DialogTitle className="sr-only">图片预览</DialogTitle>
        {image ? (
          <div className="flex max-h-[85vh] items-center justify-center overflow-hidden rounded-md">
            <img
              src={image.src}
              alt={image.alt}
              className="max-h-[80vh] w-auto max-w-full object-contain"
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
```

4. 在 `ArticleView` 底部渲染预览组件：

```tsx
<ArticleImagePreview
  image={imagePreview}
  open={Boolean(imagePreview)}
  onOpenChange={(open) => {
    if (!open) setImagePreview(null);
  }}
/>
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/features/articles/ArticleView.imagePreview.test.tsx --project jsdom
```

Expected:

- PASS，两个基础用例都通过。

**Step 5: Commit**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/ArticleImagePreview.tsx src/features/articles/ArticleView.imagePreview.test.tsx
git commit -m "feat(reader): 添加文章图片大图预览基础交互"
```

### Task 2: 补足键盘可访问性并兼容链接包裹图片

**Files:**

- Modify: `src/features/articles/ArticleView.tsx`
- Modify: `src/features/articles/ArticleView.imagePreview.test.tsx`

**Step 1: Write the failing test**

在 `src/features/articles/ArticleView.imagePreview.test.tsx` 新增可访问性与链接包裹行为的失败测试：

```tsx
it('makes article images keyboard focusable and opens preview with Enter', async () => {
  await renderArticleViewWithContent(
    '<img src="https://example.com/cover.jpg" alt="封面图" />',
  );

  const imageTrigger = await screen.findByRole('button', { name: '查看大图：封面图' });
  imageTrigger.focus();
  fireEvent.keyDown(imageTrigger, { key: 'Enter' });

  expect(await screen.findByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
});

it('opens preview instead of following the wrapped image link', async () => {
  const { container } = await renderArticleViewWithContent(
    '<a href="https://example.com/original"><img src="https://example.com/cover.jpg" alt="封面图" /></a>',
  );

  const imageTrigger = await screen.findByRole('button', { name: '查看大图：封面图' });
  fireEvent.click(imageTrigger);

  expect(await screen.findByRole('dialog', { name: '图片预览' })).toBeInTheDocument();
  expect(container.querySelector('[data-testid="article-html-content"] a')).toHaveAttribute(
    'href',
    'https://example.com/original',
  );
});
```

如有精力，同一任务内再补一个 `Space` 打开用例，避免只覆盖 `Enter`。

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/features/articles/ArticleView.imagePreview.test.tsx --project jsdom
```

Expected:

- FAIL，提示找不到 `role="button"` 的图片触发元素，或按键后没有弹出预览。

**Step 3: Write minimal implementation**

1. 在 `ArticleView` 内添加一个装饰正文图片的 effect，在 `article?.id` 或 `bodyHtml` 变化后执行：

```tsx
useEffect(() => {
  const container = articleContentRef.current;
  if (!container) return;

  for (const node of container.querySelectorAll('img')) {
    if (!(node instanceof HTMLImageElement)) continue;

    const label = node.alt?.trim() ? `查看大图：${node.alt.trim()}` : '查看大图';
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', label);
    node.classList.add('cursor-zoom-in');
  }
}, [article?.id, bodyHtml]);
```

2. 为正文容器增加键盘事件委托，只处理 `Enter` 和 `Space`，避免影响其他元素：

```tsx
const onArticleContentKeyDown = useCallback(
  (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const image = target.closest('img');
    if (!(image instanceof HTMLImageElement)) return;

    event.preventDefault();
    openImagePreview(image);
  },
  [openImagePreview],
);
```

3. 在点击事件命中图片时保留 `event.preventDefault()`，确保 `<a><img /></a>` 优先打开站内预览。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/features/articles/ArticleView.imagePreview.test.tsx --project jsdom
```

Expected:

- PASS，键盘触发和链接包裹图片两个场景通过。

**Step 5: Commit**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/ArticleView.imagePreview.test.tsx
git commit -m "feat(reader): 增强文章图片预览可访问性"
```

### Task 3: 加固错误降级并做回归验证

**Files:**

- Modify: `src/features/articles/ArticleImagePreview.tsx`
- Modify: `src/features/articles/ArticleView.tsx`
- Modify: `src/features/articles/ArticleView.imagePreview.test.tsx`
- Regression test: `src/features/articles/ArticleView.outline.test.tsx`
- Regression test: `src/features/articles/ArticleView.titleLink.test.tsx`

**Step 1: Write the failing test**

在 `src/features/articles/ArticleView.imagePreview.test.tsx` 新增错误态与状态重置用例：

```tsx
it('shows a fallback message when the preview image fails to load', async () => {
  const { container } = await renderArticleViewWithContent(
    '<img src="https://example.com/broken.jpg" alt="损坏图片" />',
  );

  fireEvent.click(
    container.querySelector('[data-testid="article-html-content"] img') as HTMLImageElement,
  );

  const dialog = await screen.findByRole('dialog', { name: '图片预览' });
  fireEvent.error(within(dialog).getByRole('img', { name: '损坏图片' }));

  expect(within(dialog).getByText('图片加载失败，请关闭后重试。')).toBeInTheDocument();
});

it('clears the preview error state when reopening another image', async () => {
  const { container } = await renderArticleViewWithContent(
    [
      '<img src="https://example.com/broken.jpg" alt="损坏图片" />',
      '<img src="https://example.com/ok.jpg" alt="正常图片" />',
    ].join(''),
  );

  const images = container.querySelectorAll(
    '[data-testid="article-html-content"] img',
  ) as NodeListOf<HTMLImageElement>;

  fireEvent.click(images[0]);
  const dialog = await screen.findByRole('dialog', { name: '图片预览' });
  fireEvent.error(within(dialog).getByRole('img', { name: '损坏图片' }));
  fireEvent.keyDown(dialog, { key: 'Escape' });

  fireEvent.click(images[1]);
  expect(await screen.findByRole('img', { name: '正常图片' })).toBeInTheDocument();
  expect(screen.queryByText('图片加载失败，请关闭后重试。')).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/features/articles/ArticleView.imagePreview.test.tsx --project jsdom
```

Expected:

- FAIL，提示没有错误文案，或错误状态在重新打开后没有被清理。

**Step 3: Write minimal implementation**

1. 在 `ArticleImagePreview` 中增加图片加载错误状态，并在图片切换或弹层重新打开时重置：

```tsx
const [hasLoadError, setHasLoadError] = useState(false);

useEffect(() => {
  setHasLoadError(false);
}, [image?.src, open]);
```

2. 根据错误状态渲染图片或降级提示：

```tsx
{image ? (
  hasLoadError ? (
    <div className="flex min-h-56 items-center justify-center rounded-md border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
      图片加载失败，请关闭后重试。
    </div>
  ) : (
    <img
      src={image.src}
      alt={image.alt}
      onError={() => setHasLoadError(true)}
      className="max-h-[80vh] w-auto max-w-full object-contain"
    />
  )
) : null}
```

3. 在 `ArticleView` 中补一个 effect：当 `article?.id` 变化时关闭预览，避免文章切换后残留旧图状态。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/features/articles/ArticleView.imagePreview.test.tsx --project jsdom
pnpm vitest run src/features/articles/ArticleView.outline.test.tsx src/features/articles/ArticleView.titleLink.test.tsx --project jsdom
pnpm eslint src/features/articles/ArticleView.tsx src/features/articles/ArticleImagePreview.tsx src/features/articles/ArticleView.imagePreview.test.tsx
```

Expected:

- PASS，新的预览测试全部通过。
- PASS，`ArticleView` 现有滚动辅助与标题链接回归测试保持通过。
- `eslint` 退出码为 `0`。

**Step 5: Commit**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/ArticleImagePreview.tsx src/features/articles/ArticleView.imagePreview.test.tsx
git commit -m "fix(reader): 加固文章图片预览降级体验"
```

## 完成判定

满足以下条件后才算完成：

- 正文图片可点击打开站内大图预览。
- 桌面端与移动端均可使用同一交互模型。
- 键盘用户可聚焦图片并触发预览。
- 链接包裹图片时优先打开站内预览，不跳走。
- 预览图片加载失败时有清晰降级提示。
- 相关组件测试和回归测试全部通过。
