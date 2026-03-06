# RSS 源右键菜单重设计

**Date:** 2026-03-06
**Status:** resolved
**Area:** `feeds` / `ui`
**Related:** `docs/plans/2026-03-06-rss-feed-context-menu-redesign-design.md`, `docs/plans/2026-03-06-rss-feed-context-menu-redesign-implementation-plan.md`

## Symptom

- RSS 源右键菜单虽然功能齐全，但仍然带有明显默认 `shadcn/ui + Radix` 菜单观感。
- 菜单项平铺，缺少基础编辑、分类归属、策略配置、危险操作之间的结构分层。
- `移动到分类` 子菜单里只有禁用态，没有更明确的“当前分类”状态提示。

## Impact

- 高频管理入口的质感与信息效率偏低。
- 用户需要额外停顿来辨认危险操作和当前位置。
- 右键菜单的可用性没有匹配阅读器侧栏的高频使用场景。

## Root Cause

- 共享 `src/components/ui/context-menu.tsx` 仍停留在默认样式，业务层 `FeedList` 只能在原始能力上平铺文案。
- 菜单缺少轻量的图标、标签、hint 结构组件，导致业务文件里很难做统一的信息节奏与状态表达。

## Fix

- 升级共享 `ContextMenu` 视觉系统，加入更强的浮层层级、深色玻璃感、精细分隔和更明确的 hover / focus 反馈。
- 为共享菜单新增轻量结构组件：`ContextMenuItemIcon`、`ContextMenuItemLabel`、`ContextMenuItemHint`。
- 在 `FeedList` 中重组 RSS 源菜单分区，并为编辑、移动分类、AI 摘要配置、翻译配置、启用停用、删除补上语义图标。
- 在 `移动到分类` 子菜单中为当前分类增加 `当前` 提示，同时保持可见但禁用的已有交互语义。
- 对 `删除` 增加危险操作样式变体，但不改变原有删除流程。
- Files:
  - `src/components/ui/context-menu.tsx`
  - `src/features/feeds/FeedList.tsx`
  - `src/features/feeds/FeedList.test.tsx`

## Verification (Evidence)

- Run: `pnpm run lint`
  - Result: pass（exit code 0）
- Run: `pnpm exec vitest run src/features/feeds/FeedList.test.tsx`
  - Result: pass，`Test Files 1 passed`，`Tests 22 passed`
- Run: `pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "marks the current category inside move-to-category submenu"`
  - Result: 先 FAIL（缺少 `当前` 文案），实现后 PASS，完成红绿循环

## Prevention / Follow-ups

- 保持右键菜单的视觉与结构能力继续沉淀在共享 `context-menu` 组件中，不要回退到业务层硬编码样式。
- 后续如果其它菜单复用该组件，可优先复用 `ContextMenuItemIcon` / `ContextMenuItemHint`，避免重复拼接结构。
- 如需浏览器级视觉验收，建议后续补一个稳定的 UI 预览入口；当前隔离 worktree 的 Next dev 预览存在 `GET / 404` 环境噪音。

## Notes

- 我尝试在隔离 worktree 上启动 `next dev` 做浏览器冒烟，但本地预览返回 `/_not-found`，因此没有把该预览结果作为本次通过依据。
- 现有真实运行中的 `9559` 实例可以打开菜单，但它不是本分支预览，不能作为最终视觉证据。
