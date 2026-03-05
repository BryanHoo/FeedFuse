# Translation Preserve HTML Structure Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 修复沉浸式翻译模式下图片消失问题，使翻译模式保持原 HTML 结构与节点位置不变，并在原节点后显示译文。  

**Architecture:** 保持后端 `session + segments + SSE` 契约不变，仅在前端将翻译模式渲染从“段落列表重建”改为“原 HTML 增强渲染”。新增 `immersiveRender` helper 负责按 `segmentIndex` 映射节点并注入译文块；`ArticleView` 复用该 helper 渲染，并通过事件委托承接失败段重试。  

**Tech Stack:** React 19, TypeScript, DOMParser/XMLSerializer, Zustand, Vitest, Testing Library  

---

## 0. 执行前提与参考

- 建议在独立 worktree 执行（`@workflow-using-git-worktrees`）。
- 实施时强制使用：
  - `@workflow-test-driven-development`
  - `@workflow-verification-before-completion`
  - `@workflow-summary`
- 设计输入：
  - `docs/plans/2026-03-05-translation-preserve-html-structure-design.md`
- 必须复用的历史经验：
  - `docs/summaries/2026-03-04-immersive-translation.md`
  - `docs/summaries/2026-03-04-async-tasks-refactor.md`

---

### Task 1: 新增 immersiveRender helper（基础能力：保结构 + 成功译文后置）

**Files:**

- Create: `src/features/articles/immersiveRender.ts`
- Create: `src/features/articles/immersiveRender.test.ts`

**Step 1: Write the failing test**

```ts
// src/features/articles/immersiveRender.test.ts
import { describe, expect, it } from 'vitest';
import { buildImmersiveHtml } from './immersiveRender';

describe('buildImmersiveHtml', () => {
  it('keeps image in original position and appends translation after matching paragraph', () => {
    const baseHtml = '<article><p>A</p><img src="https://img.example/a.jpg" alt="cover" /><p>B</p></article>';
    const out = buildImmersiveHtml(baseHtml, [
      { segmentIndex: 0, status: 'succeeded', sourceText: 'A', translatedText: '甲' } as never,
    ]);
    expect(out).toContain('img src="https://img.example/a.jpg"');
    expect(out).toMatch(/<p>A<\/p>\s*<p class="ff-translation">甲<\/p>/);
    expect(out).toMatch(/<img[^>]*>\s*<p>B<\/p>/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/articles/immersiveRender.test.ts`  
Expected: FAIL（`./immersiveRender` 不存在或 `buildImmersiveHtml` 未实现）

**Step 3: Write minimal implementation**

```ts
// src/features/articles/immersiveRender.ts
const selectors = 'p,li,h1,h2,h3,h4,h5,h6,blockquote';

export function buildImmersiveHtml(baseHtml: string, segments: Array<{segmentIndex:number;status:string;translatedText:string|null}>): string {
  const doc = new DOMParser().parseFromString(baseHtml, 'text/html');
  const nodes = Array.from(doc.body.querySelectorAll(selectors));
  for (const seg of segments) {
    if (seg.status !== 'succeeded') continue;
    const target = nodes[seg.segmentIndex];
    if (!target || !seg.translatedText) continue;
    const p = doc.createElement('p');
    p.className = 'ff-translation';
    p.textContent = seg.translatedText;
    target.insertAdjacentElement('afterend', p);
  }
  return doc.body.innerHTML;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/articles/immersiveRender.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/articles/immersiveRender.ts src/features/articles/immersiveRender.test.ts
git commit -m "feat(article-view): 新增沉浸式HTML增强渲染基础能力"
```

---

### Task 2: 补齐 helper 的状态渲染、容错与安全测试

**Files:**

- Modify: `src/features/articles/immersiveRender.ts`
- Modify: `src/features/articles/immersiveRender.test.ts`

**Step 1: Write the failing test**

