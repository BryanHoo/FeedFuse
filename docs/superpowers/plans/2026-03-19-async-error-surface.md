# 异步任务原始错误透出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 摘要、AI 翻译、RSS 拉取补充脱敏后的原始错误链路，并在文章右栏错误卡片与 RSS tooltip 中展示真实失败原因。

**Architecture:** 保持现有 `errorCode + errorMessage` 兼容层不变，在任务映射、持久化模型、API DTO 上增补 `rawErrorMessage` / `lastFetchRawError`。后端统一负责提取、脱敏、截断原始错误，前端只按“优先显示原始错误，缺失时回退友好文案”的规则消费，不引入新的错误中心或状态机。

**Tech Stack:** Next.js 16 + React 19 + TypeScript + pg + pg-boss + Zustand + Vitest + Testing Library

---

## Context Snapshot

- Approved spec: `docs/superpowers/specs/2026-03-19-async-error-surface-design.md`
- Relevant backend files:
  - `src/server/tasks/errorMapping.ts`
  - `src/server/tasks/feedFetchErrorMapping.ts`
  - `src/server/repositories/articleTasksRepo.ts`
  - `src/server/repositories/articleAiSummaryRepo.ts`
  - `src/server/repositories/articleTranslationRepo.ts`
  - `src/server/repositories/feedsRepo.ts`
  - `src/worker/articleTaskStatus.ts`
  - `src/worker/aiSummaryStreamWorker.ts`
  - `src/worker/immersiveTranslateWorker.ts`
  - `src/worker/index.ts`
  - `src/app/api/articles/[id]/route.ts`
  - `src/app/api/articles/[id]/tasks/route.ts`
  - `src/app/api/articles/[id]/ai-summary/route.ts`
  - `src/app/api/articles/[id]/ai-translate/route.ts`
  - `src/server/services/readerSnapshotService.ts`
- Relevant frontend files:
  - `src/lib/apiClient.ts`
  - `src/types/index.ts`
  - `src/features/articles/ArticleView.tsx`
  - `src/features/feeds/FeedList.tsx`
- Existing tests that should be extended instead of inventing new harnesses:
  - `src/server/tasks/errorMapping.test.ts`
  - `src/server/tasks/feedFetchErrorMapping.test.ts`
  - `src/server/repositories/articleAiSummaryRepo.test.ts`
  - `src/server/repositories/articleTranslationRepo.test.ts`
  - `src/server/repositories/feedsRepo.fetchResult.test.ts`
  - `src/worker/aiSummaryStreamWorker.test.ts`
  - `src/worker/immersiveTranslateWorker.test.ts`
  - `src/app/api/articles/routes.test.ts`
  - `src/app/api/reader/snapshot/route.test.ts`
  - `src/lib/apiClient.test.ts`
  - `src/features/articles/ArticleView.aiSummary.test.tsx`
  - `src/features/feeds/FeedList.test.tsx`
- Project constraints:
  - 不自动做浏览器测试。
  - 最终验证必须运行 `pnpm build`。
  - 使用 `pnpm` 作为 Node 包管理器。

## Scope Check

该规格覆盖“错误规范化”“错误持久化”“API 透出”“前端展示”四层，但它们都围绕同一条异步错误透出链路，且必须一起落地才有用户价值，因此保留为单一实施计划，不再拆分子计划。

## File Structure Plan

Planned creates:
- `src/server/tasks/rawErrorMessage.ts` - 提取、脱敏、截断原始错误文本的单一工具。
- `src/server/tasks/rawErrorMessage.test.ts` - 覆盖原始错误脱敏与截断规则。
- `src/server/db/migrations/0021_async_raw_error_messages.sql` - 为任务、摘要 session、翻译 session / segment、feeds 增加原始错误字段。
- `src/server/repositories/articleTasksRepo.test.ts` - 锁定 `article_tasks` SQL 和参数顺序，避免新增字段时回归。

