# 简体中文正文跳过翻译实现总结

## 症状
- 已经是高置信度简体中文的文章正文，仍会进入正文翻译链路。
- 手动 `POST /api/articles/:id/ai-translate`、抓取后自动翻译、打开文章自动翻译三条入口的跳过语义不一致。
- 阅读页在这类文章上仍显示“翻译”按钮，用户可以触发无意义请求。

## 根因
- 之前缺少统一的正文翻译资格判定，翻译入口主要依赖开关、已有产物和全文状态，无法识别“正文本来就是简体中文”。
- 抓取链路没有持久化显式 `source_language` 元数据，导致服务端只能基于各入口各自上下文做零散判断。
- 单篇文章接口与 reader snapshot 没有把 eligibility 透出给前端，文章页无法稳定隐藏按钮或阻止 on-open 自动触发。

## 修复
- 数据与抓取链路
  - 新增迁移 `src/server/db/migrations/0017_article_source_language.sql`，为 `articles` 增加 `source_language` 字段。
  - `src/server/rss/parseFeed.ts` 解析 RSS/Atom 的 `language` 元数据。
  - `src/server/repositories/articlesRepo.ts` 与 `src/worker/index.ts` 打通 `sourceLanguage` 入库映射。
- 统一 eligibility helper
  - 新增 `src/server/ai/articleTranslationEligibility.ts`。
  - 优先使用显式 `source_language` 元数据；缺失时回退到严格启发式正文检测。
  - 输出统一的 `bodyTranslationEligible`、`bodyTranslationBlockedReason` 与判定来源。
- API / snapshot / 前端消费
  - `src/server/services/readerSnapshotService.ts` 与 `src/app/api/articles/[id]/route.ts` 统一透出 eligibility 字段。
  - `src/lib/apiClient.ts`、`src/types/index.ts`、`src/store/appStore.ts` 消费并保留 `bodyTranslationEligible` / `bodyTranslationBlockedReason`。
- 三个正文翻译入口统一跳过
  - `src/app/api/articles/[id]/ai-translate/route.ts` 在手动翻译入口返回 `{ enqueued: false, reason: 'source_is_simplified_chinese' }`。
  - `src/worker/autoAiTriggers.ts` 在 on-fetch 自动翻译入口复用 eligibility，直接跳过不入队。
  - `src/features/articles/ArticleView.tsx` 在 eligibility 为 `false` 时隐藏“翻译”按钮，并阻止 on-open 自动翻译。
  - `src/features/articles/useImmersiveTranslation.ts` 兼容新的 `source_is_simplified_chinese` reason，避免前端 loading 卡住。

## 验证清单
- `articleTranslationEligibility` 单测通过
- `Article GET / ai-translate route` 契约通过
- `autoAiTriggers` 回归通过
- `ArticleView` 翻译按钮与 on-open 行为回归通过

## 验证证据
- 任务级验证
  - `pnpm run test:unit -- src/server/db/migrations/articleSourceLanguageMigration.test.ts src/server/rss/parseFeed.test.ts`
  - `pnpm run test:unit -- src/server/ai/articleTranslationEligibility.test.ts`
  - `pnpm run test:unit -- src/app/api/articles/routes.test.ts src/lib/apiClient.test.ts src/store/appStore.test.ts`
  - `pnpm run test:unit -- src/app/api/articles/routes.test.ts src/worker/autoAiTriggers.test.ts`
  - `pnpm run test:unit -- src/features/articles/ArticleView.aiTranslate.test.tsx src/features/articles/useImmersiveTranslation.test.ts`
- 最终聚焦回归
  - `pnpm run test:unit -- src/server/ai/articleTranslationEligibility.test.ts src/app/api/articles/routes.test.ts src/worker/autoAiTriggers.test.ts src/features/articles/ArticleView.aiTranslate.test.tsx src/features/articles/useImmersiveTranslation.test.ts src/lib/apiClient.test.ts src/store/appStore.test.ts src/server/rss/parseFeed.test.ts`
  - 结果：通过（本次运行输出为 `105 passed | 1 skipped` test files，`405 passed | 4 skipped` tests）。
- 代码质量
  - `pnpm run lint`
  - 结果：通过。

## 相关文档
- 实施计划：`docs/plans/2026-03-07-simplified-chinese-translation-eligibility-implementation-plan.md`
- 相关总结：`docs/summaries/2026-03-05-ai-summary-translation-trigger-strategy-refactor.md`
- 相关总结：`docs/summaries/2026-03-04-immersive-translation.md`

## 当前边界
- `source_language` 目前主要作为显式元数据入口；对历史文章或未提供语言元数据的源，仍由启发式检测兜底。
- 启发式故意偏保守，只在高置信度简体中文正文上返回 `source_is_simplified_chinese`，避免误伤繁体中文和日文。

## 后续建议
- 为 reader/UI 层补一条端到端用例，覆盖“简体中文正文文章打开时不显示翻译按钮且不自动触发翻译”。
- 如果未来引入更可靠的语言识别服务，可在 helper 内替换启发式实现，同时保持 eligibility 契约不变。
