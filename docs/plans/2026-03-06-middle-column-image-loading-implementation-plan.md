# 中栏图片加载优化 Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 优化 reader 中栏列表图片加载，让首屏图片更快显示，并在滚动时仅按可视区加 `0.5` 屏预取进行加载，同时维持无占位、无失败闪动的现有契约。

**Architecture:** 保留 `ArticleList` 当前“预加载成功后才渲染图片”的语义，将现有全量预加载改为“可视区激活 + 下方 `0.5` 屏预取 + `2` 并发预加载队列”。实现集中在 `ArticleList` 内部，不改 snapshot / store / API 契约，也不引入虚拟列表。

**Tech Stack:** Next.js 16、React 19、TypeScript、Zustand、Vitest、Testing Library、`IntersectionObserver`、浏览器 `Image` 预加载

---

**Relevant Learnings:**

- 设计文档：[`docs/plans/2026-03-06-middle-column-image-loading-design.md`](./2026-03-06-middle-column-image-loading-design.md)
- 间接经验：[`docs/summaries/2026-03-05-translation-preserve-html-structure.md`](../summaries/2026-03-05-translation-preserve-html-structure.md)
  - 图片相关回归很敏感；实现时不要重新引入“先出现后消失”的状态跳变。
- 现有行为契约：`src/features/articles/ArticleList.test.tsx:323` 与 `src/features/articles/ArticleList.test.tsx:353`

### Task 1: 让中栏图片只在可视区/预取区激活

**Files:**

- Modify: `src/features/articles/ArticleList.tsx:57`
- Modify: `src/features/articles/ArticleList.tsx:160`
- Modify: `src/features/articles/ArticleList.tsx:492`
- Test: `src/features/articles/ArticleList.test.tsx`

**Step 1: Write the failing test**

```ts
it('does not preload distant preview images before observer activation', async () => {
  const preload = setupImagePreloadMock();
  const observer = setupIntersectionObserverMock();

  useAppStore.setState({
    articles: Array.from({ length: 6 }, (_, index) => ({
      id: `art-${index + 1}`,
      feedId: 'feed-1',
      title: `Article ${index + 1}`,
      content: '',
      previewImage: `https://example.com/${index + 1}.jpg`,
      summary: 'Summary',
      publishedAt: new Date(`2026-02-${25 - index}T00:00:00.000Z`).toISOString(),
      link: `https://example.com/${index + 1}`,
      isRead: false,
      isStarred: false,
    })),
    selectedArticleId: 'art-1',
  });

  renderWithNotifications();

  expect(preload.instances).toHaveLength(0);

  act(() => {
    observer.triggerIntersect(['art-1', 'art-2']);
  });

  expect(preload.instances).toHaveLength(2);

  preload.restore();
  observer.restore();
});
```

同时增加一个轻量 helper：

```ts
function setupIntersectionObserverMock() {
  const original = globalThis.IntersectionObserver;
  const targets = new Map<string, Element>();
  let callback: IntersectionObserverCallback = () => undefined;

  class MockIntersectionObserver {
    constructor(cb: IntersectionObserverCallback) {
      callback = cb;
    }
    observe(target: Element) {
      const articleId = target.getAttribute('data-article-id');
      if (articleId) targets.set(articleId, target);
    }
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver);

  return {
    triggerIntersect(articleIds: string[]) {
      callback(
        articleIds
          .map((articleId) => targets.get(articleId))
          .filter((target): target is Element => Boolean(target))
          .map((target) => ({
            target,
            isIntersecting: true,
          }) as IntersectionObserverEntry),
        {} as IntersectionObserver,
      );
    },
    restore() {
      vi.stubGlobal('IntersectionObserver', original);
    },
  };
}
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/articles/ArticleList.test.tsx -t "does not preload distant preview images before observer activation"`

Expected: FAIL，因为当前实现会在挂载后立刻为所有候选图创建 `Image()`。

**Step 3: Write minimal implementation**

```ts
const scrollContainerRef = useRef<HTMLDivElement | null>(null);
const articleCardRefs = useRef(new Map<string, HTMLButtonElement>());
const [activePreviewImageKeys, setActivePreviewImageKeys] = useState<Set<string>>(() => new Set());

