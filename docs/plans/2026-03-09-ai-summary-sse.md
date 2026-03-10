# AI 摘要 SSE Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 将 AI 摘要改造成和翻译一致的 SSE 流式体验，在文章详情页边生成边显示，支持半成品持久化、后台继续运行和重新进入页面后的自动恢复。

**Architecture:** 沿用当前“API 入队 + pg-boss worker + article 详情刷新”的主链路，但为摘要新增独立的 session 与 event 持久化层。后端 worker 使用 OpenAI 流式接口持续写入摘要草稿和事件，前端通过“文章详情快照 + 摘要 snapshot + SSE”组合恢复和展示活动会话，只有会话成功完成时才覆盖正式 `articles.ai_summary`。

**Tech Stack:** Next.js 16 Route Handlers、React 19、Zustand、PostgreSQL、pg-boss、OpenAI Node SDK、Vitest、Testing Library、pnpm

---

## 已知上下文

- 设计文档：`docs/plans/2026-03-09-ai-summary-sse-design.md`
- 设计文档提交：`16611c9`
- 当前摘要入队接口：`src/app/api/articles/[id]/ai-summary/route.ts`
- 当前文章详情接口：`src/app/api/articles/[id]/route.ts`
- 当前摘要 worker 入口：`src/worker/index.ts`
- 当前翻译 SSE 参考：`src/app/api/articles/[id]/ai-translate/route.ts`
- 当前翻译 stream 路由：`src/app/api/articles/[id]/ai-translate/stream/route.ts`
- 当前翻译前端 hook：`src/features/articles/useImmersiveTranslation.ts`
- 当前摘要 UI：`src/features/articles/ArticleView.tsx`
- 当前 API 客户端与 DTO 映射：`src/lib/apiClient.ts`

截至 2026-03-09，仓库中没有 `docs/summaries/` 目录，因此本计划没有可链接的历史总结文档。

执行本计划时，优先在独立 worktree 中运行；当前计划文档是在现有工作区中生成的。

## 实施守则

- 遵循 `@workflow-test-driven-development`：每个任务先写失败测试，再写最小实现。
- 遵循 `@workflow-verification-before-completion`：只有跑过文中验证命令后，才能宣称对应任务完成。
- 参考 `@nodejs-best-practices`：避免把路由、worker、仓储职责混在同一个文件里。
- 参考 `@vitest`：优先复用现有 FakeEventSource、Route Handler、repo mock 测试方式。
- 坚持 DRY 与 YAGNI：不要实现模型 token 级断点续传，不要把半成品投影到列表页。
- 每个任务完成后都单独提交，提交信息使用简体中文 Conventional Commits，scope 必填。

### Task 1: 建立摘要会话与事件持久化基础

**Files:**

- Create: `src/server/db/migrations/0017_article_ai_summary_streaming.sql`
- Create: `src/server/db/migrations/articleAiSummaryStreamingMigration.test.ts`
- Create: `src/server/repositories/articleAiSummaryRepo.ts`
- Create: `src/server/repositories/articleAiSummaryRepo.test.ts`
- Reference: `src/server/repositories/articleTranslationRepo.ts`
- Reference: `src/server/db/migrations/0016_schema_performance_constraints.sql`

**Step 1: Write the failing test**

先补数据库迁移测试和仓储测试，覆盖以下最小语义：

- migration 创建 `article_ai_summary_sessions` 与 `article_ai_summary_events`
- repo 可以插入或更新 session
- repo 可以追加 event
- repo 可以按文章拿到活动 session
- repo 可以按 `event_id` 回放事件

建议在 `src/server/repositories/articleAiSummaryRepo.test.ts` 中先写一个最小 API：

