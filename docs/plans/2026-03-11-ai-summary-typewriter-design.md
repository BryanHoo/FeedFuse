# AI 摘要打字机效果设计

- 日期：2026-03-11
- 状态：已确认
- 需求：AI 摘要目前通过 SSE 推送到前端，但页面仍以块级增量显示；需要在不破坏现有摘要恢复与跨文章切换语义的前提下，增强为更连续的打字机效果，并把新增量首字显示延迟压到 300-500ms。

## 背景

当前 AI 摘要链路已经完成流式化：worker 在 [`src/worker/aiSummaryStreamWorker.ts`](../../src/worker/aiSummaryStreamWorker.ts) 中写入 `summary.delta`、`summary.snapshot`、`session.completed` 等事件，SSE 路由 [`src/app/api/articles/[id]/ai-summary/stream/route.ts`](../../src/app/api/articles/[id]/ai-summary/stream/route.ts) 负责回放事件，前端 hook [`src/features/articles/useStreamingAiSummary.ts`](../../src/features/articles/useStreamingAiSummary.ts) 负责读取 snapshot、建立 `EventSource`、按 `articleId` 合并真实 `session` 状态。

当前体验上的问题不是“前端没有流式”，而是“流式粒度和渲染节奏都偏块级”：

- worker 产出的是聚合过的 `deltaText`，不是 token 级事件；
- SSE route 目前每 1000ms 才批量拉取一次新事件；
- 前端拿到 `deltaText` 后会直接把整块文本拼接到 `draftText` 并立即显示。

因此用户感受到的是“摘要一段一段出现”，而不是连续写入。

## 相关经验与约束

本次设计必须遵守以下已验证约束，避免打破最近修好的摘要流行为：

- [`docs/summaries/2026-03-09-streaming-summary-hook-reset.md`](../summaries/2026-03-09-streaming-summary-hook-reset.md)
  - 不要让新的显示状态进入 stream 生命周期依赖链，否则容易因 render 或回调身份变化重置 `EventSource`。
- [`docs/summaries/2026-03-11-streaming-summary-switch-loss-and-force-duplicate.md`](../summaries/2026-03-11-streaming-summary-switch-loss-and-force-duplicate.md)
  - 真实摘要状态必须继续按 `articleId` 缓存，切换文章后切回时要能直接恢复草稿并继续接收 SSE。
- [`docs/summaries/2026-03-11-reader-background-refresh-overwrites-foreground-view.md`](../summaries/2026-03-11-reader-background-refresh-overwrites-foreground-view.md)
  - 后台刷新或完成后的 `refreshArticle` 不应污染当前前台视图语义；显示层要能在刷新后立即收敛到最新真实摘要，而不是二次重放。

## 目标

- 让 AI 摘要在文章详情页呈现更连续的打字机效果，而不是块级跳变。
- 将新增量首字显示延迟控制在 300-500ms。
- 只对“新到达的增量”做动画；恢复态、重进页面、切回文章时直接显示当前完整草稿。
- 不改变现有摘要 session、snapshot、SSE 恢复与完成回写的核心语义。
- 保持完成、失败、切换文章、snapshot 纠偏时的状态收敛稳定。

## 非目标

- 不把摘要协议改造成 token 级持久化事件。
- 不修改文章列表或其他非文章详情场景的摘要展示。
- 不对已有草稿、重连恢复内容或最终完成文本做整段重放动画。
- 不新增新的数据库表或新的摘要事件类型。
- 不改变 `article.aiSummary` 与 `aiSummarySession` 的职责边界。

## 备选方案

### 方案 1：仅前端播放层

保留现有 SSE 节奏与事件语义，只在前端把收到的 `deltaText` 拆成短片段播放。

优点：

- 改动最小；
- 风险最低；
- 不需要调整服务端。

缺点：

- 无法突破当前 1000ms 一批的推送节奏；
- 视觉上更顺，但“更实时”改善有限。

