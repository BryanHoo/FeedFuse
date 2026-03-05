# AI 摘要与翻译触发策略重构 Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 在订阅源级新增“获取后/打开后”摘要与正文翻译触发策略，并将文章页 `AI摘要`/`翻译` 按钮统一为“始终可点击 + 手动强制重跑”语义。

**Architecture:** 通过 `feeds` 新增触发配置字段承载自动策略，自动路径统一使用 `force=false`（仅无结果触发），手动路径统一使用 `force=true`（始终重跑）。后端 route 保持现有 `reason` 语义并扩展 `force`，前端去除“翻译/原文”切换按钮语义，自动翻译触发后自动进入翻译视图。为让“列表标题自动翻译”可见，Reader Snapshot 增加 `titleZh` 并在列表优先展示译文标题。

**Tech Stack:** Next.js App Router, TypeScript, PostgreSQL, pg-boss, Zustand, Vitest, Testing Library

---

## Relevant Prior Learnings

- `docs/summaries/2026-03-04-async-tasks-refactor.md`
- `docs/summaries/2026-03-04-immersive-translation.md`
- `docs/summaries/2026-03-05-translation-preserve-html-structure.md`

## Execution Rules

- 执行时使用 @workflow-test-driven-development（先红后绿）。
- 每个 Task 完成后按计划提交一次 commit（小步提交）。
- 最终收尾使用 @workflow-verification-before-completion 逐条核验。

---

### Task 1: `feeds` 增加自动触发配置字段（DB Migration）

**Files:**

- Create: `src/server/db/migrations/0015_feed_ai_trigger_flags.sql`
- Create: `src/server/db/migrations/feedAiTriggerFlagsMigration.test.ts`
- Test: `src/server/db/migrations/feedAiTriggerFlagsMigration.test.ts`

**Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('feed ai trigger flags migration', () => {
  it('adds summary/translate on-fetch and translate on-open columns', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'src/server/db/migrations/0015_feed_ai_trigger_flags.sql'),
      'utf8',
    );

    expect(sql).toContain('ai_summary_on_fetch_enabled');
    expect(sql).toContain('body_translate_on_fetch_enabled');
    expect(sql).toContain('body_translate_on_open_enabled');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/server/db/migrations/feedAiTriggerFlagsMigration.test.ts`  
Expected: FAIL（迁移文件不存在）

**Step 3: Write minimal implementation**

```sql
alter table feeds
  add column if not exists ai_summary_on_fetch_enabled boolean not null default false,
  add column if not exists body_translate_on_fetch_enabled boolean not null default false,
  add column if not exists body_translate_on_open_enabled boolean not null default false;

update feeds
set body_translate_on_open_enabled = body_translate_enabled
where body_translate_enabled = true;
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/server/db/migrations/feedAiTriggerFlagsMigration.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/db/migrations/0015_feed_ai_trigger_flags.sql src/server/db/migrations/feedAiTriggerFlagsMigration.test.ts
git commit -m "feat(db): 新增订阅源摘要翻译自动触发字段"
```

---

### Task 2: `feedsRepo` 扩展新字段读写与查询映射

**Files:**

- Modify: `src/server/repositories/feedsRepo.ts`
- Create: `src/server/repositories/feedsRepo.aiTriggerFlags.test.ts`
- Test: `src/server/repositories/feedsRepo.aiTriggerFlags.test.ts`

**Step 1: Write the failing test**

```ts
it('createFeed/updateFeed/listFeeds include ai trigger flags', async () => {
  // mock pool.query and assert SQL aliases:
  // ai_summary_on_fetch_enabled as "aiSummaryOnFetchEnabled"
  // body_translate_on_fetch_enabled as "bodyTranslateOnFetchEnabled"
  // body_translate_on_open_enabled as "bodyTranslateOnOpenEnabled"
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/server/repositories/feedsRepo.aiTriggerFlags.test.ts`  
Expected: FAIL（字段尚未出现在 SQL）

**Step 3: Write minimal implementation**

```ts
export interface FeedRow {
  // ...
  aiSummaryOnFetchEnabled: boolean;
  bodyTranslateOnFetchEnabled: boolean;
  bodyTranslateOnOpenEnabled: boolean;
}

// select / insert / update / returning 全量补齐三字段
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/server/repositories/feedsRepo.aiTriggerFlags.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/repositories/feedsRepo.ts src/server/repositories/feedsRepo.aiTriggerFlags.test.ts
git commit -m "feat(feed-repo): 扩展摘要翻译自动触发字段映射"
```

---

### Task 3: `feeds` API 契约扩展（create/patch）

**Files:**

- Modify: `src/app/api/feeds/route.ts`
- Modify: `src/app/api/feeds/[id]/route.ts`
- Modify: `src/app/api/feeds/routes.test.ts`
- Test: `src/app/api/feeds/routes.test.ts`

**Step 1: Write the failing test**

```ts
it('POST /api/feeds accepts aiSummaryOnFetchEnabled/bodyTranslateOnFetchEnabled/bodyTranslateOnOpenEnabled', async () => {
  // assert createFeed called with new fields
});

it('PATCH /api/feeds/:id accepts new trigger flags', async () => {
  // assert updateFeed called with new fields
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/app/api/feeds/routes.test.ts -t "trigger flags|onFetch|onOpen"`  
Expected: FAIL（zod schema 未包含新字段）

**Step 3: Write minimal implementation**

```ts
const createFeedBodySchema = z.object({
  // ...
  aiSummaryOnFetchEnabled: z.boolean().optional(),
  bodyTranslateOnFetchEnabled: z.boolean().optional(),
  bodyTranslateOnOpenEnabled: z.boolean().optional(),
});
```

```ts
const patchBodySchema = z.object({
  // ...
  aiSummaryOnFetchEnabled: z.boolean().optional(),
  bodyTranslateOnFetchEnabled: z.boolean().optional(),
  bodyTranslateOnOpenEnabled: z.boolean().optional(),
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/app/api/feeds/routes.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/feeds/route.ts src/app/api/feeds/[id]/route.ts src/app/api/feeds/routes.test.ts
git commit -m "feat(feed-api): 支持摘要翻译自动触发新配置字段"
```

---

### Task 4: 前端类型与 store 流水线补齐新字段

**Files:**

- Modify: `src/types/index.ts`
- Modify: `src/lib/apiClient.ts`
- Modify: `src/store/appStore.ts`
- Modify: `src/store/appStore.test.ts`
- Test: `src/store/appStore.test.ts`

**Step 1: Write the failing test**

```ts
it('maps new feed trigger flags from dto into app store feed', async () => {
  // expect mapped feed has aiSummaryOnFetchEnabled/bodyTranslateOnFetchEnabled/bodyTranslateOnOpenEnabled
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/store/appStore.test.ts -t "trigger flags"`  
Expected: FAIL（类型/映射缺字段）

**Step 3: Write minimal implementation**

```ts
export interface Feed {
  // ...
  aiSummaryOnFetchEnabled: boolean;
  bodyTranslateOnFetchEnabled: boolean;
  bodyTranslateOnOpenEnabled: boolean;
}
```

```ts
export function mapFeedDto(dto: ReaderSnapshotDto['feeds'][number], categories: Category[]): Feed {
  return {
    // ...
    aiSummaryOnFetchEnabled: dto.aiSummaryOnFetchEnabled,
    bodyTranslateOnFetchEnabled: dto.bodyTranslateOnFetchEnabled,
    bodyTranslateOnOpenEnabled: dto.bodyTranslateOnOpenEnabled,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/store/appStore.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/types/index.ts src/lib/apiClient.ts src/store/appStore.ts src/store/appStore.test.ts
git commit -m "feat(feed-client): 打通自动触发字段到前端状态"
```

---

### Task 5: FeedDialog 新增配置项与文案优化

**Files:**

- Modify: `src/features/feeds/FeedDialog.tsx`
- Modify: `src/features/feeds/EditFeedDialog.tsx`
- Modify: `src/features/feeds/FeedDialog.translationFlags.test.tsx`
- Modify: `src/features/feeds/AddFeedDialog.test.tsx`
- Test: `src/features/feeds/FeedDialog.translationFlags.test.tsx`

**Step 1: Write the failing test**

```tsx
it('renders and submits ai summary/translation trigger options on fetch and on open', async () => {
  // assert combobox labels:
  // 获取文章后自动获取摘要
  // 打开文章自动获取摘要
  // 获取文章后自动翻译正文
  // 打开文章自动翻译正文
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/feeds/FeedDialog.translationFlags.test.tsx`  
Expected: FAIL（控件/提交 payload 不存在）

**Step 3: Write minimal implementation**

```tsx
<Label htmlFor={`${fieldIdPrefix}-ai-summary-on-fetch`} className="text-xs">
  获取文章后自动获取摘要
</Label>
<p className="mt-1 text-xs text-muted-foreground">
  新文章入库后自动排队生成摘要（仅在未生成时触发）
</p>
```

```tsx
<Label htmlFor={`${fieldIdPrefix}-body-translate-on-open`} className="text-xs">
  打开文章自动翻译正文
</Label>
<p className="mt-1 text-xs text-muted-foreground">
  打开文章时自动触发正文翻译，并自动切换到翻译视图
</p>
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/feeds/FeedDialog.translationFlags.test.tsx src/features/feeds/AddFeedDialog.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/feeds/FeedDialog.tsx src/features/feeds/EditFeedDialog.tsx src/features/feeds/FeedDialog.translationFlags.test.tsx src/features/feeds/AddFeedDialog.test.tsx
git commit -m "feat(feed-dialog): 新增摘要翻译触发配置并优化文案"
```

---

### Task 6: `ai-summary` route 支持 `force` 重跑

**Files:**

- Modify: `src/app/api/articles/[id]/ai-summary/route.ts`
- Modify: `src/app/api/articles/routes.test.ts`
- Test: `src/app/api/articles/routes.test.ts`

**Step 1: Write the failing test**

```ts
it('POST /:id/ai-summary force=true bypasses already_summarized and enqueues', async () => {
  // article.aiSummary exists, body={ force: true }, expect enqueued true
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/app/api/articles/routes.test.ts -t "ai-summary force"`  
Expected: FAIL（当前仍返回 already_summarized）

**Step 3: Write minimal implementation**

```ts
const bodySchema = z.object({ force: z.boolean().optional() });
const body = bodySchema.safeParse(await request.json().catch(() => ({})));
const force = body.success ? Boolean(body.data.force) : false;

if (!force && article.aiSummary?.trim()) {
  return ok({ enqueued: false, reason: 'already_summarized' });
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/app/api/articles/routes.test.ts -t "ai-summary force|already_summarized"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/articles/[id]/ai-summary/route.ts src/app/api/articles/routes.test.ts
git commit -m "feat(ai-summary): 支持force参数强制重跑摘要"
```

---

### Task 7: `ai-translate` route 支持 `force` 重跑

**Files:**

- Modify: `src/app/api/articles/[id]/ai-translate/route.ts`
- Modify: `src/app/api/articles/routes.test.ts`
- Test: `src/app/api/articles/routes.test.ts`

**Step 1: Write the failing test**

```ts
it('POST /:id/ai-translate force=true bypasses already_translated and enqueues', async () => {
  // article.aiTranslationZhHtml exists, body={ force: true }, expect enqueued true
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/app/api/articles/routes.test.ts -t "ai-translate force"`  
Expected: FAIL（当前返回 already_translated）

**Step 3: Write minimal implementation**

```ts
const bodySchema = z.object({ force: z.boolean().optional() });
const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({})));
const force = parsedBody.success ? Boolean(parsedBody.data.force) : false;

if (!force && (article.aiTranslationBilingualHtml?.trim() || article.aiTranslationZhHtml?.trim())) {
  return ok({ enqueued: false, reason: 'already_translated' });
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/app/api/articles/routes.test.ts -t "ai-translate force|already_translated"`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/articles/[id]/ai-translate/route.ts src/app/api/articles/routes.test.ts
git commit -m "feat(ai-translate): 支持force参数强制重跑翻译"
```

---

### Task 8: worker 增加“获取文章后自动摘要/翻译”入队

**Files:**

- Modify: `src/worker/index.ts`
- Modify: `src/worker/index.test.ts` (如无此文件，创建 `src/worker/autoAiTriggers.test.ts`)
- Test: `src/worker/autoAiTriggers.test.ts`

**Step 1: Write the failing test**

```ts
it('enqueues ai_summary and ai_translate after insert when feed on-fetch flags are enabled', async () => {
  // given created article and feed flags enabled
  // expect boss.send called with JOB_AI_SUMMARIZE and JOB_AI_TRANSLATE
});

it('does not enqueue duplicate when article already has summary/translation', async () => {
  // expect no send
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/worker/autoAiTriggers.test.ts`  
Expected: FAIL（无自动触发逻辑）

**Step 3: Write minimal implementation**

```ts
if (created && feed.aiSummaryOnFetchEnabled === true && !created.aiSummary?.trim()) {
  await boss.send(JOB_AI_SUMMARIZE, { articleId: created.id }, getQueueSendOptions(JOB_AI_SUMMARIZE, { articleId: created.id }));
}

if (
  created &&
  feed.bodyTranslateOnFetchEnabled === true &&
  !(created.aiTranslationBilingualHtml?.trim() || created.aiTranslationZhHtml?.trim())
) {
  await boss.send(JOB_AI_TRANSLATE, { articleId: created.id }, getQueueSendOptions(JOB_AI_TRANSLATE, { articleId: created.id }));
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/worker/autoAiTriggers.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/worker/index.ts src/worker/autoAiTriggers.test.ts
git commit -m "feat(worker): 支持获取文章后自动触发摘要与翻译"
```

---

### Task 9: `apiClient` 与翻译 hook 支持 `force` 参数

**Files:**

- Modify: `src/lib/apiClient.ts`
- Modify: `src/lib/apiClient.test.ts`
- Modify: `src/features/articles/useImmersiveTranslation.ts`
- Modify: `src/features/articles/useImmersiveTranslation.test.ts`
- Test: `src/lib/apiClient.test.ts`

**Step 1: Write the failing test**

```ts
it('enqueueArticleAiSummary sends force in request body when provided', async () => {
  // expect fetch body contains {"force":true}
});

it('enqueueArticleAiTranslate sends force in request body when provided', async () => {
  // expect fetch body contains {"force":true}
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/lib/apiClient.test.ts -t "force"`  
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
export async function enqueueArticleAiSummary(articleId: string, input?: { force?: boolean }) {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}/ai-summary`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ force: Boolean(input?.force) }),
  });
}

export async function enqueueArticleAiTranslate(articleId: string, input?: { force?: boolean }) {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}/ai-translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ force: Boolean(input?.force) }),
  });
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/lib/apiClient.test.ts src/features/articles/useImmersiveTranslation.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/apiClient.ts src/lib/apiClient.test.ts src/features/articles/useImmersiveTranslation.ts src/features/articles/useImmersiveTranslation.test.ts
git commit -m "feat(api-client): 支持摘要翻译force重跑请求"
```

---

### Task 10: ArticleView 手动按钮改为“始终可点 + 强制重跑”

**Files:**

- Modify: `src/features/articles/ArticleView.tsx`
- Modify: `src/features/articles/ArticleView.aiSummary.test.tsx`
- Modify: `src/features/articles/ArticleView.aiTranslate.test.tsx`
- Test: `src/features/articles/ArticleView.aiSummary.test.tsx`

**Step 1: Write the failing test**

```tsx
it('翻译按钮文案固定为翻译，点击两次触发两次翻译请求', async () => {
  // expect button label always "翻译"
  // expect enqueue translate called twice with force=true
});

it('AI摘要按钮点击会强制重跑（已有摘要也会请求）', async () => {
  // expect enqueue summary called with force=true
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/articles/ArticleView.aiSummary.test.tsx src/features/articles/ArticleView.aiTranslate.test.tsx`  
Expected: FAIL（当前仍有“原文”切换语义）

**Step 3: Write minimal implementation**

```tsx
function onAiSummaryButtonClick() {
  if (!article?.id) return;
  void requestAiSummary(article.id, { force: true });
}

function onAiTranslationButtonClick() {
  if (!article?.id) return;
  void immersiveTranslation.requestTranslation({ force: true, autoView: true });
}

<span>翻译</span>
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/articles/ArticleView.aiSummary.test.tsx src/features/articles/ArticleView.aiTranslate.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/ArticleView.aiSummary.test.tsx src/features/articles/ArticleView.aiTranslate.test.tsx
git commit -m "feat(article-view): 手动摘要翻译改为强制重跑语义"
```

---

### Task 11: 打开文章自动翻译与新 feed 开关对齐

**Files:**

- Modify: `src/features/articles/ArticleView.tsx`
- Modify: `src/features/articles/ArticleView.aiTranslate.test.tsx`
- Test: `src/features/articles/ArticleView.aiTranslate.test.tsx`

**Step 1: Write the failing test**

```tsx
it('bodyTranslateOnOpenEnabled=true opens article and auto requests translation then auto enters translation view', async () => {
  // assert requestTranslation called once and content rendered in translation mode
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/articles/ArticleView.aiTranslate.test.tsx -t "on open"`  
Expected: FAIL

**Step 3: Write minimal implementation**

```tsx
const feedBodyTranslateOnOpenEnabled = feed?.bodyTranslateOnOpenEnabled ?? false;

useEffect(() => {
  if (!article?.id) return;
  if (!feedBodyTranslateOnOpenEnabled) return;
  if (hasAiTranslationContent || immersiveTranslation.session) return;
  void immersiveTranslation.requestTranslation({ force: false, autoView: true });
}, [article?.id, feedBodyTranslateOnOpenEnabled, hasAiTranslationContent, immersiveTranslation]);
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/articles/ArticleView.aiTranslate.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/ArticleView.aiTranslate.test.tsx
git commit -m "feat(article-view): 支持打开文章自动触发正文翻译"
```

---

### Task 12: Reader Snapshot + ArticleList 支持标题译文优先展示

**Files:**

- Modify: `src/server/services/readerSnapshotService.ts`
- Modify: `src/app/api/reader/snapshot/route.test.ts`
- Modify: `src/lib/apiClient.ts`
- Modify: `src/lib/apiClient.test.ts`
- Modify: `src/features/articles/ArticleList.tsx`
- Modify: `src/features/articles/ArticleList.test.tsx`
- Test: `src/features/articles/ArticleList.test.tsx`

**Step 1: Write the failing test**

```tsx
it('ArticleList uses titleZh when available and falls back to title', () => {
  // prepare snapshot item with titleZh and assert rendered title is translated one
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/articles/ArticleList.test.tsx -t "titleZh"`  
Expected: FAIL（snapshot 未透出 `titleZh`）

**Step 3: Write minimal implementation**

```sql
select
  title,
  title_original as "titleOriginal",
  title_zh as "titleZh",
  ...
from articles
```

```ts
export function mapSnapshotArticleItem(dto: ReaderSnapshotDto['articles']['items'][number]): Article {
  const effectiveTitle = dto.titleZh?.trim() ? dto.titleZh : dto.title;
  return {
    // ...
    title: effectiveTitle,
    titleOriginal: dto.titleOriginal ?? dto.title,
    titleZh: dto.titleZh ?? undefined,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/app/api/reader/snapshot/route.test.ts src/lib/apiClient.test.ts src/features/articles/ArticleList.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add src/server/services/readerSnapshotService.ts src/app/api/reader/snapshot/route.test.ts src/lib/apiClient.ts src/lib/apiClient.test.ts src/features/articles/ArticleList.tsx src/features/articles/ArticleList.test.tsx
git commit -m "feat(article-list): 列表标题优先展示自动翻译结果"
```

---

### Task 13: 全量回归验证与总结文档

**Files:**

- Modify: `docs/summaries/2026-03-05-<new-summary>.md`（新增本次总结）
- Test: `src/features/articles/ArticleView.aiSummary.test.tsx`

**Step 1: Run focused unit suites**

Run:

```bash
pnpm run test:unit -- \
  src/app/api/articles/routes.test.ts \
  src/app/api/feeds/routes.test.ts \
  src/server/repositories/feedsRepo.aiTriggerFlags.test.ts \
  src/features/feeds/FeedDialog.translationFlags.test.tsx \
  src/features/articles/ArticleView.aiSummary.test.tsx \
  src/features/articles/ArticleView.aiTranslate.test.tsx \
  src/features/articles/ArticleList.test.tsx \
  src/lib/apiClient.test.ts
```

Expected: PASS

**Step 2: Run lint**

Run: `pnpm run lint`  
Expected: PASS

**Step 3: Write summary doc**

```md
# 订阅源级摘要翻译触发策略重构总结
- 症状
- 根因
- 修复
- 验证证据
- 后续建议
```

**Step 4: Commit**

```bash
git add docs/summaries
git commit -m "docs(summary): 记录摘要翻译触发策略重构验证结论"
```

---

## Final Verification Checklist

- [ ] 新 migration 可执行，字段默认值正确。
- [ ] feed create/edit/snapshot 全链路透出 5 个触发配置。
- [ ] `AI摘要`/`翻译` 按钮始终可点，手动请求携带 `force=true`。
- [ ] `翻译` 按钮不再切回原文，再点再次触发翻译。
- [ ] `bodyTranslateOnOpenEnabled` 自动翻译后自动进入翻译视图。
- [ ] 列表标题在存在 `titleZh` 时优先展示译文。
- [ ] 关键回归测试通过，未破坏历史问题修复点。