Planned modifies:
- `src/server/tasks/errorMapping.ts` - 返回 `{ errorCode, errorMessage, rawErrorMessage }`。
- `src/server/tasks/errorMapping.test.ts` - 更新为断言三字段契约。
- `src/server/tasks/feedFetchErrorMapping.ts` - 返回 `rawErrorMessage`。
- `src/server/tasks/feedFetchErrorMapping.test.ts` - 验证 RSS 原始错误保留与脱敏。
- `src/server/repositories/articleTasksRepo.ts` - 读写 `raw_error_message`。
- `src/server/repositories/articleAiSummaryRepo.ts` - 读写 `raw_error_message`。
- `src/server/repositories/articleTranslationRepo.ts` - 读写 session / segment 的 `raw_error_message`。
- `src/server/repositories/feedsRepo.ts` - 读写 `last_fetch_raw_error`。
- `src/server/repositories/articleAiSummaryRepo.test.ts` - 校验 summary session SQL 包含新字段。
- `src/server/repositories/articleTranslationRepo.test.ts` - 校验 translation repo 读写新字段。
- `src/server/repositories/feedsRepo.fetchResult.test.ts` - 校验 feed query 和写入参数包含原始错误。
- `src/worker/articleTaskStatus.ts` - 任务失败时写入 `rawErrorMessage`。
- `src/worker/aiSummaryStreamWorker.ts` - summary session 失败时写入 `rawErrorMessage`。
- `src/worker/immersiveTranslateWorker.ts` - translation session / segment 失败时写入 `rawErrorMessage`。
- `src/worker/index.ts` - RSS 抓取失败时写入 `lastFetchRawError`。
- `src/worker/aiSummaryStreamWorker.test.ts` - 验证失败时把原始错误写入 session。
- `src/worker/immersiveTranslateWorker.test.ts` - 验证 segment 失败时保留原始错误。
- `src/app/api/articles/[id]/route.ts` - `aiSummarySession` DTO 新增 `rawErrorMessage`。
- `src/app/api/articles/[id]/tasks/route.ts` - task DTO 新增 `rawErrorMessage`。
- `src/app/api/articles/[id]/ai-summary/route.ts` - summary snapshot DTO 新增 `rawErrorMessage`。
- `src/app/api/articles/[id]/ai-translate/route.ts` - translate session / segments DTO 新增 `rawErrorMessage`。
- `src/server/services/readerSnapshotService.ts` - feed snapshot DTO 新增 `lastFetchRawError`。
- `src/app/api/reader/snapshot/route.test.ts` - 快照 API 返回 feed 原始错误字段。
- `src/app/api/articles/routes.test.ts` - 任务、summary、translate API 返回原始错误字段。
- `src/lib/apiClient.ts` - DTO / 映射补 `rawErrorMessage` 与 `fetchRawError`。
- `src/lib/apiClient.test.ts` - 客户端映射原始错误字段。
- `src/types/index.ts` - `Feed`、`ArticleAiSummarySession`、任务 / 翻译快照类型补新字段。
- `src/features/articles/ArticleView.tsx` - 增加统一错误卡片并优先显示原始错误。
- `src/features/articles/ArticleView.aiSummary.test.tsx` - 覆盖摘要失败、翻译失败、同时失败的错误卡片显示。
- `src/features/feeds/FeedList.tsx` - tooltip 优先显示 `fetchRawError`。
- `src/features/feeds/FeedList.test.tsx` - 覆盖 RSS tooltip 的原始错误展示。

Skills reference for implementers:
- `@vitest`
- `@nodejs-best-practices`
- `@verification-before-completion`

## Chunk 1: 原始错误规范化契约（TDD）

### Task 1: 建立 `rawErrorMessage` 规范化工具与映射契约

**Files:**
- Create: `src/server/tasks/rawErrorMessage.ts`
- Create: `src/server/tasks/rawErrorMessage.test.ts`
- Modify: `src/server/tasks/errorMapping.ts`
- Modify: `src/server/tasks/errorMapping.test.ts`
- Modify: `src/server/tasks/feedFetchErrorMapping.ts`
- Modify: `src/server/tasks/feedFetchErrorMapping.test.ts`

- [ ] **Step 1: 先写失败测试，锁定脱敏、截断与三字段返回**

```ts
import { describe, expect, it } from 'vitest';

describe('rawErrorMessage', () => {
  it('masks bearer tokens and truncates long provider errors', async () => {
    const mod = await import('./rawErrorMessage');
    const raw = mod.toRawErrorMessage(
      new Error('Authorization: Bearer sk-secret-123 429 rate limit '.repeat(40)),
    );

    expect(raw).toContain('Authorization: Bearer [REDACTED]');
    expect(raw).not.toContain('sk-secret-123');
    expect(raw?.length).toBeLessThanOrEqual(800);
  });
});

describe('errorMapping', () => {
  it('returns rawErrorMessage alongside the existing friendly fields', async () => {
    const mod = await import('./errorMapping');
    expect(mod.mapTaskError({ type: 'ai_translate', err: new Error('429 rate limit') })).toEqual({
      errorCode: 'ai_rate_limited',
      errorMessage: expect.any(String),
      rawErrorMessage: '429 rate limit',
    });
  });
});
```