```ts
describe('articleAiSummaryRepo', () => {
  it('upserts a running summary session and lists events after event id', async () => {
    await upsertAiSummarySession(pool, {
      articleId: 'article-1',
      sourceTextHash: 'hash-1',
      status: 'running',
      draftText: 'TL;DR',
      finalText: null,
      model: 'gpt-4o-mini',
      jobId: 'job-1',
    });

    await insertAiSummaryEvent(pool, {
      sessionId: 'session-1',
      eventType: 'summary.delta',
      payload: { deltaText: ' 第一段' },
    });

    const active = await getActiveAiSummarySessionByArticleId(pool, 'article-1');
    const events = await listAiSummaryEventsAfter(pool, {
      sessionId: 'session-1',
      afterEventId: 0,
    });

    expect(active?.draftText).toBe('TL;DR');
    expect(events[0]?.eventType).toBe('summary.delta');
  });
});
```

并为 migration 增加断言：

```ts
expect(sql).toContain('create table if not exists article_ai_summary_sessions');
expect(sql).toContain('create table if not exists article_ai_summary_events');
expect(sql).toContain('superseded_by_session_id');
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/server/db/migrations/articleAiSummaryStreamingMigration.test.ts src/server/repositories/articleAiSummaryRepo.test.ts
```

Expected:

- FAIL，因为 migration、repo 文件和函数都还不存在。

**Step 3: Write minimal implementation**

创建 migration 和 repo，最小支持以下接口：

```ts
export async function upsertAiSummarySession(...) {}
export async function getActiveAiSummarySessionByArticleId(...) {}
export async function getAiSummarySessionById(...) {}
export async function markAiSummarySessionSuperseded(...) {}
export async function insertAiSummaryEvent(...) {}
export async function listAiSummaryEventsAfter(...) {}
```

SQL 约束建议先做到：

- `article_id` 外键指向 `articles(id)`
- `(article_id, status)` 不做复杂唯一约束，活动会话选择由 repo 查询负责
- `event_id` 使用递增主键，便于 SSE `Last-Event-ID`
- `payload` 使用 `jsonb`

`getActiveAiSummarySessionByArticleId` 的查询先按下面语义实现即可：

```sql
where article_id = $1
  and superseded_by_session_id is null
order by
  case when status in ('queued', 'running') then 0 else 1 end,
  updated_at desc
limit 1
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/server/db/migrations/articleAiSummaryStreamingMigration.test.ts src/server/repositories/articleAiSummaryRepo.test.ts
```

Expected:

- PASS，迁移测试和 repo 测试通过。

**Step 5: Commit**

```bash
git add src/server/db/migrations/0017_article_ai_summary_streaming.sql src/server/db/migrations/articleAiSummaryStreamingMigration.test.ts src/server/repositories/articleAiSummaryRepo.ts src/server/repositories/articleAiSummaryRepo.test.ts
git commit -m "feat(摘要): 添加摘要会话与事件持久化" -m "- 添加摘要流式会话与事件表结构\n- 添加摘要会话仓储与事件回放查询\n- 补充迁移与仓储测试"
```

### Task 2: 提取可测试的流式摘要 worker 模块

**Files:**

- Create: `src/server/ai/streamSummarizeText.ts`
- Create: `src/server/ai/streamSummarizeText.test.ts`
- Create: `src/worker/aiSummaryStreamWorker.ts`
- Create: `src/worker/aiSummaryStreamWorker.test.ts`
- Modify: `src/worker/index.ts`
- Reference: `src/server/ai/summarizeText.ts`
- Reference: `src/worker/immersiveTranslateWorker.ts`
- Reference: `src/worker/articleTaskStatus.ts`

**Step 1: Write the failing test**

先把“摘要流式写草稿和事件”的核心逻辑从 `src/worker/index.ts` 中抽出来，用单测锁定行为，再回接入口。

在 `src/server/ai/streamSummarizeText.test.ts` 里先写一个最小流式聚合测试：

```ts
it('yields summary text chunks from chat completion stream', async () => {
  const chunks = ['TL;DR', '\n- 第一条', '\n- 第二条'];
  const result: string[] = [];

  for await (const part of streamSummarizeText({
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: 'key',
    model: 'gpt-4o-mini',
    text: 'hello',
  }, { createStream: () => fakeOpenAiStream(chunks) })) {
    result.push(part);
  }

  expect(result).toEqual(chunks);
});
```

