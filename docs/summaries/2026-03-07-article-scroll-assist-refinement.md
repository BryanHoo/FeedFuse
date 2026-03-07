# Article Scroll Assist Refinement

**Date:** 2026-03-07
**Status:** resolved
**Area:** reader article scroll assist
**Related:** `src/features/articles/ArticleScrollAssist.tsx`

## Symptom

- 右栏右下角同时显示百分比和 `Top`，信息重复。
- 合并为单个控件后，进度环一度压住文字。
- 改成贴边后，进度 `svg` 又被按钮样式压成 `16px`，实际跑到左上角。
- 默认配色偏淡，百分比和圆环不够清晰。

## Impact

- 阅读页右侧辅助控件视觉层级不稳定。
- 进度反馈和返回顶部操作可读性下降。

## Root Cause

- 滚动辅助控件最初拆成两个元素，信息层级重复。
- 之后把进度环直接放进通用 `Button` 内部，受到 `src/components/ui/button.tsx` 里的 `[&_svg]:size-4` 影响，导致 ring `svg` 被强制缩成 `16px`。
- 文字和圆环都使用较弱的前景色透明度，导致实际界面对比度不足。

## Fix

- 合并百分比与 `Top` 为单一圆形按钮，默认显示百分比，到底显示 `Top`，点击始终回到顶部。
- 将进度环改为按钮内独立的绝对定位层，避免被通用按钮的子 `svg` 规则影响。
- 提升 ring 轨道、进度色和彩色文案对比度，并补充针对性测试。
- Files:
  - `src/features/articles/ArticleScrollAssist.tsx`
  - `src/features/articles/ArticleScrollAssist.test.tsx`

## Verification (Evidence)

- Run: `pnpm test:unit`
  - Result: `112 passed | 1 skipped` test files, `429 passed | 4 skipped` tests.
- Run: `pnpm exec vitest run src/features/articles/ArticleScrollAssist.test.tsx src/features/articles/ArticleView.outline.test.tsx`
  - Result: `2 passed` test files, `8 passed` tests.
- Run: `pnpm exec eslint src/features/articles/ArticleScrollAssist.tsx src/features/articles/ArticleScrollAssist.test.tsx`
  - Result: pass.

## Prevention / Follow-ups

- 已增加 `ArticleScrollAssist` 回归测试，覆盖单按钮、ring layer 和颜色类名。
- 后续若要在通用 `Button` 中嵌复杂 `svg`，需要先检查 `[&_svg]` 类规则是否会覆盖尺寸。

## Notes

- 当前分支为 `main`，本次改动会直接提交并推送到 `origin/main`。