- [ ] **Step 2: 运行映射层定向测试，确认当前失败**

Run: `pnpm test:unit src/server/tasks/rawErrorMessage.test.ts src/server/tasks/errorMapping.test.ts src/server/tasks/feedFetchErrorMapping.test.ts`

Expected: FAIL，提示 `rawErrorMessage` 工具或字段不存在。

- [ ] **Step 3: 用最小实现补齐规范化工具和双轨返回**

```ts
export function toRawErrorMessage(err: unknown): string | null {
  const text =
    typeof err === 'string' ? err : err instanceof Error ? err.message || err.name || '' : '';
  if (!text.trim()) return null;

  const masked = text
    .replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key=([^&\s]+)/gi, 'api_key=[REDACTED]')
    .replace(/\b[A-Za-z0-9_\-]{24,}\b/g, '[REDACTED]');

  return masked.replace(/\s+/g, ' ').trim().slice(0, 800);
}

export function mapTaskError(...) {
  return {
    errorCode: 'ai_rate_limited',
    errorMessage: '请求太频繁了，请稍后重试',
    rawErrorMessage: toRawErrorMessage(input.err),
  };
}
```

- [ ] **Step 4: 重新运行映射层测试，确认通过**

Run: `pnpm test:unit src/server/tasks/rawErrorMessage.test.ts src/server/tasks/errorMapping.test.ts src/server/tasks/feedFetchErrorMapping.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/tasks/rawErrorMessage.ts src/server/tasks/rawErrorMessage.test.ts src/server/tasks/errorMapping.ts src/server/tasks/errorMapping.test.ts src/server/tasks/feedFetchErrorMapping.ts src/server/tasks/feedFetchErrorMapping.test.ts
git commit -m "feat(tasks): 保留脱敏后的原始错误信息" \
  -m "- 添加原始错误提取、脱敏与截断工具" \
  -m "- 更新任务与 RSS 错误映射返回 rawErrorMessage"
```

## Chunk 2: 数据库与持久化链路（TDD）

### Task 2: 为任务、summary、translation、feed fetch 持久化原始错误

**Files:**
- Create: `src/server/db/migrations/0021_async_raw_error_messages.sql`
- Create: `src/server/repositories/articleTasksRepo.test.ts`
- Modify: `src/server/repositories/articleTasksRepo.ts`
- Modify: `src/server/repositories/articleAiSummaryRepo.ts`
- Modify: `src/server/repositories/articleAiSummaryRepo.test.ts`
- Modify: `src/server/repositories/articleTranslationRepo.ts`
- Modify: `src/server/repositories/articleTranslationRepo.test.ts`
- Modify: `src/server/repositories/feedsRepo.ts`
- Modify: `src/server/repositories/feedsRepo.fetchResult.test.ts`
- Modify: `src/worker/articleTaskStatus.ts`
- Modify: `src/worker/aiSummaryStreamWorker.ts`
- Modify: `src/worker/aiSummaryStreamWorker.test.ts`
- Modify: `src/worker/immersiveTranslateWorker.ts`
- Modify: `src/worker/immersiveTranslateWorker.test.ts`
- Modify: `src/worker/index.ts`

- [ ] **Step 1: 先写失败测试，锁定 repo SQL 和 worker 写入行为**

```ts
it('writes raw_error_message in article tasks upsert SQL', async () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
  const mod = await import('./articleTasksRepo');

  await mod.upsertTaskFailed(pool as never, {
    articleId: 'a1',
    type: 'ai_summary',
    jobId: 'job-1',
    errorCode: 'ai_rate_limited',
    errorMessage: '请求太频繁了，请稍后重试',
    rawErrorMessage: '429 rate limit',
  });

  expect(String(pool.query.mock.calls[0]?.[0] ?? '')).toContain('raw_error_message');
});

it('passes rawErrorMessage when summary streaming fails', async () => {
  expect(failSessionMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ rawErrorMessage: '429 rate limit' }),
  );
});
```