在 `src/worker/aiSummaryStreamWorker.test.ts` 里先写出 worker 语义：

```ts
it('persists draft updates and finalizes article ai summary on completion', async () => {
  await runAiSummaryStreamWorker({
    articleId: 'article-1',
    sessionId: 'session-1',
    jobId: 'job-1',
    deps: {
      streamSummarizeText: async function* () {
        yield 'TL;DR';
        yield '\n- 第一条';
      },
      // 其余 repo 与 task 依赖 mock
    },
  });

  expect(updateSessionDraftMock).toHaveBeenCalled();
  expect(insertEventMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ eventType: 'summary.delta' }),
  );
  expect(setArticleAiSummaryMock).toHaveBeenCalledWith(
    expect.anything(),
    'article-1',
    expect.objectContaining({ aiSummary: 'TL;DR\n- 第一条' }),
  );
});
```

再加一个失败场景，断言失败时保留草稿并落 `session.failed`。

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/server/ai/streamSummarizeText.test.ts src/worker/aiSummaryStreamWorker.test.ts
```

Expected:

- FAIL，因为流式摘要模块和 worker 模块都还不存在。

**Step 3: Write minimal implementation**

先创建 `src/server/ai/streamSummarizeText.ts`，复用现有 prompt，但改用流式接口：

```ts
const stream = await client.chat.completions.create({
  model: input.model,
  temperature: 0.2,
  stream: true,
  messages: [...],
});

for await (const chunk of stream) {
  const delta = chunk.choices?.[0]?.delta?.content;
  if (typeof delta === 'string' && delta) {
    yield delta;
  }
}
```

再创建 `src/worker/aiSummaryStreamWorker.ts`，负责：

- 根据 `articleId` 和 `sessionId` 读取文章、session、AI 设置
- 调用 `runArticleTaskWithStatus`
- 逐步拼接 `draftText`
- 节流写入 `updateAiSummarySessionDraft(...)`
- 写入 `summary.delta` 与周期性 `summary.snapshot`
- 成功时 `completeAiSummarySession(...)` 并调用 `setArticleAiSummary(...)`
- 失败时 `failAiSummarySession(...)` 并保留 `draftText`

最后在 `src/worker/index.ts` 里把原有 `ai_summary` 分支改成调用新模块，而不是直接调用一次性 `summarizeText(...)`。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/server/ai/streamSummarizeText.test.ts src/worker/aiSummaryStreamWorker.test.ts
```

Expected:

- PASS，流式摘要模块和 worker 模块行为通过。

**Step 5: Commit**

```bash
git add src/server/ai/streamSummarizeText.ts src/server/ai/streamSummarizeText.test.ts src/worker/aiSummaryStreamWorker.ts src/worker/aiSummaryStreamWorker.test.ts src/worker/index.ts
git commit -m "feat(摘要): 添加流式摘要 worker" -m "- 添加基于 OpenAI 流的摘要文本生成器\n- 提取摘要会话写入与事件落库 worker 模块\n- 让 ai_summary 任务改用流式执行链路"
```

### Task 3: 为摘要补齐 snapshot 与 SSE 路由

**Files:**

- Modify: `src/app/api/articles/[id]/ai-summary/route.ts`
- Modify: `src/app/api/articles/routes.test.ts`
- Create: `src/app/api/articles/[id]/ai-summary/stream/route.ts`
- Create: `src/app/api/articles/[id]/ai-summary/stream/route.test.ts`
- Reference: `src/app/api/articles/[id]/ai-translate/stream/route.ts`
- Reference: `src/server/repositories/articleAiSummaryRepo.ts`

**Step 1: Write the failing test**

先补三类 API 测试：

- `GET /api/articles/:id/ai-summary` 返回活动摘要 session snapshot
- `POST /api/articles/:id/ai-summary` 在 `force: true` 时创建新 session 并允许已有正式摘要重跑
- `GET /api/articles/:id/ai-summary/stream` 可以回放 `Last-Event-ID` 之后的摘要事件

