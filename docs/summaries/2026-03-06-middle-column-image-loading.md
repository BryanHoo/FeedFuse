# 2026-03-06 中栏图片按视区队列加载

## Context

- Branch: `codex-middle-column-image-loading`
- Related plan: `docs/plans/2026-03-06-middle-column-image-loading-implementation-plan.md`

## Symptom

- `ArticleList` 会在挂载后为中栏所有候选图片立刻创建 `Image()`，首屏图片容易和远处卡片争抢请求。
- 在改成“按视区激活”后，图片状态清理逻辑会在“候选图增加但尚未预加载”时反复写入空 `Map`，导致相关测试卡住。

## Impact

- 中栏首屏图片出现更慢，滚动前就消耗网络请求槽位。
- 预加载逻辑更复杂后，列表切换和失败缓存容易留下旧状态或旧队列。

## Root Cause

- 原实现把图片候选集直接映射成全量预加载，没有引入视区激活和并发控制。
- 状态清理 effect 以候选集大小差异作为“有变化”条件；当新候选图出现但尚未进入加载态时，会持续把空 `Map` 当成新状态写回，形成无意义重渲染循环。

## Fix

- 添加 `IntersectionObserver`，让中栏图片只在可视区和下方 `50%` 预取区进入激活集合。
- 为激活图片增加两路并发预加载队列，完成或失败后继续泵送后续请求。
- 在候选集变化时同步裁剪图片状态、激活 key、队列和 in-flight 集合。
- 只在确实移除旧状态时更新 `previewImageStatuses`，避免因新增候选图触发空 `Map` 循环写入。
- 补充 observer 激活、并发上限、失败缓存、列表切换清理和旧 in-flight 清理的回归测试。

## Files

- `src/features/articles/ArticleList.tsx`
- `src/features/articles/ArticleList.test.tsx`

## Verification

- Run: `pnpm exec vitest run src/features/articles/ArticleList.test.tsx --project=jsdom --no-file-parallelism --reporter=verbose`
  - Result: `Test Files  1 passed (1)` / `Tests  31 passed (31)`
- Run: `pnpm run test:unit`
  - Result: `Test Files  98 passed | 1 skipped (99)` / `Tests  366 passed | 4 skipped (370)`

## Prevention / Follow-ups

- 已添加针对 observer 激活、并发队列、失败缓存和列表切换清理的回归测试，防止未来重构再次退回到全量预加载。
- 后续如果继续扩展图片加载策略，优先复用现有激活集合与队列模型，不要重新引入“候选图出现即写入 loading 状态”的路径。
