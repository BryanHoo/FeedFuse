# RSS 源右键移动分类实现总结

## 症状

- `FeedList` 的 RSS 源右键菜单只能编辑、切换策略和删除，不能直接把订阅源移动到已有分类或 `未分类`。
- 用户如果只想调整单个订阅源的归属，必须走编辑弹窗，路径长且会打断当前阅读上下文。
- 这类移动如果绕过现有 `updateFeed -> loadSnapshot` 链路，容易再次出现左栏分组和快照状态不一致的问题。

## 根因

- 现有 `FeedList` 已经具备 Radix `ContextMenuSub` 能力，但 RSS 源菜单没有暴露分类目标列表。
- 订阅分类调整依赖 `updateFeed` 的现有快照同步语义，之前没有一个轻量 UI 入口复用这条链路。
- 测试里的 `PATCH /api/feeds/feed-1` mock 把显式的 `categoryId: null` 错误地当成“未传值”，会掩盖移回 `未分类` 的真实回归。

## 修复

- 在 `FeedList` 的 RSS 源右键菜单中新增 `移动到分类` 子菜单，按 `categoryMaster` 顺序渲染普通分类，并追加 `未分类`。
- 新增 `moveFeedToCategory` 处理器，统一走 `updateFeed(feed.id, { categoryId })`，成功时提示 `已移动到「分类名」` 或 `已移动到「未分类」`，失败时复用 `mapApiErrorToUserMessage(error, 'update-feed')`。
- 当前所属分类和当前已在 `未分类` 的目标项保持可见但禁用，避免重复提交。
- `FeedList.test.tsx` 新增子菜单结构、移动到普通分类、移动到 `未分类`、未分类禁用态的回归用例，并复用现有 snapshot mock。
- 修正测试 mock 对 `categoryId: null` 的处理，确保显式移回 `未分类` 时不会被错误回退到旧分类。
- Files:
  - `src/features/feeds/FeedList.tsx`
  - `src/features/feeds/FeedList.test.tsx`
  - `docs/plans/2026-03-06-rss-feed-context-move-category-implementation-plan.md`

## 验证命令与结果

- `pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "uncategorized"`
  - 结果：通过
- `pnpm run test:unit -- src/features/feeds/FeedList.test.tsx`
  - 结果：通过，`FeedList.test.tsx (21 tests)` 全部通过
- `pnpm run lint`
  - 结果：通过（exit code 0）
- `pnpm run test:unit`
  - 结果：通过，`Test Files 98 passed | 1 skipped (99)`，`Tests 357 passed | 4 skipped (361)`

## 相关提交

- 计划文档：`docs/plans/2026-03-06-rss-feed-context-move-category-implementation-plan.md`
- `600b3c8 feat(feeds): 增加右键菜单分类移动入口`
- `4395314 feat(feeds): 支持RSS源右键移动到现有分类`
- `c5c2f4a test(feeds): 覆盖右键移动未分类回归`

## 后续建议

- 后续如果要把“移动到分类”扩展到批量操作或拖拽排序，仍应复用 `updateFeed -> loadSnapshot`，不要在 `FeedList` 本地手工改分组。
- `FeedList.test.tsx` 的 `PATCH /api/feeds/feed-1` mock 现在已经覆盖 `categoryId: null` 语义，后续新增分类回归时应继续复用，避免再把空值当成未传参数。