在 `src/app/api/articles/routes.test.ts` 里先增加：

```ts
it('GET /:id/ai-summary returns active summary session snapshot', async () => {
  getActiveAiSummarySessionByArticleIdMock.mockResolvedValue({
    id: 'session-1',
    articleId,
    status: 'running',
    draftText: 'TL;DR',
    finalText: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-03-09T00:00:00.000Z',
    finishedAt: null,
    updatedAt: '2026-03-09T00:00:10.000Z',
  });

  const mod = await import('./[id]/ai-summary/route');
  const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}/ai-summary`), {
    params: Promise.resolve({ id: articleId }),
  });

  const json = await res.json();
  expect(json.data.session.status).toBe('running');
  expect(json.data.session.draftText).toBe('TL;DR');
});
```

在 `src/app/api/articles/[id]/ai-summary/stream/route.test.ts` 里复用翻译 stream 路由测试模式：

```ts
it('SSE stream replays summary events after Last-Event-ID', async () => {
  listAiSummaryEventsAfterMock.mockResolvedValue([
    {
      eventId: 8,
      sessionId: 'session-1',
      eventType: 'summary.delta',
      payload: { deltaText: ' 第一条' },
      createdAt: '2026-03-09T00:00:11.000Z',
    },
  ]);

  const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}/ai-summary/stream`, {
    headers: { 'last-event-id': '7' },
  }), { params: Promise.resolve({ id: articleId }) });

  expect(res.headers.get('content-type')).toContain('text/event-stream');
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/app/api/articles/routes.test.ts src/app/api/articles/'[id]'/ai-summary/stream/route.test.ts
```

Expected:

- FAIL，因为 `GET /ai-summary` 和新的 stream route 还没有实现。

**Step 3: Write minimal implementation**

在 `src/app/api/articles/[id]/ai-summary/route.ts` 中：

- 新增 `GET`，返回 `{ session }`
- `POST` 在成功入队前创建或重置 session
- `force: true` 时如果存在旧活动 session，先标记 superseded，再创建新 session
- 返回值可增加 `sessionId`

最小接口形态：

```ts
return ok({
  session: snapshot
    ? {
        id: snapshot.id,
        status: snapshot.status,
        draftText: snapshot.draftText,
        finalText: snapshot.finalText,
        errorCode: snapshot.errorCode,
        errorMessage: snapshot.errorMessage,
        startedAt: snapshot.startedAt,
        finishedAt: snapshot.finishedAt,
        updatedAt: snapshot.updatedAt,
      }
    : null,
});
```

新增 `src/app/api/articles/[id]/ai-summary/stream/route.ts`，基本复制翻译 stream 路由模式，但 repo 改成摘要 session 与摘要 event：

```ts
function formatSseEvent(event: AiSummaryEventRow): string {
  return `id: ${event.eventId}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event.payload)}\n\n`;
}
```

