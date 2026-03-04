# 设计文档：沉浸式逐段翻译（主内容区 + SSE + 段落持久化）

日期：2026-03-04  
状态：已评审通过（待实现）  
范围：ArticleView / ai_translate / worker / SSE

## 1. 背景与问题

当前正文翻译链路是：

- `POST /api/articles/:id/ai-translate` 入队 `JOB_AI_TRANSLATE`
- worker 侧批量翻译所有可翻译段落后，一次性写回 `aiTranslationBilingualHtml`
- 前端只在任务完成后刷新并整体展示

现有体验问题：

- 长文等待时间长，用户在较长时间内看不到任何翻译结果
- 双语渲染不可增量，无法形成“边读边看译文”的沉浸式节奏
- 一旦中断（切文章/刷新），无法在段落粒度恢复

## 2. 相关已知经验与约束

已知经验（来自既有总结）：

- `docs/summaries/2026-03-04-async-tasks-refactor.md`
  - 任务状态应走轻量接口，不应轮询大 payload
  - 失败信息需要持久化并可重试
- `docs/summaries/2026-03-04-pg-boss-usage-optimization.md`
  - 队列契约与 worker 注册已统一，AI 任务保留手动重试语义
  - 需要保留可观测性与幂等入队语义

外部实现原则（沉浸式翻译类产品通用实践）：

- 优先主内容区，不做默认全页翻译
- 以段落作为最小翻译单元，译文跟随原文块展示
- 支持动态/长任务的流式进度回传与断线恢复

## 3. 目标与非目标

### 3.1 目标

- 只翻译主内容区（沿用现有 `contentFullHtml ?? contentHtml` + sanitize）
- 段落粒度翻译：`p + h1-h6 + li + blockquote`
- 每段完成即持久化并可即时返回给前端
- 前端渲染为“上原文、下译文”，逐段出现
- 后端允许并发翻译段落，前端按文档顺序稳定展示
- 切换文章后返回可自动恢复进度
- 段落失败不终止整篇，支持单段重试
- 保留“翻译 / 原文”切换交互

### 3.2 非目标

- 不提供“整页翻译”开关
- 不引入 Readability 主内容提取（当前阶段不增加新提取器）
- 不改动 AI prompt 的核心语义（仍以简体中文翻译为目标）
- 不引入 WebSocket（使用 SSE）

## 4. 方案比较与决策

### 方案 A：增量落库 + SSE 端轮询数据库

- 优点：改动小，能快速上线
- 缺点：SSE 自身不是真事件驱动，连接多时会加大数据库轮询负担

### 方案 B（采纳）：队列任务 + 段落持久化 + 事件驱动 SSE

- 优点：实时性、恢复能力、可观测性平衡最好
- 缺点：需要新增会话/事件模型与续传逻辑

### 方案 C：API 长连接内直接翻译并流式输出

- 优点：链路直观
- 缺点：与现有队列架构冲突，稳定性与扩展性弱

决策：采纳方案 B。

## 5. 架构设计

### 5.1 组件边界

- 触发层：`POST /api/articles/:id/ai-translate`
  - 语义改为“创建/恢复沉浸式翻译会话”
- 执行层：worker 按段并发翻译
  - 每段完成即更新段落状态并产出事件
- 分发层：`GET /api/articles/:id/ai-translate/stream`（SSE）
  - 实时推送段落结果与会话进度
  - 支持断线补偿
- 展示层：`ArticleView`
  - 翻译模式：原文块 + 译文块（逐段填充）
  - 原文模式：仅原文

### 5.2 与现有 `article_tasks` 的关系

- 保留 `article_tasks.ai_translate` 作为任务级状态（running/succeeded/failed）
- 新增“会话 + 段落 + 事件”承载细粒度进度与错误
- 避免回到 `GET /api/articles/:id` 大对象高频轮询

## 6. 数据模型

### 6.1 `article_translation_sessions`

建议字段：

- `id` uuid pk
- `article_id` uuid unique
- `source_html_hash` text
- `status` enum/text：`idle|running|succeeded|partial_failed|failed`
- `total_segments` int
- `translated_segments` int
- `failed_segments` int
- `started_at` timestamptz
- `finished_at` timestamptz nullable
- `last_event_id` bigint nullable
- `created_at` / `updated_at`

语义：

- 同一文章仅保留一个活跃会话
- `partial_failed` 表示“流程已结束，但存在失败段”

### 6.2 `article_translation_segments`

建议字段：

