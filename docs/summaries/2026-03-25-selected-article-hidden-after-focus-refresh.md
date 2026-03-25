---
id: 2026-03-25-selected-article-hidden-after-focus-refresh
date: 2026-03-25
area: reader-snapshot
kind: debugging
symptoms:
  - 页面再次聚焦触发刷新后，中栏已选中文章会消失
  - 开启未读过滤时，已读的当前选中文章会被刷新隐藏
  - 中栏只剩一篇文章时，刷新后会突然出现空白
keywords:
  - reader
  - visibilitychange
  - loadSnapshot
  - showUnreadOnly
  - selectedArticleId
  - middle-column
  - focus-refresh
  - articleDetailCache
files:
  - src/app/(reader)/ReaderApp.tsx
  - src/store/appStore.ts
  - src/store/appStore.test.ts
  - src/features/articles/ArticleList.tsx
decision: 在可见视图刷新快照时，即使服务端快照省略了当前选中文章，也必须把该文章保留在当前 `articles` 列表中。
related:
  - 2026-03-23-reader-url-view-hydration-double-active
---

# Selected Article Hidden After Focus Refresh

## Symptom

- 页面从后台切回前台后，`ReaderApp` 的 `visibilitychange` 会触发 `loadSnapshot`
- 如果当前视图开启未读过滤，且右栏正在看一篇刚变成已读的文章，中栏这篇会在刷新后消失
- 当中栏只剩这一篇时，用户看到的是中栏突然空白，但 `selectedArticleId` 其实还留在 store 里

## Impact

- 中栏和右栏的“当前选中项”语义分裂：store 仍保留选中状态，但列表不再渲染对应条目
- 用户会误以为当前文章被取消选择，或误判为刷新把文章删掉了
- 该问题不只发生在页面重新聚焦，任何会触发当前视图 `loadSnapshot` 的刷新路径都可能复现

## Root Cause

- `ArticleList` 的未读过滤允许靠 `selectedArticleId` 和会话级 `sessionVisibleArticleIds` 暂时保留已读文章
- 但页面重新聚焦后，`ReaderApp` 会直接触发 `loadSnapshot`，而 `loadSnapshot` 会用服务端返回的 `snapshot.articles.items` 重建当前 `articles`
- 当服务端因为 `unreadOnly=true` 或分页边界没有返回当前选中文章时，`articles` 会直接失去这条记录
- 此时 `selectedArticleId` 虽然还在，`articleDetailCache` 里也可能还有正文，但中栏渲染只消费 `articles`，所以列表项仍然会消失
- `ArticleList` 在 `snapshotLoading` 完成后还会清空 `sessionVisibleArticleIds`，进一步放大了“刷新后无任何保留来源”的表现

## Fix

- 在 `src/store/appStore.ts` 增加 `preserveSelectedArticleInVisibleSnapshot`
- 当前视图刷新时，先从旧列表或 `articleDetailCache` 提取 `preservedSelectedArticle`
- 如果新快照里没有这篇当前选中文章，则在写回当前 `articles` 前把它补回列表
- 回归测试覆盖“未读过滤刷新省略已读选中文章”场景，并断言不需要额外重新请求该文章详情

## Verification

- Run: `pnpm test:unit src/store/appStore.test.ts -t "keeps selected article in the visible snapshot when unread-only refresh omits it"`
  - Result: pass，新增回归测试先红后绿，确认修复命中根因
- Run: `pnpm test:unit src/store/appStore.test.ts 'src/app/(reader)/ReaderApp.test.tsx'`
  - Result: pass，43 个测试通过，覆盖 `loadSnapshot` 与页面重新可见刷新链路
- Run: `pnpm build`
  - Result: pass，Next.js 生产构建成功

## Prevention / Follow-ups

- 任何 reader 刷新路径都不要假设“服务端当前页快照 === UI 当前必须可见的完整集合”
- 只要 UI 有“当前选中项必须保持可见”的约束，刷新合并层就必须显式保留该选中项，而不能把责任留给渲染层补救
- 后续如果调整 `unreadOnly`、分页或可见列表保留策略，优先检查 `loadSnapshot` 是否仍会在当前视图丢掉 `selectedArticleId` 对应条目

## Notes

- 这次根因容易被误判成 `ArticleList` 的过滤 bug，但真正触发丢失的是 `appStore.loadSnapshot` 的可见列表替换行为
- 诊断顺序最有效的是：先看 `visibilitychange -> loadSnapshot`，再看 `articles` 是否仍包含 `selectedArticleId`，最后再回到 `ArticleList` 的保留逻辑