### 方案 2：调整 SSE 推送节奏 + 前端播放层

保留现有事件模型，只缩短 SSE route 拉取新事件的节奏，并增加一个独立显示层，把新增量拆成短片段播放。

优点：

- 能同时改善真实延迟和视觉连续性；
- 不需要重做 worker 协议；
- 真实状态与显示状态可以清晰分层。

缺点：

- 比纯前端方案多一层服务端改动；
- 需要设计好 snapshot / completed / failed 的即时收敛。

### 方案 3：让 worker 直接写更细粒度 delta

把 `summary.delta` 的持久化粒度压得更细，再由前端做轻量播放。

优点：

- 协议层面最接近“真正逐步产出”；
- 前端动画逻辑可以更轻。

缺点：

- 事件表膨胀风险高；
- 恢复、回放与纠偏复杂度明显上升；
- 对现有稳定链路侵入最大。

## 推荐方案

采用方案 2：调整 SSE 推送节奏 + 前端播放层。

理由：

- 用户诉求是“更强实时感”，当前 1000ms 批量回放本身就是主要瓶颈，只改前端不够。
- 继续保留现有的 session 持久化、snapshot 校正、completed 回写与跨文章恢复模型，风险比改 worker 协议低得多。
- 真实状态与视觉状态可以分层实现，既保留恢复稳定性，又提供自然的打字机观感。

## 已确认设计

### 架构与状态边界

本次改造不增加第二套摘要数据源，仍保持现有三段链路：

1. worker 持续写摘要事件；
2. SSE route 回放并推送事件；
3. `useStreamingAiSummary` 维护真实 `session`。

新增的是一个单独的“显示播放层”，其职责仅限于 UI 动画，不接管真实摘要状态。前端状态拆分如下：

- 真实层：`session.draftText / finalText / status / updatedAt`
- 传输层：`summary.delta / summary.snapshot / session.completed / session.failed`
- 显示层：`displayText`、待播放缓冲区、播放 timer 状态

边界约束：

- 真实层仍是唯一可信来源，恢复、重连、完成刷新都以它为准；
- 显示层只能消费真实层，不允许反向影响 `EventSource` 生命周期；
- 显示层不替代按 `articleId` 缓存的真实 `session`；
- snapshot 与完成态拥有高于动画的优先级，可以直接覆盖显示层。

### 数据流与播放规则

显示层引入两个核心概念：

- `sourceText`：当前真实摘要文本，来自 `session.finalText ?? session.draftText ?? ''`
- `displayText`：当前已经播到屏幕上的文本

规则如下：

1. 初始化或恢复
   - 首次进入文章、切回文章、刷新后恢复时，若已有 `draftText`，直接令 `displayText = sourceText`。
   - 不重放历史内容。
2. 收到 `summary.delta`
   - 真实层继续正常追加 `deltaText` 到 `session.draftText`。
   - 显示层根据最新 `sourceText` 与当前 `displayText` 计算待播放差量，而不是直接盲拼 `deltaText`。
3. 播放策略
   - 待播放差量按短片段推进，每步约 2-6 个字符；
   - 每步间隔约 40-70ms，可做轻微抖动；
   - 若待播积压过长，允许自动加速，避免显示层长期落后。
4. 收到 `summary.snapshot`
   - 直接把 `displayText` 对齐到完整 `draftText`；
   - 清空待播缓冲与播放 timer；
   - 不对 snapshot 本身做动画。
5. 收到 `session.completed`
   - 立即把 `displayText` 对齐到 `finalText`；
   - 停止动画并清空缓冲。
6. 收到 `session.failed`
   - 若已有草稿，保留当前摘要文本；
   - 允许把未播完内容直接冲刷到真实草稿边界后停止动画；
   - 错误提示仍沿用现有失败卡片语义。

结论：

- `delta` 负责动画；
- `snapshot` 负责纠偏；
- `completed / failed` 负责立即收敛。

### 服务端节奏调整