- [ ] **Step 2: 运行 repo / worker 定向测试，确认失败**

Run: `pnpm test:unit src/server/repositories/articleTasksRepo.test.ts src/server/repositories/articleAiSummaryRepo.test.ts src/server/repositories/articleTranslationRepo.test.ts src/server/repositories/feedsRepo.fetchResult.test.ts src/worker/aiSummaryStreamWorker.test.ts src/worker/immersiveTranslateWorker.test.ts`

Expected: FAIL，提示 SQL、函数签名或 worker 断言缺少原始错误字段。

- [ ] **Step 3: 实现 migration、repo 读写与 worker 透传**

```sql
alter table article_tasks add column if not exists raw_error_message text null;
alter table article_ai_summary_sessions add column if not exists raw_error_message text null;
alter table article_translation_sessions add column if not exists raw_error_message text null;
alter table article_translation_segments add column if not exists raw_error_message text null;
alter table feeds add column if not exists last_fetch_raw_error text null;
```

```ts
export interface ArticleTaskRow {
  rawErrorMessage: string | null;
}

await upsertTaskFailed(pool, {
  articleId,
  type,
  jobId,
  errorCode: mapped.errorCode,
  errorMessage: mapped.errorMessage,
  rawErrorMessage: mapped.rawErrorMessage,
});

await recordFeedFetchResult(pool, feedId, {
  status,
  error: mapped.errorMessage,
  rawError: mapped.rawErrorMessage,
});
```

- [ ] **Step 4: 重新运行 repo / worker 定向测试**

Run: `pnpm test:unit src/server/repositories/articleTasksRepo.test.ts src/server/repositories/articleAiSummaryRepo.test.ts src/server/repositories/articleTranslationRepo.test.ts src/server/repositories/feedsRepo.fetchResult.test.ts src/worker/aiSummaryStreamWorker.test.ts src/worker/immersiveTranslateWorker.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/db/migrations/0021_async_raw_error_messages.sql src/server/repositories/articleTasksRepo.ts src/server/repositories/articleTasksRepo.test.ts src/server/repositories/articleAiSummaryRepo.ts src/server/repositories/articleAiSummaryRepo.test.ts src/server/repositories/articleTranslationRepo.ts src/server/repositories/articleTranslationRepo.test.ts src/server/repositories/feedsRepo.ts src/server/repositories/feedsRepo.fetchResult.test.ts src/worker/articleTaskStatus.ts src/worker/aiSummaryStreamWorker.ts src/worker/aiSummaryStreamWorker.test.ts src/worker/immersiveTranslateWorker.ts src/worker/immersiveTranslateWorker.test.ts src/worker/index.ts
git commit -m "feat(server): 持久化异步任务原始错误字段" \
  -m "- 为任务、摘要、翻译和 RSS 拉取增加原始错误存储字段" \
  -m "- 更新 repository 与 worker 将 rawErrorMessage 落库"
```

## Chunk 3: API 与客户端 DTO 透出（TDD）

### Task 3: 让文章任务接口、文章详情和 feed snapshot 返回原始错误

