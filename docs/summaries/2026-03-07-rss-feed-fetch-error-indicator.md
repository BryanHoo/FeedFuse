# RSS 源拉取异常指示链路

**Date:** 2026-03-07
**Status:** resolved
**Area:** `feeds` / `worker` / `reader snapshot` / `ui`
**Related:** `docs/plans/2026-03-07-rss-feed-fetch-error-indicator-design.md`, `docs/plans/2026-03-07-rss-feed-fetch-error-indicator-implementation-plan.md`, `aabe560`, `60223c0`, `4c1c2c2`, `8b8f9e0`, `5312094`

## Symptom

- RSS 源后台拉取失败后，左栏对应 feed 没有稳定异常态，也看不到可读错误信息。
- worker 会把原始错误字符串直接写进 `feeds.last_fetch_error`，文案不稳定且不适合直接暴露到 UI。
- 即使后端已记录抓取失败，`reader snapshot -> apiClient -> store -> FeedList` 链路也没有把状态一路透出到前端模型。

## Impact

- 用户无法在左栏快速识别哪个 RSS 源最近更新失败。
- 原始异常如果直接上屏，既不稳定，也可能泄露不适合展示的底层信息。
- 成功抓取后若不清理旧错误，左栏会长期停留在错误态，造成误导。

## Root Cause

- 抓取错误的持久化字段早已存在于 `feeds` 表，但缺少统一的错误归一化层，也缺少从 repository 到 snapshot、再到客户端 `Feed` 模型的完整映射。
- `FeedList` 只消费基础 feed 信息，没有根据 `fetchError` 派生异常样式或 tooltip 交互。

## Fix

- 新增 `src/server/tasks/feedFetchErrorMapping.ts`，把 `Unsafe URL`、HTTP 错误、timeout、解析失败映射为稳定的短中文文案。
- 更新 `src/worker/index.ts`，统一写入归一化后的抓取错误，并保持成功抓取时覆盖清空旧错误。
- 更新 `src/server/repositories/feedsRepo.ts` 与 `src/server/services/readerSnapshotService.ts`，让 `lastFetchStatus` / `lastFetchError` 从数据库透出到 snapshot。
- 扩展 `src/types/index.ts` 与 `src/lib/apiClient.ts`，让客户端 `Feed` 必有 `fetchStatus` / `fetchError`，并对 create/edit 返回值缺失字段兼容回填 `null`。
- 更新 `src/features/feeds/FeedList.tsx`，为 errored feed 增加错误 icon、红色异常态和 tooltip；成功清空错误后恢复正常样式。
- 补齐从 worker、repository、snapshot、apiClient、store 到 FeedList 的回归测试。
- Files:
  - `src/server/tasks/feedFetchErrorMapping.ts`
  - `src/worker/index.ts`
  - `src/server/repositories/feedsRepo.ts`
  - `src/server/services/readerSnapshotService.ts`
  - `src/lib/apiClient.ts`
  - `src/types/index.ts`
  - `src/features/feeds/FeedList.tsx`
  - `src/features/feeds/FeedList.test.tsx`

## Verification (Evidence)

- Run: `pnpm run test:unit -- src/server/tasks/feedFetchErrorMapping.test.ts`
  - Result: pass
- Run: `pnpm run test:unit -- src/server/repositories/feedsRepo.fetchResult.test.ts src/server/services/readerSnapshotService.feedFetchState.test.ts`
  - Result: pass
- Run: `pnpm run test:unit -- src/lib/apiClient.test.ts src/store/appStore.test.ts`
  - Result: pass
- Run: `pnpm run test:unit -- src/server/tasks/feedFetchErrorMapping.test.ts src/server/repositories/feedsRepo.fetchResult.test.ts src/server/services/readerSnapshotService.feedFetchState.test.ts src/lib/apiClient.test.ts src/store/appStore.test.ts`
  - Result: pass，`Test Files 102 passed | 1 skipped`，`Tests 388 passed | 4 skipped`
- Run: `pnpm exec vitest run src/features/feeds/FeedList.test.tsx`
  - Result: pass，`Test Files 1 passed`，`Tests 27 passed`
- Run: `pnpm run lint`
  - Result: pass（exit code 0）

## Prevention / Follow-ups

- 后续新增 feed 状态字段时，优先沿用 `snapshot -> mapFeedDto() -> Feed` 单一路径，不要在 `FeedList` 本地维护第二套事实来源。
- 抓取类错误继续通过统一映射层输出，不要把原始异常、堆栈或底层响应直接暴露到 UI。
- `FeedList.test.tsx` 的 `snapshotResponseFromStore()` 需要继续和 snapshot DTO 对齐，避免测试夹具悄悄丢字段。

## Notes

- `Tooltip` 在本项目必须包在 `TooltipProvider` 内，否则 Radix 会在测试和运行时直接抛错。
- 在 jsdom 下，Radix tooltip 会生成重复的可访问文本节点；测试断言更适合用 `findAllByText()` / `queryAllByText()`，不要假定只出现一个节点。