为了满足 300-500ms 的首字出现目标，保留现有事件回放语义，但调整 SSE route 的事件拉取节奏：

- 将 [`src/app/api/articles/[id]/ai-summary/stream/route.ts`](../../src/app/api/articles/[id]/ai-summary/stream/route.ts) 当前 1000ms 的轮询间隔缩短到约 250-300ms；
- 保留 heartbeat 周期与 `Last-Event-ID` 重放语义；
- 不改数据库结构，不新增事件类型，不引入复杂推送总线。

这样可以在不破坏恢复链路的前提下，让新事件更快进入浏览器，再由前端播放层把块级 delta 变成连续的小步显示。

### 前端实现落点

不建议把打字机逻辑直接并入 [`src/features/articles/useStreamingAiSummary.ts`](../../src/features/articles/useStreamingAiSummary.ts)。

推荐拆法：

- `useStreamingAiSummary`
  - 继续只负责真实 session、snapshot 拉取、SSE 生命周期与跨文章状态缓存。
- 新的摘要显示 hook
  - 例如放在 `src/features/articles/` 下，仅负责把 `sourceText` 派生为 `displayText`。
- `ArticleView`
  - 把当前 `aiSummaryText` 的来源从直接读取真实文本，改成优先读取 `displayText`；
  - 继续沿用现有摘要卡片与失败状态 UI 结构。

这种拆分可以把最近修复过的“真实摘要状态机”与这次新增的“视觉播放层”隔离开，降低回归风险。

### 可访问性与用户体验

- 若用户系统启用 `prefers-reduced-motion`，默认关闭打字机效果，新增量直接显示。
- 恢复态、重进页面、切换文章返回时直接显示完整草稿，避免用户产生“内容丢了又重打”的错觉。
- 若待播缓冲积压过长，保真优先于动画，应允许快速追平，而不是为动画牺牲信息到达速度。

### 测试策略

建议分三层覆盖：

1. 真实 session 回归测试
   - 继续使用 [`src/features/articles/useStreamingAiSummary.test.ts`](../../src/features/articles/useStreamingAiSummary.test.ts) 锁定 SSE 合并、切文章恢复、完成收敛。
2. 新增显示层测试
   - 覆盖恢复态直接显示、delta 短片段推进、snapshot 立即纠偏、completed/failed 收敛、`prefers-reduced-motion` 关闭动画。
3. 页面级回归测试
   - 在 [`src/features/articles/ArticleView.aiSummary.test.tsx`](../../src/features/articles/ArticleView.aiSummary.test.tsx) 验证“delta 不再整块瞬时出现”“恢复时不重放”“snapshot/completed 立即对齐”。

服务端测试不应把间隔死绑到具体毫秒值，而应继续验证 SSE route 的回放与断线恢复语义仍然成立。

## 风险与缓解

- 风险：显示层状态误入 stream 生命周期依赖，导致 `EventSource` 重连或重置。
  - 缓解：显示层独立 hook，不参与 `useStreamingAiSummary` 的 effect 依赖。
- 风险：切换文章时旧文章的待播缓冲误显示到新文章。
  - 缓解：显示层按 `articleId` 初始化，并在切换时立即停止旧 timer、清空旧上下文。
- 风险：snapshot / completed 到来时仍在播放旧缓冲，造成跳字或重复。
  - 缓解：snapshot 与终态事件拥有最高优先级，收到即直接对齐并冲刷缓冲。
- 风险：更快的 SSE 轮询增加服务端读压力。
  - 缓解：仅把节奏降到 250-300ms 量级，不改事件模型；后续根据实际观测再决定是否需要进一步优化。

## 成功标准

- AI 摘要新增量在 UI 上呈现连续小步推进，不再以整段文字突兀跳出。
- 新增量首字显示延迟接近 300-500ms。
- 切换文章、刷新恢复、completed / failed / snapshot 纠偏时不出现重复播放、错位或丢字。
- 现有摘要 SSE 恢复与跨文章缓存回归测试继续成立。