```ts
it('renders pending/failed states and ignores unmapped segment index', () => {
  const out = buildImmersiveHtml('<article><p>A</p></article>', [
    { segmentIndex: 0, status: 'pending', sourceText: 'A', translatedText: null } as never,
    { segmentIndex: 9, status: 'succeeded', sourceText: 'X', translatedText: '不应插入' } as never,
    { segmentIndex: 0, status: 'failed', sourceText: 'A', translatedText: null, errorMessage: '请求超时' } as never,
  ]);
  expect(out).toContain('ff-translation-pending');
  expect(out).toContain('data-action="retry-segment"');
  expect(out).not.toContain('不应插入');
});

it('inserts translation as text, not html', () => {
  const out = buildImmersiveHtml('<article><p>A</p></article>', [
    { segmentIndex: 0, status: 'succeeded', sourceText: 'A', translatedText: '<img src=x onerror=alert(1) />' } as never,
  ]);
  expect(out).toContain('&lt;img src=x onerror=alert(1) /&gt;');
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/articles/immersiveRender.test.ts`  
Expected: FAIL（缺少 pending/failed、重试标记和安全断言能力）

**Step 3: Write minimal implementation**

```ts
// immersiveRender.ts 内新增
// 1) pending/running: <p class="ff-translation ff-translation-pending">翻译中…</p>
// 2) failed: <div class="ff-translation ff-translation-failed" data-segment-index="N"><button data-action="retry-segment" ... /></div>
// 3) unmapped index: continue + console.warn
// 4) 全部文本走 textContent，禁止 innerHTML
```

实现约束：