**Files:**
- Modify: `src/app/api/articles/[id]/route.ts`
- Modify: `src/app/api/articles/[id]/tasks/route.ts`
- Modify: `src/app/api/articles/[id]/ai-summary/route.ts`
- Modify: `src/app/api/articles/[id]/ai-translate/route.ts`
- Modify: `src/app/api/articles/routes.test.ts`
- Modify: `src/server/services/readerSnapshotService.ts`
- Modify: `src/app/api/reader/snapshot/route.test.ts`
- Modify: `src/lib/apiClient.ts`
- Modify: `src/lib/apiClient.test.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: 先写失败测试，锁定 API 与客户端映射的新字段**

```ts
it('GET /:id/tasks returns rawErrorMessage for failed tasks', async () => {
  getArticleTasksByArticleIdMock.mockResolvedValue([
    {
      type: 'ai_translate',
      status: 'failed',
      errorCode: 'ai_rate_limited',
      errorMessage: '请求太频繁了，请稍后重试',
      rawErrorMessage: '429 rate limit',
      jobId: 'job-1',
      requestedAt: null,
      startedAt: null,
      finishedAt: null,
      attempts: 1,
    },
  ]);

  const mod = await import('./[id]/tasks/route');
  const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}/tasks`), {
    params: Promise.resolve({ id: articleId }),
  });
  const json = await res.json();

  expect(json.data.ai_translate.rawErrorMessage).toBe('429 rate limit');
});

it('maps fetchRawError from snapshot feeds', () => {
  expect(mapped.fetchRawError).toBe('HTTP 403 from upstream');
});
```

- [ ] **Step 2: 运行 API / DTO 定向测试，确认失败**

Run: `pnpm test:unit src/app/api/articles/routes.test.ts src/app/api/reader/snapshot/route.test.ts src/lib/apiClient.test.ts`

Expected: FAIL，提示 DTO 或客户端类型缺少原始错误字段。

- [ ] **Step 3: 最小实现 API、snapshot、client mapping**

```ts
return {
  type: aiTranslate.type,
  status: aiTranslate.status,
  errorCode: aiTranslate.errorCode,
  errorMessage: aiTranslate.errorMessage,
  rawErrorMessage: aiTranslate.rawErrorMessage,
};

export interface Feed {
  fetchError: string | null;
  fetchRawError: string | null;
}

return {
  fetchError: ('lastFetchError' in dto ? dto.lastFetchError : null) ?? null,
  fetchRawError: ('lastFetchRawError' in dto ? dto.lastFetchRawError : null) ?? null,
};
```

- [ ] **Step 4: 重新运行 API / DTO 定向测试**

Run: `pnpm test:unit src/app/api/articles/routes.test.ts src/app/api/reader/snapshot/route.test.ts src/lib/apiClient.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/app/api/articles/[id]/route.ts src/app/api/articles/[id]/tasks/route.ts src/app/api/articles/[id]/ai-summary/route.ts src/app/api/articles/[id]/ai-translate/route.ts src/app/api/articles/routes.test.ts src/server/services/readerSnapshotService.ts src/app/api/reader/snapshot/route.test.ts src/lib/apiClient.ts src/lib/apiClient.test.ts src/types/index.ts
git commit -m "feat(api): 透出异步任务原始错误字段" \
  -m "- 为文章任务、摘要、翻译和 feed snapshot DTO 增加原始错误字段" \
  -m "- 更新客户端映射和共享类型以消费 rawErrorMessage"
```

## Chunk 4: 右栏错误卡片与 RSS tooltip（TDD）

### Task 4: 在阅读器 UI 中优先显示原始错误

**Files:**
- Modify: `src/features/articles/ArticleView.tsx`
- Modify: `src/features/articles/ArticleView.aiSummary.test.tsx`
- Modify: `src/features/feeds/FeedList.tsx`
- Modify: `src/features/feeds/FeedList.test.tsx`

- [ ] **Step 1: 先写失败测试，锁定错误卡片与 tooltip 的显示优先级**

```tsx
it('shows a unified error card with raw summary and translate errors', async () => {
  await seedArticleViewState({
    article: {
      aiSummarySession: {
        id: 'session-1',
        status: 'failed',
        draftText: '',
        finalText: null,
        errorCode: 'ai_rate_limited',
        errorMessage: '请求太频繁了，请稍后重试',
        rawErrorMessage: '429 rate limit',
        startedAt: '2026-03-09T00:00:00.000Z',
        finishedAt: '2026-03-09T00:00:30.000Z',
        updatedAt: '2026-03-09T00:00:30.000Z',
      },
    },
    tasks: {
      ai_translate: {
        ...idleTasks.ai_translate,
        status: 'failed',
        errorCode: 'ai_invalid_config',
        errorMessage: 'AI 配置无效，请检查 API 密钥',
        rawErrorMessage: '401 unauthorized',
      },
    },
  });

  render(<ArticleView />);

  expect(screen.getByText('处理失败')).toBeInTheDocument();
  expect(screen.getByText('429 rate limit')).toBeInTheDocument();
  expect(screen.getByText('401 unauthorized')).toBeInTheDocument();
});

it('prefers fetchRawError inside the feed tooltip', async () => {
  useAppStore.setState({
    feeds: [{ ...baseFeed, fetchError: '更新失败：服务器返回 HTTP 403', fetchRawError: 'HTTP 403 from upstream' }],
  });
  renderWithNotifications();
  fireEvent.mouseEnter(screen.getByRole('button', { name: /My Feed/ }));
  expect(await screen.findByText('HTTP 403 from upstream')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行前端定向测试，确认失败**

Run: `pnpm test:unit src/features/articles/ArticleView.aiSummary.test.tsx src/features/feeds/FeedList.test.tsx`

Expected: FAIL，提示 `rawErrorMessage` / `fetchRawError` 不存在或 UI 未显示新卡片。

- [ ] **Step 3: 最小实现统一错误卡片和 tooltip 优先级**

```tsx
const aiSummaryDisplayError =
  activeAiSummarySession?.rawErrorMessage ||
  tasks?.ai_summary.rawErrorMessage ||
  activeAiSummarySession?.errorMessage ||
  tasks?.ai_summary.errorMessage ||
  '暂时无法生成摘要';

const aiTranslateDisplayError =
  tasks?.ai_translate.rawErrorMessage ||
  tasks?.ai_translate.errorMessage ||
  '暂时无法完成翻译';

{showAsyncErrorCard ? (
  <section className="mb-4 rounded-xl border border-border/70 bg-muted/35 px-4 py-3" aria-label="处理失败">
    <h2 className="text-sm font-semibold">处理失败</h2>
    {aiSummaryFailed ? <p>摘要：{aiSummaryDisplayError}</p> : null}
    {aiTranslateFailed ? <p>翻译：{aiTranslateDisplayError}</p> : null}
  </section>
) : null}

<p>{feed.fetchRawError || feed.fetchError}</p>
```

- [ ] **Step 4: 重新运行前端定向测试**

Run: `pnpm test:unit src/features/articles/ArticleView.aiSummary.test.tsx src/features/feeds/FeedList.test.tsx`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/ArticleView.aiSummary.test.tsx src/features/feeds/FeedList.tsx src/features/feeds/FeedList.test.tsx
git commit -m "feat(ui): 展示异步任务原始错误信息" \
  -m "- 在文章右栏增加统一错误卡片展示摘要与翻译失败原因" \
  -m "- 让 RSS tooltip 优先显示原始拉取错误"
```

## Chunk 5: 收尾验证

### Task 5: 执行全量相关测试并完成构建验证

**Files:**
- Modify: 若前面执行中发现遗漏，再回补对应源文件和测试文件

- [ ] **Step 1: 运行本次改动覆盖到的全部相关测试**

Run:

```bash
pnpm test:unit src/server/tasks/rawErrorMessage.test.ts src/server/tasks/errorMapping.test.ts src/server/tasks/feedFetchErrorMapping.test.ts src/server/repositories/articleTasksRepo.test.ts src/server/repositories/articleAiSummaryRepo.test.ts src/server/repositories/articleTranslationRepo.test.ts src/server/repositories/feedsRepo.fetchResult.test.ts src/worker/aiSummaryStreamWorker.test.ts src/worker/immersiveTranslateWorker.test.ts src/app/api/articles/routes.test.ts src/app/api/reader/snapshot/route.test.ts src/lib/apiClient.test.ts src/features/articles/ArticleView.aiSummary.test.tsx src/features/feeds/FeedList.test.tsx
```

Expected: PASS

- [ ] **Step 2: 运行构建验证**

Run: `pnpm build`

Expected: PASS

- [ ] **Step 3: 检查工作区差异，确认只包含本计划相关修改**

Run: `git status --short`

Expected: 只出现本计划涉及文件，无意外改动。

- [ ] **Step 4: 最终提交**

```bash
git add src/server src/app src/lib src/types src/features
git commit -m "fix(errors): 向前端透出异步任务原始错误" \
  -m "- 补齐原始错误的脱敏存储、API 透出与客户端映射" \
  -m "- 新增文章错误卡片并让 RSS tooltip 显示真实失败原因" \
  -m "- 补充任务、仓储、API 与前端测试并通过构建验证"
```

## Notes For Implementers

- 原始错误脱敏必须发生在落库前，不能把“先写库再前端隐藏”当作替代方案。
- 不要把 `stack` 拼进 `rawErrorMessage`；只保留适合给用户看的 provider 原文。
- `ArticleView` 当前已经有摘要失败和翻译失败的零散展示，实施时先删除重复错误块，再引入统一卡片，避免一页出现两份失败信息。
- `FeedList` 的 `sr-only` 描述也应与 tooltip 一致，优先复用 `fetchRawError || fetchError`。
