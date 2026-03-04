# pg-boss 使用优化设计（稳定性 + 性能）

**Date:** 2026-03-04  
**Status:** approved  
**Owner:** platform/backend  
**Scope:** `src/server/queue/*` + `src/worker/*` + enqueue routes（行为兼容）  

## 1. 背景与问题

当前项目已使用 `pg-boss` 承载异步任务（`feed/fulltext/ai`），但使用方式偏“点状”：

- 主要使用了 `send/work/schedule/singleton/retryLimit`；
- 队列级治理能力（`deadLetter`、`warningQueueSize`、`heartbeatSeconds`、`expireInSeconds`、`localConcurrency`、`batchSize`）尚未系统落地；
- enqueue 参数分散在 route 与 worker，不利于统一调优；
- `send()` 返回 `null`（节流/去重）目前通过抛错文案转义成业务分支，语义脆弱。

## 2. 相关历史与证据

- 已有任务状态持久化重构总结：`docs/summaries/2026-03-04-async-tasks-refactor.md`
- 现有异步任务设计文档：`docs/plans/2026-03-04-async-tasks-refactor-design.md`
- 当前核心实现：
  - `src/server/queue/boss.ts`
  - `src/server/queue/queue.ts`
  - `src/server/queue/jobs.ts`
  - `src/worker/index.ts`

> 已知 gotcha（来自总结文档）：历史上出现过“job 看似执行成功但无产出”；前端曾依赖大接口高频轮询。本设计保持 `article_tasks` 事实源不变，仅增强队列治理与吞吐。

## 3. 目标与非目标

### 3.1 目标（按优先级）

1. **P1 性能**：降低 `enqueue -> 开始执行` 等待时间（优先级最高）。  
2. **P2 稳定性恢复**：worker 异常/重启后，任务恢复更快且可观测。  
3. **P3 成功率**：提升 `feed/fulltext` 最终成功率（`ai` 维持手动重试策略）。  

### 3.2 非目标

- 不替换 `pg-boss`。
- 不变更前端 API 协议（继续返回 `enqueued/reason`）。
- 不调整 AI 模型/prompt 逻辑。
- 不在本轮引入新监控平台。

## 4. 关键约束（已确认）

- `ai_summary` / `ai_translate` 继续 `retryLimit: 0`（仅手动重试）。
- 当前部署形态为单实例 worker。
- 优先级为 `2 > 3 > 1`（等待时延 > 恢复能力 > 最终成功率）。

## 5. 方案对比与决策

### 方案 A：分级队列治理（采用）

- 以 Queue Contract 统一 `send/createQueue/work` 参数；
- `feed/fulltext` 开启自动重试 + backoff + DLQ；
- `ai*` 保持 `retryLimit: 0`；
- 引入轻量事件与队列统计观测。

### 方案 B：按实体强顺序（`key_strict_fifo` / group 强限制）

- 一致性强，但可能压低吞吐，失败后 key 阻塞治理复杂。

### 方案 C：主队列 + 重型 DLQ 回放体系

- 可审计性最好，但对单实例阶段过重。

### 结论

采用 **方案 A**。理由：最贴合当前优先级与架构现状，能最小改动快速得到性能与恢复收益。

## 6. 总体架构

引入“**Queue Contract 驱动**”架构，目标是“参数统一定义、行为集中治理”。

1. `contracts`：统一描述每个 job 的 queue/send/worker 配置。
2. `bootstrap`：worker 启动时按 contract 创建/更新 queue 与 DLQ。
3. `enqueue`：统一入队结果语义（`enqueued` vs `throttled_or_duplicate`）。
4. `worker registry`：统一注册 `work()` 及其并发参数。
5. `observability`：统一挂接 `error/warning/wip/stopped` 事件和 stats 采样。

## 7. 组件设计

### 7.1 `src/server/queue/contracts.ts`

定义每个 job 的契约：

- `queueOptions`: `retry*`, `heartbeatSeconds`, `expireInSeconds`, `deadLetter`, `warningQueueSize`, `deleteAfterSeconds`
- `sendOptions`: `singleton*`, `retry*`, `startAfter`, `priority`
- `workerOptions`: `localConcurrency`, `batchSize`, `pollingIntervalSeconds`

并提供：

- `getQueueCreateOptions(name)`
- `getSendOptions(name, context)`
- `getWorkerOptions(name)`

### 7.2 `src/server/queue/bootstrap.ts`

- 根据 contract 统一 `createQueue`；
- 自动确保 `deadLetter` queue 存在；
- 后续可扩展 `updateQueue`（幂等更新策略）。

### 7.3 `src/server/queue/queue.ts`（演进）

统一返回结构化入队结果，替代“抛固定错误文案”：

- `{ status: 'enqueued', jobId: string }`
- `{ status: 'throttled_or_duplicate' }`

route 层负责映射为现有 API reason（如 `already_enqueued`），保证兼容。

