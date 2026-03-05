# 订阅源级摘要翻译触发策略重构总结

## 症状
- 摘要/翻译触发语义不一致：自动与手动路径缺少统一的可重跑策略。
- 文章页 `翻译` 按钮存在“翻译/原文”切换语义，无法表达“手动重跑翻译”意图。
- 打开文章时缺少“按订阅源配置自动触发正文翻译并自动进入翻译视图”的能力。
- Reader 列表虽然已有标题翻译字段，但快照链路未完整透出，导致 `titleZh` 无法稳定优先展示。

## 根因
- `feeds` 侧缺少覆盖“获取后/打开后”两阶段的摘要与正文翻译触发字段。
- `ai-summary`/`ai-translate` 路由仅支持“已有结果直接返回”分支，缺少 `force` 参数以区分自动与手动重跑。
- 前端 `apiClient` 与 `useImmersiveTranslation` 未把 `force` 作为统一输入向后端透传。
- `ArticleView` 的按钮行为以视图切换为主，不是任务触发语义；且未对接 `bodyTranslateOnOpenEnabled`。
- Snapshot SQL 与前端映射未打通 `titleZh/titleOriginal`，列表渲染无稳定“译文优先”输入。

## 修复
- 数据层与仓储层
  - 新增迁移 `0015_feed_ai_trigger_flags.sql`，引入：
    - `ai_summary_on_fetch_enabled`
    - `body_translate_on_fetch_enabled`
    - `body_translate_on_open_enabled`
  - 扩展 `feedsRepo` 读写与查询映射，打通上述字段。
- API 契约与路由
  - `POST /api/feeds` 与 `PATCH /api/feeds/:id` 支持新触发字段。
  - `POST /api/articles/:id/ai-summary` 与 `POST /api/articles/:id/ai-translate` 支持 `force` 参数。
- Worker 自动触发
  - 新文章入库后，按 feed 的 on-fetch 配置自动入队摘要与翻译任务。
  - 自动路径遵循“已有结果则不重复入队”。
- 前端触发语义统一
  - `apiClient.enqueueArticleAiSummary/enqueueArticleAiTranslate` 支持 `force` 请求体。
  - `useImmersiveTranslation.requestTranslation` 支持 `{ force, autoView }`。
  - `ArticleView` 中：
    - 手动 `AI摘要`/`翻译` 按钮统一走 `force=true`。
    - `翻译` 按钮文案固定为“翻译”，不再承担“切回原文”语义。
    - 新增 `bodyTranslateOnOpenEnabled` 自动触发 effect，使用 `force=false` 且自动进入翻译视图。
- 列表标题译文优先
  - `readerSnapshotService` 查询透出 `title_original/title_zh`。
  - `mapSnapshotArticleItem` 采用 `titleZh` 优先策略并保留 `titleOriginal/titleZh` 字段。
  - `ArticleList` 渲染层使用 `titleZh ?? title` 显示标题。

## 验证证据
- 关键任务级测试
  - `pnpm run test:unit -- src/lib/apiClient.test.ts src/features/articles/useImmersiveTranslation.test.ts`
  - `pnpm run test:unit -- src/features/articles/ArticleView.aiSummary.test.tsx src/features/articles/ArticleView.aiTranslate.test.tsx`
  - `pnpm run test:unit -- src/app/api/reader/snapshot/route.test.ts src/lib/apiClient.test.ts src/features/articles/ArticleList.test.tsx`
- 最终聚焦回归（计划清单）
  - `pnpm run test:unit -- src/app/api/articles/routes.test.ts src/app/api/feeds/routes.test.ts src/server/repositories/feedsRepo.aiTriggerFlags.test.ts src/features/feeds/FeedDialog.translationFlags.test.tsx src/features/articles/ArticleView.aiSummary.test.tsx src/features/articles/ArticleView.aiTranslate.test.tsx src/features/articles/ArticleList.test.tsx src/lib/apiClient.test.ts`
  - 结果：全部通过。
- 代码质量检查
  - `pnpm run lint`
  - 结果：通过（无阻断问题）。

## 后续建议
- 为 `ArticleView` 测试中的非 UUID 文章 id 建立统一测试工厂，减少噪音日志（`Invalid UUID`）与不必要的错误输出。
- 在 E2E 层补一条“订阅源配置 on-open 翻译 -> 打开文章自动进入翻译视图”的端到端用例，覆盖真实网络与状态切换。
- 后续可把“手动触发来源（button/auto）+ force”写入任务元数据，便于可观测性与重跑分析。