轮询周期、heartbeat、`Last-Event-ID` 处理可以与翻译 stream 保持一致。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/app/api/articles/routes.test.ts src/app/api/articles/'[id]'/ai-summary/stream/route.test.ts
```

Expected:

- PASS，新增摘要 snapshot 与 SSE 路由测试通过。

**Step 5: Commit**

```bash
git add src/app/api/articles/'[id]'/ai-summary/route.ts src/app/api/articles/routes.test.ts src/app/api/articles/'[id]'/ai-summary/stream/route.ts src/app/api/articles/'[id]'/ai-summary/stream/route.test.ts
git commit -m "feat(API): 添加摘要 snapshot 与 SSE 路由" -m "- 添加摘要会话快照读取接口\n- 添加摘要事件流 SSE 路由与事件回放\n- 更新摘要入队接口以创建和切换会话"
```

### Task 4: 扩展文章详情 DTO、客户端与 store 映射

**Files:**

- Modify: `src/app/api/articles/[id]/route.ts`
- Modify: `src/app/api/articles/routes.test.ts`
- Modify: `src/lib/apiClient.ts`
- Modify: `src/lib/apiClient.test.ts`
- Modify: `src/types/index.ts`
- Modify: `src/store/appStore.ts`
- Modify: `src/store/appStore.test.ts`
- Reference: `src/server/repositories/articlesRepo.ts`

**Step 1: Write the failing test**

先把“文章详情携带摘要会话快照”的契约锁住，避免前端后面临时拼状态。

在 `src/app/api/articles/routes.test.ts` 中增加：

```ts
expect(json.data.aiSummarySession).toEqual({
  id: 'session-1',
  status: 'running',
  draftText: 'TL;DR',
  finalText: null,
  errorCode: null,
  errorMessage: null,
  startedAt: '2026-03-09T00:00:00.000Z',
  finishedAt: null,
  updatedAt: '2026-03-09T00:00:10.000Z',
});
```

在 `src/lib/apiClient.test.ts` 中增加 DTO 映射断言：

```ts
expect(mapArticleDto(dto).aiSummarySession?.draftText).toBe('TL;DR');
```

在 `src/store/appStore.test.ts` 中增加 `refreshArticle` 覆盖：

```ts
const result = await useAppStore.getState().refreshArticle('article-1');
expect(result.hasAiSummary).toBe(false);
expect(useAppStore.getState().articles[0]?.aiSummarySession?.status).toBe('running');
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/app/api/articles/routes.test.ts src/lib/apiClient.test.ts src/store/appStore.test.ts
```

Expected:

- FAIL，因为 `ArticleDto`、`Article` 和详情接口还没有 `aiSummarySession` 字段。

**Step 3: Write minimal implementation**

在 `src/app/api/articles/[id]/route.ts` 中引入摘要 session repo，把轻量字段并入返回对象：

```ts
const aiSummarySession = await getActiveAiSummarySessionByArticleId(pool, article.id);

return ok({
  ...proxiedArticle,
  aiSummarySession: aiSummarySession
    ? {
        id: aiSummarySession.id,
        status: aiSummarySession.status,
        draftText: aiSummarySession.draftText,
        finalText: aiSummarySession.finalText,
        errorCode: aiSummarySession.errorCode,
        errorMessage: aiSummarySession.errorMessage,
        startedAt: aiSummarySession.startedAt,
        finishedAt: aiSummarySession.finishedAt,
        updatedAt: aiSummarySession.updatedAt,
      }
    : null,
});
```

然后更新：

- `src/lib/apiClient.ts` 中的 `ArticleDto`、`Article` 类型和 `mapArticleDto`
- `src/types/index.ts` 中的 `Article` 类型
- `src/store/appStore.ts` 的 `refreshArticle` 与初始文章更新逻辑

注意保留 `hasAiSummary` 的旧语义：它仍只根据正式 `dto.aiSummary` 判断，不把运行中的草稿视为正式摘要。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/app/api/articles/routes.test.ts src/lib/apiClient.test.ts src/store/appStore.test.ts
```

Expected:

- PASS，文章详情、客户端 DTO 与 store 映射对齐。

**Step 5: Commit**

```bash
git add src/app/api/articles/'[id]'/route.ts src/app/api/articles/routes.test.ts src/lib/apiClient.ts src/lib/apiClient.test.ts src/types/index.ts src/store/appStore.ts src/store/appStore.test.ts
git commit -m "feat(reader): 暴露文章摘要会话快照" -m "- 为文章详情添加活动摘要会话字段\n- 更新客户端 DTO 与 store 映射逻辑\n- 保持正式摘要与运行中草稿语义分离"
```

### Task 5: 新增前端流式摘要 hook

**Files:**

- Create: `src/features/articles/useStreamingAiSummary.ts`
- Create: `src/features/articles/useStreamingAiSummary.test.ts`
- Modify: `src/lib/apiClient.ts`
- Modify: `src/lib/apiClient.test.ts`
- Reference: `src/features/articles/useImmersiveTranslation.ts`

**Step 1: Write the failing test**

