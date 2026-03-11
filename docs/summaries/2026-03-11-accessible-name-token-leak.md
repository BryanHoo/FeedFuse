# 主操作按钮将内部 token 暴露给读屏

**Date:** 2026-03-11
**Status:** resolved
**Area:** accessibility / reader actions / shared sheet close button
**Related:** 无

## Symptom

- 可访问性审计指出多处主操作按钮的可访问名称是内部 token，而不是中文用户文案，例如：
  - `open-feeds`
  - `open-settings`
  - `add-feed`
  - `mark-all-as-read`
  - `close-settings`
- 中文屏幕阅读器会直接朗读这些实现名，导致主导航、关闭按钮和核心操作难以理解。

## Impact

- reader 主导航和设置关闭操作对中文读屏用户不友好，直接触发 WCAG 4.1.2 Name, Role, Value 风险。
- 同类问题容易在图标按钮上重复出现，因为视觉上能看到中文 `title` 或上下文文字，但读屏实际优先读取的是 `aria-label`。

## Root Cause

- 组件把测试名/实现 token 直接写进了 `aria-label` 或共享组件的 `closeLabel`，而不是写用户动作文案。
- 在图标按钮上，一旦存在 `aria-label`，它会覆盖 `title` 和周围可见中文；所以 `title="添加 RSS 源"` 并不能修正 `aria-label="add-feed"` 的读屏输出。
- 测试也长期用 `getByLabelText('open-settings')` 之类的内部 token 断言，进一步把错误的可访问名称固化成了“预期行为”。

## Fix

- 把 reader、文章列表、订阅源列表、设置抽屉里的主操作按钮可访问名称改成中文动作文案。
- 让 `SheetContent` 的关闭按钮默认回退到 `关闭`，并同步更新 `sr-only` 文案，避免共享组件继续泄漏英文 `Close`。
- 更新相关测试，改为用中文可访问名称断言，确保后续回归优先保护用户语义而不是实现 token。
- Files:
  - `src/features/reader/ReaderLayout.tsx`
  - `src/features/articles/ArticleList.tsx`
  - `src/features/feeds/FeedList.tsx`
  - `src/features/settings/SettingsCenterDrawer.tsx`
  - `src/components/ui/sheet.tsx`
  - `src/app/(reader)/ReaderApp.test.tsx`
  - `src/features/feeds/AddFeedDialog.test.tsx`
  - `src/features/reader/ReaderLayout.test.tsx`
  - `src/features/settings/SettingsCenterModal.test.tsx`
  - `src/features/articles/ArticleList.test.tsx`

## Verification (Evidence)

- Run: `pnpm exec vitest run src/app/'(reader)'/ReaderApp.test.tsx src/features/feeds/AddFeedDialog.test.tsx src/features/reader/ReaderLayout.test.tsx src/features/settings/SettingsCenterModal.test.tsx src/features/articles/ArticleList.test.tsx`
  - Result: PASS，5 files / 87 tests passed

## Prevention / Follow-ups

- 以后不要把测试名、data key、内部 action id 直接用作 `aria-label` 或 `closeLabel`；这些属性必须写用户会听到的文案。
- 图标按钮如果已经设置了 `aria-label`，就不要假设 `title` 或旁边的中文标题能帮读屏“自动纠正”名称。
- 相关测试应优先断言用户语义名称，而不是实现 token。
- 仍有同类模式待审计：`DialogContent closeLabel="close-*"` 还存在于 `src/features/feeds/FeedFulltextPolicyDialog.tsx`、`src/features/feeds/FeedTranslationPolicyDialog.tsx`、`src/features/feeds/RenameCategoryDialog.tsx`、`src/features/feeds/FeedSummaryPolicyDialog.tsx`、`src/features/feeds/FeedKeywordFilterDialog.tsx`。

## Notes

- 这次修复的可复用结论不是“把英文改成中文”本身，而是：可访问名称来源于 ARIA，不来源于开发者心里的视觉语义。共享组件默认值和测试断言如果使用内部 token，会把问题系统化地复制到更多按钮上。
