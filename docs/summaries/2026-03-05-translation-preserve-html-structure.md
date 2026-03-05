# 翻译模式保留原 HTML 结构修复总结

**Date:** 2026-03-05
**Status:** resolved
**Area:** article immersive translation rendering
**Related:** `docs/plans/2026-03-05-translation-preserve-html-structure-design.md`

## Symptom

- 症状：翻译后图片消失。

## Root Cause

- 根因：翻译模式通过段落列表重建页面，仅渲染可翻译段，导致原 HTML 中非段落节点（如 `img`）被丢弃。

## Fix

- 修复：翻译模式改为原 HTML 增强渲染，按 `segmentIndex` 在原节点后注入译文块。
- 新增 `immersiveRender` helper，统一处理 `succeeded / pending / failed` 状态。
- 失败段在注入 HTML 中携带 `data-action="retry-segment"` + `data-segment-index`，由 `ArticleView` 事件委托触发重试。
- 同步修复 `ArticleView` 测试断言以匹配新渲染结构，并修复事件委托中 `event.target` 非 `Element` 的健壮性问题。

## Files

- `src/features/articles/immersiveRender.ts`
- `src/features/articles/immersiveRender.test.ts`
- `src/features/articles/ArticleView.tsx`
- `src/features/articles/ArticleView.aiTranslate.test.tsx`

## Verification (Evidence)

- Run: `pnpm run test:unit -- src/features/articles/immersiveRender.test.ts src/features/articles/ArticleView.aiTranslate.test.tsx src/features/articles/useImmersiveTranslation.test.ts`
  - Result: PASS (`92 passed | 1 skipped` test files, `309 passed | 4 skipped` tests)
- Run: `pnpm run lint`
  - Result: PASS（无 lint error）

## Notes

- 设计文档：`docs/plans/2026-03-05-translation-preserve-html-structure-design.md`
- 历史总结：`docs/summaries/2026-03-04-immersive-translation.md`
- 历史总结：`docs/summaries/2026-03-04-async-tasks-refactor.md`