先为 hook 写测试，锁定以下交互：

- `requestSummary()` 成功后先拉 snapshot，再创建 `EventSource`
- 收到 `summary.delta` 时追加草稿
- 收到 `summary.snapshot` 时用完整草稿纠偏
- 收到 `session.completed` 时停止 loading，并保留最终文本
- 切换 `articleId` 或卸载时关闭旧 `EventSource`

测试骨架可以直接复用翻译 hook 的 FakeEventSource：

```ts
it('loads summary snapshot and applies SSE delta events', async () => {
  const fakeEventSource = new FakeEventSource();
  const api = {
    enqueueArticleAiSummary: vi.fn().mockResolvedValue({ enqueued: true, jobId: 'job-1', sessionId: 'session-1' }),
    getArticleAiSummarySnapshot: vi.fn().mockResolvedValue({
      session: { id: 'session-1', status: 'running', draftText: 'TL;DR', finalText: null },
    }),
    createArticleAiSummaryEventSource: vi.fn().mockReturnValue(fakeEventSource as unknown as EventSource),
  };

  const { result } = renderHook(() => useStreamingAiSummary({ articleId: 'article-1', api }));
  await act(async () => {
    await result.current.requestSummary();
  });

  act(() => {
    fakeEventSource.emit('summary.delta', { deltaText: '\n- 第一条' });
  });

  expect(result.current.session?.draftText).toBe('TL;DR\n- 第一条');
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/features/articles/useStreamingAiSummary.test.ts src/lib/apiClient.test.ts
```

Expected:

- FAIL，因为 hook、snapshot API helper 和摘要 `EventSource` helper 还不存在。

**Step 3: Write minimal implementation**

先在 `src/lib/apiClient.ts` 中新增最小 API：

```ts
export async function getArticleAiSummarySnapshot(articleId: string) {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}/ai-summary`);
}

export function createArticleAiSummaryEventSource(articleId: string): EventSource {
  return new EventSource(toAbsoluteUrl(`/api/articles/${encodeURIComponent(articleId)}/ai-summary/stream`));
}
```

再实现 `useStreamingAiSummary`，建议接口：

```ts
export function useStreamingAiSummary(input: {
  articleId: string | null;
  initialSession?: ArticleAiSummarySessionDto | null;
  onCompleted?: (articleId: string) => Promise<void> | void;
}) {
  return {
    loading,
    missingApiKey,
    waitingFulltext,
    session,
    requestSummary,
    clearTransientState,
  };
}
```

实现要点：

- 先拿 snapshot，再连 stream
- `summary.delta` 直接追加到当前 `draftText`
- `summary.snapshot` 覆盖本地 `draftText`
- `session.completed` / `session.failed` 时关闭 stream
- 变更 `articleId` 时重置局部状态

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/features/articles/useStreamingAiSummary.test.ts src/lib/apiClient.test.ts
```

Expected:

- PASS，hook 可以稳定消费摘要 snapshot 与 SSE 事件。

**Step 5: Commit**

```bash
git add src/features/articles/useStreamingAiSummary.ts src/features/articles/useStreamingAiSummary.test.ts src/lib/apiClient.ts src/lib/apiClient.test.ts
git commit -m "feat(reader): 添加流式摘要前端 hook" -m "- 添加摘要 snapshot 与 SSE 客户端封装\n- 新增摘要流式状态管理 hook\n- 补充 hook 对增量、快照与完成事件的测试"
```

### Task 6: 接入 ArticleView 并完成交互回归

**Files:**

- Modify: `src/features/articles/ArticleView.tsx`
- Modify: `src/features/articles/ArticleView.aiSummary.test.tsx`
- Reference: `src/features/articles/useStreamingAiSummary.ts`
- Reference: `src/store/appStore.ts`

**Step 1: Write the failing test**

先用 `ArticleView.aiSummary.test.tsx` 锁定最关键的用户体验：