- 当同一 `segmentIndex` 状态更新时，仅保留最终状态对应块（避免重复插入）。
- `data-segment-index` 必须挂在失败块与按钮上，便于事件委托。

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/articles/immersiveRender.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/articles/immersiveRender.ts src/features/articles/immersiveRender.test.ts
git commit -m "fix(article-view): 完善沉浸式渲染状态与容错逻辑"
```

---

### Task 3: 在 ArticleView 接入原 HTML 增强渲染（替换段落列表渲染）

**Files:**

- Modify: `src/features/articles/ArticleView.tsx`
- Modify: `src/features/articles/ArticleView.aiTranslate.test.tsx`

**Step 1: Write the failing test**

```ts
// src/features/articles/ArticleView.aiTranslate.test.tsx
it('keeps image in translation mode at original position', async () => {
  await seedArticleViewState({
    content: '<article><p>A</p><img src="https://img.example/a.jpg" alt="cover" /><p>B</p></article>',
  });
  const { default: ArticleView } = await import('./ArticleView');
  const { container } = render(<ArticleView />);
  fireEvent.click(screen.getByRole('button', { name: '翻译' }));
  await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
  await act(async () => {
    fakeEventSource.emit('segment.succeeded', { segmentIndex: 0, status: 'succeeded', translatedText: '甲' });
  });
  const html = container.querySelector('[data-testid=\"article-html-content\"]')?.innerHTML ?? '';
  expect(html).toContain('img src=\"https://img.example/a.jpg\"');
  expect(html).toMatch(/A<\/p>\s*<p class=\"ff-translation\">甲<\/p>/);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/articles/ArticleView.aiTranslate.test.tsx -t "keeps image in translation mode"`  
Expected: FAIL（当前实现仍走段落列表渲染，`img` 不在翻译模式输出）

**Step 3: Write minimal implementation**

```tsx
// ArticleView.tsx
import { buildImmersiveHtml } from './immersiveRender';

const immersiveHtml = useMemo(
  () => buildImmersiveHtml(article.content, immersiveTranslation.segments),
  [article.content, immersiveTranslation.segments],
);

// 翻译模式渲染统一走 dangerouslySetInnerHTML
<div data-testid="article-html-content" dangerouslySetInnerHTML={{ __html: aiTranslationViewing ? immersiveHtml : bodyHtml }} />
```

实现要求：

- 移除 `showImmersiveTranslation` 的 `.ff-bilingual-block` 列表渲染分支。
- 保留 legacy `aiTranslationBilingualHtml/aiTranslationZhHtml` fallback。

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/articles/ArticleView.aiTranslate.test.tsx -t "keeps image in translation mode"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/ArticleView.aiTranslate.test.tsx
git commit -m "refactor(article-view): 翻译模式改为原HTML增强渲染"
```

---

### Task 4: 恢复失败段原位重试（事件委托）并补充回归测试

**Files:**

- Modify: `src/features/articles/ArticleView.tsx`
- Modify: `src/features/articles/ArticleView.aiTranslate.test.tsx`

**Step 1: Write the failing test**

```ts
it('triggers retry API from delegated retry button inside rendered html', async () => {
  const apiClient = await import('../../lib/apiClient');
  const { default: ArticleView } = await import('./ArticleView');
  const { container } = render(<ArticleView />);
  fireEvent.click(screen.getByRole('button', { name: '翻译' }));
  await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
  await act(async () => {
    fakeEventSource.emit('segment.failed', {
      segmentIndex: 0,
      status: 'failed',
      errorCode: 'ai_timeout',
      errorMessage: '请求超时',
    });
  });
  const retry = container.querySelector('[data-action=\"retry-segment\"][data-segment-index=\"0\"]') as HTMLElement;
  fireEvent.click(retry);
  await waitFor(() => expect(apiClient.retryArticleAiTranslateSegment).toHaveBeenCalledWith('article-1', 0));
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/articles/ArticleView.aiTranslate.test.tsx -t "delegated retry button"`  
Expected: FAIL（注入 HTML 内按钮尚未绑定重试行为）

**Step 3: Write minimal implementation**

```tsx
// ArticleView.tsx
const onArticleContentClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
  const target = (event.target as HTMLElement).closest('[data-action=\"retry-segment\"]') as HTMLElement | null;
  if (!target) return;
  const raw = target.getAttribute('data-segment-index');
  const idx = raw ? Number(raw) : NaN;
  if (!Number.isInteger(idx) || idx < 0) return;
  void immersiveTranslation.retrySegment(idx);
}, [immersiveTranslation]);
```

并将该 handler 绑定到内容容器（翻译/原文共用容器，不影响其他交互）。

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/articles/ArticleView.aiTranslate.test.tsx -t "delegated retry button"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/ArticleView.aiTranslate.test.tsx
git commit -m "fix(article-view): 恢复翻译模式失败段原位重试"
```

---

### Task 5: 回归验证与总结沉淀

**Files:**

- Create: `docs/summaries/2026-03-05-translation-preserve-html-structure.md`

**Step 1: Write the summary draft and failing checklist**

```md
# 翻译模式保留原 HTML 结构修复总结
- 症状：翻译后图片消失
- 根因：翻译模式重建段落列表导致非段落节点丢失
- 修复：改为原 HTML 增强渲染
- 验证：列出执行命令与结果
```

**Step 2: Run full scoped verification**

Run: `pnpm run test:unit -- src/features/articles/immersiveRender.test.ts src/features/articles/ArticleView.aiTranslate.test.tsx src/features/articles/useImmersiveTranslation.test.ts`  
Expected: PASS（全部通过，无新增失败）

**Step 3: Finalize summary with evidence**

```md
## Verification
- pnpm run test:unit -- src/features/articles/immersiveRender.test.ts ... PASS
```

并链接：

- `docs/plans/2026-03-05-translation-preserve-html-structure-design.md`
- `docs/summaries/2026-03-04-immersive-translation.md`

**Step 4: Sanity check git diff**

Run: `git status --short && git diff --stat`  
Expected: 仅包含本次相关文件，无意外改动

**Step 5: Commit**

```bash
git add docs/summaries/2026-03-05-translation-preserve-html-structure.md
git commit -m "docs(translation): 记录翻译模式保留原HTML结构验证结论"
```

---

## 最终验收命令（执行完全部任务后）

Run: `pnpm run test:unit -- src/features/articles/immersiveRender.test.ts src/features/articles/ArticleView.aiTranslate.test.tsx src/features/articles/useImmersiveTranslation.test.ts`  
Expected: PASS

Run: `pnpm run lint`  
Expected: PASS（若项目当前 lint 基线非全绿，至少保证受影响文件无新增 lint 问题）

