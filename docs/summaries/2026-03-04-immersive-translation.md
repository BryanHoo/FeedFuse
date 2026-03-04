# 沉浸式逐段翻译实施总结

**Date:** 2026-03-04  
**Status:** resolved  
**Area:** ai-translate session / segment persistence / SSE / article-view immersive rendering  
**Related:** `docs/plans/2026-03-04-immersive-translation-implementation-plan.md`

## 1. 变更范围

- 数据模型
  - 新增 `article_translation_sessions` / `article_translation_segments` / `article_translation_events` 三层表结构。
  - 会话维度记录 `running/succeeded/partial_failed/failed`，段落维度记录 `pending/running/succeeded/failed`。
- 服务与仓储
  - 新增主内容区段落抽取与 `sourceHtmlHash`。
  - 新增 session/segment/event 的 repository 读写接口，支持事件回放查询。
- API
  - `POST /api/articles/:id/ai-translate`：创建/恢复会话，支持 `sessionId` 幂等返回。
  - `GET /api/articles/:id/ai-translate`：返回会话快照 + 段落状态。
  - `POST /api/articles/:id/ai-translate/segments/:index/retry`：失败段单段重试。
  - `GET /api/articles/:id/ai-translate/stream`：SSE 增量事件，支持 `Last-Event-ID` 补偿。
- worker
  - 新增沉浸式翻译 worker，按段并发翻译（默认并发 3）。
  - 单段失败不阻断整篇，最终状态可落到 `partial_failed`。
  - 支持重试 payload：`{ articleId, sessionId, segmentIndex }`。
- 前端
  - `apiClient` 新增 snapshot/retry/stream 客户端能力。
  - 新增 `useImmersiveTranslation` hook：接管 create/resume + snapshot + SSE + retry。
  - `ArticleView` 在翻译模式渲染 `ff-bilingual-block`（上原文下译文），并按 `segmentIndex` 稳定排序。

## 2. 契约与兼容结论

- 既有 reason 语义保持兼容：
  - `missing_api_key`
  - `fulltext_pending`
  - `body_translate_disabled`
  - `already_translated`
  - `already_enqueued`
- 新能力未破坏旧接口行为：
  - 新增 `snapshot/stream/retry` 后，`POST /ai-translate` 的判断顺序与返回 reason 未回归。

## 3. 成功指标（结果与口径）

- 指标 A：首段出现耗时（点击“翻译”到首个 `segment.succeeded` 可见）
  - 结果：路径已打通（POST -> snapshot -> SSE -> UI 增量渲染）。
  - 口径：建议线上埋点记录 P50/P95（客户端点击时间戳 + 首段渲染完成时间戳）。
- 指标 B：失败段重试成功率
  - 结果：路径已打通（失败段展示“重试该段” -> 调用 retry API -> 段状态刷新）。
  - 口径：建议线上按 `retry requests / retry succeeded` 统计成功率。

> 说明：当前仓库验证以单元/契约测试为主，尚未落地线上指标采样与聚合看板。

## 4. 已知限制

- 仅翻译主内容区段落，不支持整页翻译。
- 段落范围固定为：`p`、`h1-h6`、`li`、`blockquote`。
- SSE 当前为轮询型回放推送（基于事件表），非数据库原生推送。

## 5. 验证证据

- 路由契约：
  - `pnpm run test:unit -- src/app/api/articles/routes.test.ts -t "ai-translate stream|reason semantics"`
- SSE route：
  - `pnpm run test:unit -- src/app/api/articles/[id]/ai-translate/stream/route.test.ts`
- worker：
  - `pnpm run test:unit -- src/worker/immersiveTranslateWorker.test.ts src/worker/articleTaskStatus.test.ts`
- 前端：
  - `pnpm run test:unit -- src/features/articles/ArticleView.aiTranslate.test.tsx src/features/articles/useImmersiveTranslation.test.ts`

## 6. 后续建议

- 增加线上埋点与告警：
  - 首段出现耗时超阈值告警。
  - 失败段重试成功率低于阈值告警。
- 评估将 stream 从定时轮询升级为更实时的事件分发机制（在保持回放语义前提下）。