- 开启 `aiSummaryOnOpenEnabled` 时，打开文章后自动触发流式摘要
- 有旧正式摘要时点击“生成摘要”，旧摘要立即隐藏，切到新的运行中卡片
- 重新进入文章时，如果 `article.aiSummarySession.status === 'running'`，先显示草稿再继续接收 SSE
- 失败时若已有草稿，则保留草稿并显示错误与重试

建议增加类似测试：

```tsx
it('hides the old summary and shows the new running session when regenerate is clicked', async () => {
  seedArticleViewState({
    article: {
      aiSummary: '旧摘要',
      aiSummarySession: {
        id: 'session-2',
        status: 'running',
        draftText: 'TL;DR',
        finalText: null,
        errorCode: null,
        errorMessage: null,
        startedAt: '2026-03-09T00:00:00.000Z',
        finishedAt: null,
        updatedAt: '2026-03-09T00:00:10.000Z',
      },
    },
  });

  render(<ArticleView />);

  expect(screen.queryByText('旧摘要')).not.toBeInTheDocument();
  expect(screen.getByText('TL;DR')).toBeInTheDocument();
  expect(screen.getByText('正在生成摘要')).toBeInTheDocument();
});
```

再加一个自动打开场景，验证 `enqueueArticleAiSummary` 在打开文章后会被自动调用，并在收到 `summary.delta` 后更新卡片内容。

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/features/articles/ArticleView.aiSummary.test.tsx
```

Expected:

- FAIL，因为 `ArticleView` 仍然只依赖 `article.aiSummary`、`aiSummaryLoading` 和任务轮询。

**Step 3: Write minimal implementation**

在 `src/features/articles/ArticleView.tsx` 中：

- 用 `useStreamingAiSummary(...)` 取代当前 `requestAiSummary + pollWithBackoff(getArticleTasks)` 主链路
- 保留 `missing_api_key`、`fulltext_pending`、失败提示的现有文案
- 自动打开逻辑改为：当 feed 开启 `aiSummaryOnOpenEnabled` 且当前存在活动 session 或缺少正式摘要时，调用 `requestSummary({ force: false })`
- 摘要展示优先读 `streamingSummary.session?.draftText/finalText`，其次才读 `article.aiSummary`

推荐先抽一个局部变量统一 UI 判定：

```tsx
const activeAiSummarySession = streamingAiSummary.session;
const displayedAiSummaryText =
  activeAiSummarySession?.finalText?.trim() ||
  activeAiSummarySession?.draftText?.trim() ||
  article.aiSummary?.trim() ||
  '';
const showingStreamingSummary = Boolean(activeAiSummarySession);
```

界面约束：

- `showingStreamingSummary === true` 时，旧正式摘要不要继续显示
- `running` 时显示“正在生成摘要”
- `failed` 时如果存在 `draftText`，继续显示卡片正文，同时在卡片下方保留错误与重试

完成事件里调用 `refreshArticle(articleId)`，让详情与正式摘要重新同步。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/features/articles/ArticleView.aiSummary.test.tsx src/features/articles/useStreamingAiSummary.test.ts
```

Expected:

- PASS，摘要详情页交互与流式 hook 集成通过。

**Step 5: Commit**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/ArticleView.aiSummary.test.tsx src/features/articles/useStreamingAiSummary.ts src/features/articles/useStreamingAiSummary.test.ts
git commit -m "feat(reader): 接入流式 AI 摘要展示" -m "- 让文章详情优先展示活动摘要会话草稿\n- 接入自动触发、重跑切换与完成刷新逻辑\n- 补充摘要流式交互与回归测试"
```

### Task 7: 运行回归验证并收敛遗留轮询逻辑

**Files:**

- Modify: `src/features/articles/ArticleView.tsx`
- Modify: `src/features/articles/ArticleView.aiTranslate.test.tsx`
- Modify: `src/features/articles/ArticleView.aiSummary.test.tsx`
- Modify: `src/app/api/articles/routes.test.ts`
- Reference: `src/lib/polling.ts`

**Step 1: Write the failing test**

在完成主体接入后，再补一个“摘要不再依赖 `pollWithBackoff(getArticleTasks)`”的保护性测试，避免未来回退到轮询实现。

建议在 `src/features/articles/ArticleView.aiSummary.test.tsx` 中增加：

```tsx
it('does not poll article tasks to render streaming summary progress', async () => {
  render(<ArticleView />);
  fireEvent.click(await screen.findByRole('button', { name: '生成摘要' }));
  await waitFor(() => {
    expect(getArticleTasksMock).not.toHaveBeenCalled();
  });
});
```

如果现有测试夹具会在其它 effect 中请求 `getArticleTasks`，则把断言收窄到“摘要运行中的主链路不依赖任务轮询”，例如只校验流式事件到达前后 `getArticleTasksMock` 没有被额外调用。

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/features/articles/ArticleView.aiSummary.test.tsx src/features/articles/ArticleView.aiTranslate.test.tsx src/app/api/articles/routes.test.ts
```