- `id` uuid pk
- `session_id` uuid fk
- `segment_index` int（文档顺序）
- `segment_type` text（`p/h1..h6/li/blockquote`）
- `segment_dom_path` text（稳定定位）
- `source_text` text
- `translated_text` text nullable
- `status` enum/text：`pending|running|succeeded|failed`
- `attempts` int default 0
- `error_code` text nullable
- `error_message` text nullable
- `created_at` / `updated_at`

约束：

- `unique(session_id, segment_index)`
- 索引：`(session_id, status)`、`(session_id, segment_index)`

### 6.3 `article_translation_events`（推荐）

建议字段：

- `event_id` bigserial pk
- `session_id` uuid
- `event_type` text
- `segment_index` int nullable
- `payload` jsonb
- `created_at` timestamptz

用途：

- SSE 断线续传（基于 `Last-Event-ID`）
- 排障与审计

## 7. 状态机设计

### 7.1 会话状态机

- `idle -> running`
- `running -> succeeded`（全部段成功）
- `running -> partial_failed`（有失败段但全流程完成）
- `running -> failed`（系统级异常）

### 7.2 段落状态机

- `pending -> running -> succeeded`
- `pending/running -> failed`
- `failed -> running -> succeeded|failed`（单段重试）

## 8. API 与事件契约

### 8.1 `POST /api/articles/:id/ai-translate`

行为：

- 无会话：创建会话并初始化段落
- 有运行中会话：幂等返回当前会话
- 内容 hash 变化：重建会话

返回示意：

```json
{
  "enqueued": true,
  "sessionId": "uuid",
  "status": "running",
  "totalSegments": 120,
  "translatedSegments": 18,
  "failedSegments": 2
}
```

兼容现有拒绝原因：

- `missing_api_key`
- `body_translate_disabled`
- `fulltext_pending`

### 8.2 `GET /api/articles/:id/ai-translate`

返回会话快照与已完成段，用于首屏恢复。

### 8.3 `GET /api/articles/:id/ai-translate/stream`（SSE）

事件：

- `session.snapshot`
- `segment.succeeded`
- `segment.failed`
- `session.completed`
- `session.partial_failed`
- `session.failed`

要求：

- 每条事件附带 `id`（用于 `Last-Event-ID`）
- 服务端支持补发 `id > Last-Event-ID` 的历史事件
- 周期心跳，降低代理/网关断链

## 9. 前端展示与交互

### 9.1 展示策略

- 原文先完整展示
- 每段译文到达后插入到对应原文段落下方
- 始终按 `segment_index` 渲染，避免并发返回导致页面跳动

### 9.2 按钮与模式

- 保留“翻译 / 原文”切换
- 切回原文仅影响展示，不中断后端翻译会话
- 切回翻译模式后自动恢复快照与流式更新

### 9.3 失败段交互

- 段落失败显示轻量错误态与“重试该段”
- 单段重试成功后就地更新该段译文

## 10. 错误处理与重试策略

- 段落失败：记录错误并继续后续段
- 会话最终收敛：
  - 无失败段：`succeeded`
  - 有失败段：`partial_failed`
  - 系统性异常：`failed`
- 不做段落自动重试（由用户触发单段重试）

建议新增接口：

- `POST /api/articles/:id/ai-translate/segments/:index/retry`

## 11. 测试与验收标准

### 11.1 后端测试

- 会话创建/恢复/重建（hash 变化）
- 段落并发翻译 + 状态推进
- 段落失败跳过后会话 `partial_failed`
- 单段重试路径
- SSE `Last-Event-ID` 补偿

### 11.2 前端测试

- 原文先展示、译文逐段插入
- 并发乱序返回时仍按文档顺序显示
- 切文后返回自动恢复
- “翻译 / 原文”切换不丢进度

### 11.3 验收标准

- 长文翻译首批段落可快速出现，不等待整篇结束
- 刷新页面后已完成段落仍可见（持久化有效）
- 失败段不阻塞全文，且可单段重试
- 视觉形态稳定为“上原文、下译文”

## 12. 风险与缓解

- 风险：段落定位漂移导致错位
  - 缓解：持久化 `segment_index + segment_dom_path + source_html_hash`
- 风险：SSE 连接不稳定
  - 缓解：事件补偿 + 心跳 + 自动重连
- 风险：并发翻译导致成本上升
  - 缓解：配置化并发上限与队列限流
- 风险：数据模型复杂度提高
  - 缓解：会话/段落/事件职责单一，保留与 `article_tasks` 的清晰边界

## 13. 后续流程

本设计确认后，下一步进入 `workflow-writing-plans`，产出可执行的 Implementation Plan（分任务、分验证、分提交）。

