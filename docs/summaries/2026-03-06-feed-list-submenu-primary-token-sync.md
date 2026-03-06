# FeedList 二级分类子菜单主色同步总结

**Date:** 2026-03-06
**Status:** resolved
**Area:** `feeds` / `ui`
**Related:** `39df05d feat(feeds): 统一右键菜单主题卡片风格`

## Symptom

- RSS 源右键菜单里的 `移动到分类` 二级子菜单中，当前分类的 icon 和 `当前` hint 仍显示为偏绿色状态色。
- 该子菜单放在已主题化的 `ContextMenuSubContent` 内时，会和系统其余 `primary` 态视觉不一致。

## Impact

- 当前态视觉语言与侧栏选中态、按钮和其他 `primary` token 不统一。
- 浅色/深色主题下都会出现局部强调色漂移，降低菜单整体一致性。

## Root Cause

- `src/features/feeds/FeedList.tsx` 在二级分类子菜单里为“当前分类”分支硬编码了 `text-emerald-300` 和 `border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200`，没有跟随项目现有的 `primary` 设计 token。

## Fix

- 为 `FeedList.test.tsx` 增加回归断言，要求当前分类 icon 和 `当前` hint 使用系统 `primary` token，且不再包含 `emerald`。
- 将 `FeedList.tsx` 里二级分类子菜单当前态 icon/hint 的样式统一替换为 `text-primary` 与 `border-primary/20 bg-primary/10 text-primary`。
- Files:
  - `src/features/feeds/FeedList.tsx`
  - `src/features/feeds/FeedList.test.tsx`

## Verification (Evidence)

- Run: `pnpm exec vitest run src/features/feeds/FeedList.test.tsx -t "marks the current category inside move-to-category submenu|disables uncategorized target when feed is already uncategorized"`
  - Result: 先 FAIL（断言命中 `text-emerald-300`），修复后 PASS（2 个测试通过）
- Run: `pnpm exec vitest run src/features/feeds/FeedList.test.tsx`
  - Result: PASS，`Test Files 1 passed`，`Tests 25 passed`
- Run: `pnpm run lint`
  - Result: PASS（exit code 0）

## Prevention / Follow-ups

- 后续如果为菜单子项添加“当前态/选中态”装饰，优先复用 `primary`、`accent` 等主题 token，不要在业务层再次硬编码颜色名。
- 继续把视觉一致性的需求落到测试断言上，避免主题重构后出现局部颜色回退。

## Notes

- `FeedList.test.tsx` 全量测试仍会输出既有的 `ArticleView` `act(...)` warning，但这次改动没有引入新的失败。