Expected:

- FAIL，直到残余摘要轮询逻辑和测试夹具完全清理。

**Step 3: Write minimal implementation**

删除或收敛只为摘要轮询服务的局部状态，例如：

- `aiSummaryLoadingArticleId`
- `aiSummaryTimedOutArticleId`
- `requestAiSummary` 中对 `pollWithBackoff(getArticleTasks)` 的依赖

保留 `getArticleTasks` 对全文抓取与其他任务的现有用途，不要误删翻译或 fulltext 相关逻辑。

如果摘要失败态仍需要统一错误文案，优先从 `activeAiSummarySession.errorMessage` 读取，再回退到 `tasks.ai_summary.errorMessage`。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/features/articles/ArticleView.aiSummary.test.tsx src/features/articles/ArticleView.aiTranslate.test.tsx src/app/api/articles/routes.test.ts src/store/appStore.test.ts src/lib/apiClient.test.ts
```

Expected:

- PASS，摘要链路不再依赖任务轮询，翻译与文章详情相关回归测试继续通过。

**Step 5: Commit**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/ArticleView.aiSummary.test.tsx src/features/articles/ArticleView.aiTranslate.test.tsx src/app/api/articles/routes.test.ts src/store/appStore.test.ts src/lib/apiClient.test.ts
git commit -m "refactor(摘要): 移除摘要轮询主链路" -m "- 删除摘要展示对任务轮询的直接依赖\n- 保留全文与翻译现有任务状态语义\n- 收敛流式摘要完成后的回归测试"
```

## 全量验证清单

按任务执行完后，再运行一次受影响范围回归：

```bash
pnpm vitest run \
  src/server/db/migrations/articleAiSummaryStreamingMigration.test.ts \
  src/server/repositories/articleAiSummaryRepo.test.ts \
  src/server/ai/streamSummarizeText.test.ts \
  src/worker/aiSummaryStreamWorker.test.ts \
  src/app/api/articles/routes.test.ts \
  src/app/api/articles/'[id]'/ai-summary/stream/route.test.ts \
  src/lib/apiClient.test.ts \
  src/store/appStore.test.ts \
  src/features/articles/useStreamingAiSummary.test.ts \
  src/features/articles/ArticleView.aiSummary.test.tsx \
  src/features/articles/ArticleView.aiTranslate.test.tsx
```

Expected:

- 所有新增与受影响测试均 PASS。
- 没有把运行中的摘要草稿泄漏到文章列表或 snapshot 场景。
- 翻译 SSE 回归继续通过。

如需更高信心，再追加：

```bash
pnpm vitest run src/features/articles src/app/api/articles src/worker src/server/repositories
```

## 执行提示

- 先完成数据层与 worker，再做 API，再做客户端和 UI；不要反过来从页面硬写状态。
- `article_tasks.ai_summary` 继续保留任务状态职责，不要再让它承载摘要正文。
- `article.aiSummary` 只代表正式摘要；运行中草稿只来自 `aiSummarySession`。
- 失败后的“恢复”定义为用户体验恢复与后台任务持续，不是模型 token 级断点续传。
