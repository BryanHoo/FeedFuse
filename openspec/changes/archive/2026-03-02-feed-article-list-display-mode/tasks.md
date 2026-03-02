## 1. Persistence Layer (`feeds` schema + repository)

### Task 1: Add `article_list_display_mode` storage

**Skills:** `@workflow-test-driven-development` `@workflow-verification-before-completion`  
**Files:**

- Create: `src/server/db/migrations/0008_feed_article_list_display_mode.sql`
- Create: `src/server/db/migrations/feedArticleListDisplayModeMigration.test.ts`
- Create: `src/server/repositories/feedsRepo.articleListDisplayMode.test.ts`
- Modify: `src/server/repositories/feedsRepo.ts`

- [x] 1.1 写失败测试：新增 migration 测试与 repository SQL 断言测试

```ts
expect(sql).toContain('article_list_display_mode');
expect(sql).toContain('articleListDisplayMode');
```

- [x] 1.2 运行失败测试确认红灯

Run: `pnpm run test:unit -- src/server/db/migrations/feedArticleListDisplayModeMigration.test.ts src/server/repositories/feedsRepo.articleListDisplayMode.test.ts`  
Expected: FAIL，提示 migration 文件缺失或 SQL 未包含 `article_list_display_mode`

- [x] 1.3 最小实现：新增 migration，并在 `listFeeds/createFeed/updateFeed` 读写新字段

```sql
alter table feeds
  add column article_list_display_mode text not null default 'card',
  add constraint feeds_article_list_display_mode_check
    check (article_list_display_mode in ('card', 'list'));
```

- [x] 1.4 重新运行测试确认绿灯

Run: `pnpm run test:unit -- src/server/db/migrations/feedArticleListDisplayModeMigration.test.ts src/server/repositories/feedsRepo.articleListDisplayMode.test.ts`  
Expected: PASS

- [x] 1.5 提交本任务

```bash
git add src/server/db/migrations/0008_feed_article_list_display_mode.sql src/server/db/migrations/feedArticleListDisplayModeMigration.test.ts src/server/repositories/feedsRepo.ts src/server/repositories/feedsRepo.articleListDisplayMode.test.ts
git commit -m "feat(feeds): persist article list display mode"
```

## 2. API Contract and Snapshot DTO

### Task 2: Expose `articleListDisplayMode` to frontend

**Skills:** `@workflow-test-driven-development`  
**Files:**

- Modify: `src/app/api/feeds/[id]/route.ts`
- Modify: `src/app/api/feeds/routes.test.ts`
- Modify: `src/server/services/readerSnapshotService.ts`
- Modify: `src/app/api/reader/snapshot/route.test.ts`
- Modify: `src/lib/apiClient.ts`
- Modify: `src/types/index.ts`

- [x] 2.1 写失败测试：`PATCH /api/feeds/[id]` 接收并转发 `articleListDisplayMode`

```ts
body: JSON.stringify({ articleListDisplayMode: 'list' });
expect(updateFeedMock).toHaveBeenCalledWith(
  pool,
  feedId,
  expect.objectContaining({ articleListDisplayMode: 'list' }),
);
```

- [x] 2.2 写失败测试：snapshot feeds 数据包含 `articleListDisplayMode`

```ts
expect(json.data.feeds[0].articleListDisplayMode).toBe('card');
```

- [x] 2.3 运行失败测试确认红灯

Run: `pnpm run test:unit -- src/app/api/feeds/routes.test.ts src/app/api/reader/snapshot/route.test.ts`  
Expected: FAIL，字段校验/返回值断言不满足

- [x] 2.4 最小实现：扩展 zod schema、ReaderSnapshotFeed、`mapFeedDto`、`Feed` 类型与 `patchFeed` 输入

```ts
articleListDisplayMode: z.enum(['card', 'list']).optional()
```

- [x] 2.5 重新运行测试确认绿灯

Run: `pnpm run test:unit -- src/app/api/feeds/routes.test.ts src/app/api/reader/snapshot/route.test.ts`  
Expected: PASS

- [x] 2.6 提交本任务

```bash
git add src/app/api/feeds/[id]/route.ts src/app/api/feeds/routes.test.ts src/server/services/readerSnapshotService.ts src/app/api/reader/snapshot/route.test.ts src/lib/apiClient.ts src/types/index.ts
git commit -m "feat(api): expose feed articleListDisplayMode"
```

## 3. Store and Middle Column UI

### Task 3: Implement mode toggle and list rendering in `ArticleList`

**Skills:** `@workflow-test-driven-development`  
**Files:**

- Modify: `src/store/appStore.ts`
- Modify: `src/features/articles/ArticleList.tsx`
- Modify: `src/features/articles/ArticleList.test.tsx`

- [x] 3.1 写失败测试：feed 视图显示切换按钮，`all/unread/starred` 隐藏

```ts
expect(screen.getByRole('button', { name: 'toggle-display-mode' })).toBeInTheDocument();
```

- [x] 3.2 写失败测试：切换到 `list` 后渲染“左标题 + 右时间”且保留未读标记

```ts
expect(screen.getByTestId('article-list-row-art-1-title')).toBeInTheDocument();
expect(screen.getByTestId('article-list-row-art-1-time')).toBeInTheDocument();
expect(screen.getByTestId('article-list-row-art-1-unread-dot')).toBeInTheDocument();
```

- [x] 3.3 写失败测试：`patchFeed` 失败时回滚模式并提示错误

```ts
fetchMock.mockRejectedValueOnce(new Error('network'));
```

- [x] 3.4 运行失败测试确认红灯

Run: `pnpm run test:unit -- src/features/articles/ArticleList.test.tsx`  
Expected: FAIL，按钮/渲染/回滚断言失败

- [x] 3.5 最小实现：新增有效模式计算、切换按钮、`list` 渲染分支、失败回滚

```ts
const effectiveDisplayMode = isAggregateView ? 'card' : (feed?.articleListDisplayMode ?? 'card');
```

- [x] 3.6 重新运行测试确认绿灯

Run: `pnpm run test:unit -- src/features/articles/ArticleList.test.tsx`  
Expected: PASS

- [x] 3.7 提交本任务

```bash
git add src/store/appStore.ts src/features/articles/ArticleList.tsx src/features/articles/ArticleList.test.tsx
git commit -m "feat(reader): add feed-scoped card/list mode toggle"
```

## 4. End-to-End Verification and Hygiene

### Task 4: Run full verification before merge

**Skills:** `@workflow-verification-before-completion` `@workflow-requesting-code-review`  
**Files:**

- Modify (if needed after failures): related source/test files from Tasks 1-3

- [x] 4.1 运行关键增量测试集合

Run: `pnpm run test:unit -- src/server/db/migrations/feedArticleListDisplayModeMigration.test.ts src/server/repositories/feedsRepo.articleListDisplayMode.test.ts src/app/api/feeds/routes.test.ts src/app/api/reader/snapshot/route.test.ts src/features/articles/ArticleList.test.tsx`  
Expected: PASS

- [x] 4.2 运行完整单测

Run: `pnpm run test:unit`  
Expected: PASS

- [x] 4.3 运行 lint

Run: `pnpm run lint`  
Expected: PASS

- [x] 4.4 汇总验证证据并提交最终修正（如有）

```bash
git add -A
git commit -m "test: cover feed article list display mode end-to-end" # 仅在存在修正时执行
```