useEffect(() => {
  const root = scrollContainerRef.current;
  if (!root || previewImageByArticleId.size === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      setActivePreviewImageKeys((previous) => {
        const next = new Set(previous);
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const articleId = entry.target.getAttribute('data-article-id');
          const preview = articleId ? previewImageByArticleId.get(articleId) : undefined;
          if (preview) next.add(preview.key);
        }
        return areSetsEqual(previous, next) ? previous : next;
      });
    },
    {
      root,
      rootMargin: '0px 0px 50% 0px',
    },
  );

  for (const element of articleCardRefs.current.values()) {
    observer.observe(element);
  }

  return () => observer.disconnect();
}, [previewImageByArticleId]);
```

并把中栏滚动容器与卡片根节点补上：

```tsx
<div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-3 pt-1">
...
<button
  data-article-id={article.id}
  ref={(node) => {
    if (node) articleCardRefs.current.set(article.id, node);
    else articleCardRefs.current.delete(article.id);
  }}
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/articles/ArticleList.test.tsx -t "does not preload distant preview images before observer activation"`

Expected: PASS，并且初次挂载时不会再对远处卡片提前发起预加载。

**Step 5: Commit**

```bash
git add src/features/articles/ArticleList.tsx src/features/articles/ArticleList.test.tsx
git commit -m "🚀 perf(reader): 改为按可视区激活中栏图片加载" -m "- 添加中栏滚动容器 observer 激活逻辑
- 限制图片仅在可视区与预取区进入加载流程
- 保持图片未就绪前不渲染的现有契约"
```

### Task 2: 为激活图片增加两路并发预加载队列

**Files:**

- Modify: `src/features/articles/ArticleList.tsx:206`
- Modify: `src/features/articles/ArticleList.tsx:505`
- Test: `src/features/articles/ArticleList.test.tsx`

**Step 1: Write the failing test**

```ts
it('limits preview image preloads to two concurrent requests', async () => {
  const preload = setupImagePreloadMock();
  const observer = setupIntersectionObserverMock();

  useAppStore.setState({
    articles: Array.from({ length: 5 }, (_, index) => ({
      id: `art-${index + 1}`,
      feedId: 'feed-1',
      title: `Article ${index + 1}`,
      content: '',
      previewImage: `https://example.com/${index + 1}.jpg`,
      summary: 'Summary',
      publishedAt: new Date(`2026-02-${25 - index}T00:00:00.000Z`).toISOString(),
      link: `https://example.com/${index + 1}`,
      isRead: false,
      isStarred: false,
    })),
    selectedArticleId: 'art-1',
  });

  renderWithNotifications();

  act(() => {
    observer.triggerIntersect(['art-1', 'art-2', 'art-3', 'art-4']);
  });

  expect(preload.instances).toHaveLength(2);

  act(() => {
    preload.instances[0].triggerLoad();
  });

  await waitFor(() => {
    expect(preload.instances).toHaveLength(3);
  });

  preload.restore();
  observer.restore();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/articles/ArticleList.test.tsx -t "limits preview image preloads to two concurrent requests"`

Expected: FAIL，因为当前代码会立即为激活集合中的所有图片创建 `Image()`。

**Step 3: Write minimal implementation**

```ts
const PREVIEW_PRELOAD_MAX_CONCURRENT = 2;
const preloadQueueRef = useRef<string[]>([]);
const preloadInFlightRef = useRef(new Set<string>());
const previewImageStatusesRef = useRef(previewImageStatuses);

useEffect(() => {
  previewImageStatusesRef.current = previewImageStatuses;
}, [previewImageStatuses]);

const pumpPreviewPreloadQueue = useCallback(() => {
  while (
    preloadInFlightRef.current.size < PREVIEW_PRELOAD_MAX_CONCURRENT &&
    preloadQueueRef.current.length > 0
  ) {
    const key = preloadQueueRef.current.shift();
    if (!key) continue;
    const src = previewImageCandidates.get(key);
    if (!src || previewImageStatusesRef.current.has(key)) continue;

    preloadInFlightRef.current.add(key);
    setPreviewImageStatuses((previous) => new Map(previous).set(key, 'loading'));

    const preloader = new Image();
    preloader.onload = () => {
      preloadInFlightRef.current.delete(key);
      setPreviewImageStatuses((previous) => new Map(previous).set(key, 'ready'));
      pumpPreviewPreloadQueue();
    };
    preloader.onerror = () => {
      preloadInFlightRef.current.delete(key);
      setPreviewImageStatuses((previous) => new Map(previous).set(key, 'failed'));
      pumpPreviewPreloadQueue();
    };
    preloader.src = src;
  }
}, [previewImageCandidates]);

useEffect(() => {
  for (const key of activePreviewImageKeys) {
    const status = previewImageStatusesRef.current.get(key);
    if (status || preloadInFlightRef.current.has(key) || preloadQueueRef.current.includes(key)) continue;
    preloadQueueRef.current.push(key);
  }
  pumpPreviewPreloadQueue();
}, [activePreviewImageKeys, pumpPreviewPreloadQueue]);
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/articles/ArticleList.test.tsx -t "limits preview image preloads to two concurrent requests"`

Expected: PASS，并且首批只启动两张图片加载，后续请求在前序完成后继续推进。

**Step 5: Commit**

```bash
git add src/features/articles/ArticleList.tsx src/features/articles/ArticleList.test.tsx
git commit -m "🚀 perf(reader): 限制中栏图片预加载并发" -m "- 为激活图片增加两路并发预加载队列
- 避免首屏图片与远处卡片抢占同批网络请求
- 保持 ready 与 failed 状态语义不变"
```

### Task 3: 补齐失败缓存与列表切换清理回归

**Files:**

- Modify: `src/features/articles/ArticleList.tsx:186`
- Modify: `src/features/articles/ArticleList.tsx:206`
- Test: `src/features/articles/ArticleList.test.tsx`

**Step 1: Write the failing test**

```ts
it('does not retry failed preview images after reactivation', async () => {
  const preload = setupImagePreloadMock();
  const observer = setupIntersectionObserverMock();

  useAppStore.setState((state) => ({
    ...state,
    articles: state.articles.map((article) =>
      article.id === 'art-1'
        ? { ...article, previewImage: 'https://example.com/broken.jpg' }
        : article,
    ),
  }));

  renderWithNotifications();

  act(() => {
    observer.triggerIntersect(['art-1']);
    preload.instances[0].triggerError();
    observer.triggerIntersect(['art-1']);
  });

  expect(preload.instances).toHaveLength(1);

  preload.restore();
  observer.restore();
});

it('drops stale preview image statuses after article list changes', async () => {
  const preload = setupImagePreloadMock();
  const observer = setupIntersectionObserverMock();

  renderWithNotifications();

  act(() => {
    observer.triggerIntersect(['art-1']);
    preload.instances[0].triggerLoad();
  });

  await waitFor(() => {
    expect(screen.getByTestId('article-card-art-1-title')).toBeInTheDocument();
  });

  useAppStore.setState({
    selectedView: 'starred',
    articles: [],
    selectedArticleId: null,
  });

  // 重新渲染后不应保留旧 key，也不应继续为 art-1 发起请求
  expect(preload.instances).toHaveLength(1);

  preload.restore();
  observer.restore();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/articles/ArticleList.test.tsx -t "does not retry failed preview images after reactivation|drops stale preview image statuses after article list changes"`

Expected: FAIL，因为当前实现没有围绕 observer 激活态重建完整的失败缓存与队列清理语义。

**Step 3: Write minimal implementation**

```ts
useEffect(() => {
  const candidateKeys = new Set(previewImageCandidates.keys());

  setPreviewImageStatuses((previousStatuses) => {
    let changed = previousStatuses.size !== candidateKeys.size;
    const nextStatuses = new Map<string, PreviewImageStatus>();

    for (const [key, status] of previousStatuses) {
      if (!candidateKeys.has(key)) {
        changed = true;
        continue;
      }
      nextStatuses.set(key, status);
    }

    return changed ? nextStatuses : previousStatuses;
  });

  setActivePreviewImageKeys((previous) => {
    const next = new Set(Array.from(previous).filter((key) => candidateKeys.has(key)));
    return areSetsEqual(previous, next) ? previous : next;
  });

  preloadQueueRef.current = preloadQueueRef.current.filter((key) => candidateKeys.has(key));
  preloadInFlightRef.current.forEach((key) => {
    if (!candidateKeys.has(key)) preloadInFlightRef.current.delete(key);
  });
}, [previewImageCandidates]);
```

同时保留现有 `<img onError>` 兜底，不要因为 observer/队列重构删掉它。

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/articles/ArticleList.test.tsx`

Expected: PASS，且原有“预加载成功后才渲染”“预加载失败时隐藏”测试继续为绿色。

**Step 5: Commit**

```bash
git add src/features/articles/ArticleList.tsx src/features/articles/ArticleList.test.tsx
git commit -m "🧪 test(reader): 补齐中栏图片加载回归覆盖" -m "- 验证失败图片重进视区后不重复请求
- 校验列表切换后旧图片状态与队列被正确清理
- 保持现有成功与失败渲染契约测试继续通过"
```
