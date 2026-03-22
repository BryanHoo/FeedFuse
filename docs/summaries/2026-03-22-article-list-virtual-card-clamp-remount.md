---
id: 2026-03-22-article-list-virtual-card-clamp-remount
date: 2026-03-22
area: article-list-virtualization
kind: debugging
symptoms:
  - 中栏有图文章滚动翻页后再滚回，标题和摘要都占两行导致文字截断
  - 预期应保持标题两行则摘要一行，标题一行则摘要两行
keywords:
  - ArticleList
  - preview image
  - virtualized remount
  - wrapped title
  - summary clamp
  - middle column
  - pagination
  - scroll back
files:
  - src/features/articles/ArticleList.tsx
  - src/features/articles/ArticleList.test.tsx
decision: 保留仍在过滤结果中的离屏卡片标题换行测量结果，并在 remount 时避免用不可可靠的高度测量清掉 clamp 状态。
related:
---

# Article List 虚拟卡片 remount 后摘要 clamp 丢失

## Symptom

- 中栏滚动到底部触发翻页后，再滚回顶部时，带预览图的文章卡片会出现标题两行、摘要也两行，导致文本被截断。
- 该问题只在卡片模式下明显，且更容易出现在已经因图片缩窄文本列宽而被测成“标题占两行”的文章上。

## Impact

- 中栏卡片信息密度被破坏，标题和摘要的行数规则不稳定。
- 用户滚动翻页后回看顶部内容时会看到同一篇文章布局前后不一致。

## Root Cause

- `ArticleList` 用 `wrappedCardTitleArticleIds` 记录哪些卡片标题占了两行，再据此把摘要切成一行或两行。
- 这个集合原先在每次重测时只根据“当前仍挂载的标题 DOM 节点”全量重建。
- 虚拟列表会卸载离屏卡片；当用户滚到下面翻页时，顶部有图卡片已经卸载，但 `filteredArticles` 因追加数据而变化，重测逻辑会把这些离屏卡片的 wrapped 状态清掉。
- 滚回顶部 remount 后，如果该帧 `clientHeight` 还不可靠，就会继续保留错误的默认状态，摘要回退成 `line-clamp-2`。

## Fix

- 更新标题测量逻辑：只覆盖当前能可靠测量到的卡片结果，不再用当前挂载节点去重建整张 wrapped 状态表。
- 对仍在 `filteredArticles` 中、但暂时因虚拟滚动未挂载的卡片，保留之前的 wrapped 测量结果。
- 忽略 `clientHeight <= 0` 的不可靠测量，避免 remount 早期把已知正确状态误删。
- 补充回归测试，覆盖“有图卡片先正确 clamp，滚出视口后翻页，再滚回仍保持 clamp 规则”的场景。

## Verification

- Run: `pnpm vitest src/features/articles/ArticleList.test.tsx`
  - Result: pass，`50 passed`，包含新回归测试 `preserves wrapped-title summary clamp after virtualized cards unmount during pagination`
- Run: `pnpm build`
  - Result: pass，Next.js 生产构建和 TypeScript 检查全部通过

## Prevention / Follow-ups

- 对任何依赖 DOM 测量的虚拟列表状态，都不要在离屏节点卸载时默认视为“未命中”。
- 如果后续继续引入图片、翻译标题或动态摘要高度变化，优先补“virtualized unmount + remount”回归测试，而不是只测首次渲染。

## Notes

- 这个问题表面上像是图片引起宽度变化，真正触发回归的是“图片导致标题 wrapped”与“虚拟列表卸载后状态重建”两条链路叠加。
