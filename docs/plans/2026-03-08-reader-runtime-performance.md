# Reader Runtime Performance Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 收窄阅读器三栏对 `useAppStore` 的订阅范围，避免无关状态更新触发 `FeedList`、`ArticleList`、`ArticleView` 的整组件重渲染，提升切换与交互流畅度。

**Architecture:** 保持 `src/store/appStore.ts` 作为唯一状态源，不改动数据结构；仅将重型组件从“订阅整个 store”改为“订阅最小必要切片”。通过组件级回归测试统计无关 store 更新前后的渲染次数，锁定这类性能回归。

**Tech Stack:** Next.js 16、React 19、Zustand 5、Vitest、Testing Library

**Relevant summaries:** 未找到 `docs/summaries/` 下可复用总结。

---

### Task 1: 为阅读器三栏补性能回归测试

**Files:**
- Modify: `src/features/articles/ArticleList.test.tsx`
- Modify: `src/features/articles/ArticleView.titleLink.test.tsx`
- Modify: `src/features/feeds/FeedList.test.tsx`

**Step 1: Write the failing test**
- 为 `ArticleList`、`ArticleView`、`FeedList` 各补一条回归测试，断言无关的 `useAppStore.setState()` 更新不会增加组件渲染次数。

**Step 2: Run test to verify it fails**
- Run: `pnpm test:unit -- src/features/articles/ArticleList.test.tsx src/features/articles/ArticleView.titleLink.test.tsx src/features/feeds/FeedList.test.tsx`

**Step 3: Write minimal implementation**
- 只订阅组件真正使用的 store 字段与 action，移除对整个 store 对象的订阅。

**Step 4: Run test to verify it passes**
- Run: `pnpm test:unit -- src/features/articles/ArticleList.test.tsx src/features/articles/ArticleView.titleLink.test.tsx src/features/feeds/FeedList.test.tsx`

### Task 2: 验证阅读器相关行为未回归

**Files:**
- Test: `src/features/articles/ArticleList.test.tsx`
- Test: `src/features/articles/ArticleView.titleLink.test.tsx`
- Test: `src/features/feeds/FeedList.test.tsx`
- Test: `src/features/reader/ReaderLayout.test.tsx`

**Step 1: Run focused tests**
- Run: `pnpm test:unit -- src/features/articles/ArticleList.test.tsx src/features/articles/ArticleView.titleLink.test.tsx src/features/feeds/FeedList.test.tsx src/features/reader/ReaderLayout.test.tsx`

**Step 2: Run lint on touched files if needed**
- Run: `pnpm lint`