### 7.4 `src/worker/workerRegistry.ts`

- 从 contract 注入 `work()` 参数；
- 不改业务 handler 主体，仅改注册方式与并发配置来源。

## 8. 数据流设计

### 8.1 入队流

`route -> enqueueByContract -> pg-boss send -> structured result -> article_tasks/update response`

### 8.2 执行流

`worker start -> bootstrap queues -> register workers -> handler -> runArticleTaskWithStatus`

### 8.3 失败恢复流

- `ai*`：失败即写 `failed`，等待用户手动重试（保持产品策略）。
- `feed/fulltext`：自动重试（backoff），耗尽后进入 DLQ。

### 8.4 重启恢复流

- `heartbeatSeconds` + `expireInSeconds` 配置化；
- 崩溃场景优先靠 heartbeat 快速检测失联，再由 retry/expire 兜底。

## 9. 初始参数（V1，后续可调）

> 参数目标：先达到“可观测 + 可恢复 + 可调优”，不是一次性最优。

### `JOB_FEED_FETCH`

- queue:
  - `retryLimit: 4`
  - `retryDelay: 20`
  - `retryBackoff: true`
  - `retryDelayMax: 600`
  - `deadLetter: 'dlq.feed.fetch'`
  - `warningQueueSize: 200`
- worker:
  - `localConcurrency: 3`
  - `batchSize: 1`

### `JOB_ARTICLE_FULLTEXT_FETCH`

- queue:
  - `retryLimit: 3`
  - `retryDelay: 30`
  - `retryBackoff: true`
  - `retryDelayMax: 900`
  - `deadLetter: 'dlq.article.fulltext'`
  - `heartbeatSeconds: 60`
  - `expireInSeconds: 1200`
  - `warningQueueSize: 300`
- worker:
  - `localConcurrency: 4`
  - `batchSize: 2`

### `JOB_AI_SUMMARIZE` / `JOB_AI_TRANSLATE`

- send:
  - `retryLimit: 0`
  - `singletonKey: articleId`
  - `singletonSeconds: 600`
- queue:
  - `heartbeatSeconds: 60`
  - `expireInSeconds: 1800`
  - `warningQueueSize: 300`
- worker:
  - `localConcurrency: 2`
  - `batchSize: 1`

### `JOB_AI_TRANSLATE_TITLE`

- 维持不自动重试（与当前策略一致）；
- 可小幅并发：`localConcurrency: 2`。

## 10. 错误处理与可观测性

### 10.1 错误分层

1. 业务错误：继续由 `mapTaskError` -> `article_tasks.errorCode/errorMessage`。  
2. 队列错误：`pg-boss error/warning` 结构化日志。  
3. 生命周期错误：worker 启停/注册失败单独标识。  

### 10.2 事件监听

- `error`: `event=pgboss.error`
- `warning`: `event=pgboss.warning` + `message/data`
- `wip`: 抽样记录 worker 活跃情况
- `stopped`: 优雅停机观测

可选增强：`persistWarnings: true` + `warningRetentionDays: 30`。

### 10.3 队列健康采样

定时读取 `getQueueStats(name)`，输出：

- `created/retry/active/completed/failed`
- `queue_lag_signal = created + retry`

用于识别是否积压、是否退化。

## 11. 测试与验收

### 11.1 单元测试

- contract 参数快照；
- `enqueue` 结构化结果；
- route 映射兼容（`already_enqueued` 等）；
- worker 注册参数注入；
- 事件日志字段完整性。

### 11.2 集成测试

- `feed/fulltext` 的 retry->success、retry exhausted->DLQ；
- `ai*` 失败不自动重试；
- worker 重启后的恢复路径。

### 11.3 验收指标

1. `enqueue -> first active` 的 P50/P95 下降；  
2. worker 异常后恢复执行时间缩短；  
3. `feed/fulltext` 24h 失败占比下降。  

## 12. 发布与回滚

### 12.1 分阶段发布

1. Phase A：先上线 contract 收敛 + 观测，不调并发。  
2. Phase B：开启 `feed/fulltext` 自动重试 + DLQ。  
3. Phase C：按指标逐步提升 `localConcurrency/batchSize`。  

### 12.2 回滚策略

- 优先参数回滚：降并发、降 retry；
- 行为回滚：enqueue 入口兼容层可回退；
- DLQ 数据保留，不做破坏性清理，保障排障可追溯。

## 13. 风险与缓解

- 风险：初始并发过高导致下游 API/DB 压力上升。  
  缓解：逐阶段放量 + `warningQueueSize` + stats 采样。  

- 风险：retry 参数不当造成重复成本。  
  缓解：仅对 `feed/fulltext` 自动重试，`ai*` 继续手动重试。  

- 风险：队列策略分散导致维护回归。  
  缓解：以 contract 作为唯一策略来源并加测试快照。  

