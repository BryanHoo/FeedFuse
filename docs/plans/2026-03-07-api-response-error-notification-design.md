# 统一后端接口响应、错误信息与前端失败通知设计

- 日期：2026-03-07
- 状态：已确认（Approved）
- 范围：
  - `src/server/http/apiResponse.ts`
  - `src/server/http/errors.ts`
  - `src/app/api/**/route.ts`（仅 JSON API）
  - `src/lib/apiClient.ts`
  - `src/features/notifications/NotificationProvider.tsx`
  - `src/app/(reader)/ReaderApp.tsx`
  - `src/features/feeds/FeedDialog.tsx`
  - `src/features/feeds/FeedList.tsx`
  - `src/features/articles/ArticleList.tsx`
  - `src/store/appStore.ts`
  - `src/store/settingsStore.ts`
  - `docs/plans/2026-03-07-api-response-error-notification-implementation-plan.md`

## 1. 背景与目标

当前项目已经有一套初步可用的接口封装：大部分 JSON 接口使用 `src/server/http/apiResponse.ts` 中的 `ok/fail` 返回 `{ ok, data/error }`，前端 `src/lib/apiClient.ts` 也会解析该 envelope 并抛出 `ApiError`。

但现状仍存在三类不一致：

1. 部分 JSON 接口仍使用自定义结构，例如 `src/app/api/rss/validate/route.ts`。
2. 后端错误 message 仍有英文内部文案，例如 `Invalid request body`、`Not found`、`Internal error`，不适合直接面向用户展示。
3. 前端失败提示分散在组件和 store 中，`notify.error(...)`、`mapApiErrorToUserMessage(...)` 与 `console.error(...)` 并存，用户体验与维护成本都不稳定。

本次需求已确认的目标与边界：

1. 统一范围仅覆盖 **JSON API**，`SSE` / 流式接口保持特例。
2. 前端只统一拦截 **失败通知**，成功提示仍由业务层决定。
3. 静默加载、后台轮询、自动刷新默认不弹全局通知。
4. 最终给用户看的错误文案以后端返回的稳定中文 `message` 为准。

## 2. 已确认方向与边界

### 2.1 统一契约边界

统一仅覆盖返回 `application/json` 的业务接口，不强行改造：

1. `src/app/api/articles/[id]/ai-translate/stream/route.ts` 这类 `text/event-stream`。
2. 未来任何明确需要分块传输或长连接的接口。

这意味着本次“统一返回格式和类型”中的“格式”，指的是 **JSON 顶层 envelope 唯一**；不是要求所有协议都长成 JSON。

### 2.2 通知边界

统一失败通知的目标是减少重复样板和保证文案一致，不是把所有请求都变成弹窗：

1. 用户主动触发的写操作失败，默认允许全局通知。
2. 快照加载、自动保存同步、轮询刷新等静默请求，默认不通知。
3. 业务成功但结果为“未执行”时，不视为失败通知，例如 `{ enqueued: false, reason: 'already_enqueued' }`。

### 2.3 用户可见错误文案边界

后端返回的 `error.message` 必须满足：

1. 中文。
2. 可直接展示给用户。
3. 不包含数据库异常、堆栈或底层网络实现细节。

前端不再承担主要的错误文案翻译职责，仅保留非 API 异常兜底。

## 3. 架构设计

### 3.1 服务端响应模型

所有 JSON API 统一为以下两种顶层结构：

```ts
type ApiOk<T> = { ok: true; data: T };
type ApiFail = {
  ok: false;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
};
```

约束如下：

1. 成功一律返回 `ok: true` 与业务 `data`。
2. 失败一律返回 `ok: false` 与稳定 `error.code/message/fields`。
3. `HTTP status` 与 envelope 语义一致：`2xx` 对应成功，`4xx/5xx` 对应失败。
4. 未知异常统一映射为安全中文 message，而不是原始异常文本。

`src/server/http/apiResponse.ts` 继续作为唯一响应工厂，`src/server/http/errors.ts` 继续作为可预期业务错误的统一来源。

### 3.2 前端请求与通知链路

`src/lib/apiClient.ts` 成为唯一的 JSON API 消费入口，并承担两项职责：

1. 将统一 envelope 解析为成功结果或 `ApiError`。
2. 在请求失败且满足通知策略时，触发一次全局通知。

但 `apiClient` 不直接依赖 React hook。设计上新增一个轻量通知桥接层：

1. `NotificationProvider` 暴露 `error(message)` 能力。
2. 应用入口 `src/app/(reader)/ReaderApp.tsx` 在 provider 可用后注册一个全局 notifier。
3. `apiClient` 只调用该 notifier，不感知组件树与 hook 规则。

这样可以把失败通知从业务组件中抽离，同时避免在 store / util 中误用 `useNotify()`。

### 3.3 调用级通知策略

`requestApi(...)` 需要支持轻量选项，用来声明该请求是否应参与统一通知。推荐引入按调用点覆盖的策略字段，例如：

```ts
type RequestApiOptions = {
  notifyOnError?: boolean;
  notifyMessage?: string;
};
```

策略约束：

1. 交互型请求默认 `notifyOnError: true`。
2. 静默请求显式 `notifyOnError: false`。
3. 大多数场景直接使用后端 `error.message`，仅极少数场景允许前端覆盖 `notifyMessage`。

该策略只作用于失败通知，不影响 `ApiError` 抛出本身，调用方仍可继续捕获并做业务回滚。

## 4. 组件与职责划分

### 4.1 后端职责

后端负责：

1. 统一 envelope 结构。
2. 统一错误码命名。
3. 统一中文用户文案。
4. 统一字段级校验错误的 `fields` 输出。

已存在的 `ValidationError`、`ConflictError`、`NotFoundError` 继续保留，但其 message 需要收敛到面向用户的中文文案。

### 4.2 前端基础设施职责

前端基础设施层负责：

1. `apiClient`：统一解析响应、抛出 `ApiError`、按策略触发通知。
2. 通知桥：为 `apiClient` 提供与 UI 解耦的全局失败提示出口。
3. `ApiError` 类型：保持 `code/message/fields` 三元信息，不透出底层异常细节。

### 4.3 业务组件职责

业务组件与 store 不再负责“把 `ApiError` 映射成人类可读文案”，只负责：

1. 成功提示。
2. 乐观更新与失败回滚。
3. 表单字段级错误展示。
4. 明确声明当前请求是否属于静默请求。

因此，`FeedDialog`、`FeedList`、`ArticleList` 中重复的 `notify.error(mapApiErrorToUserMessage(...))` 将被移除或大幅收缩。

## 5. 数据流与错误语义

### 5.1 真失败与业务结果的划分

本次设计明确区分两类“没有完成目标”的结果：

1. **请求失败**：参数错误、资源不存在、冲突、内部错误。走 `fail(...)`，允许统一失败通知。
2. **业务结果未执行但不算异常**：例如任务已存在、配置缺失、全文仍在生成。走 `ok(...)`，由页面局部表达，不触发全局失败通知。

判断标准是：该结果是否应该被用户理解为“这次操作失败了”。如果不是，就不应该占用全局错误通知通道。

### 5.2 异步任务类接口

对 `src/app/api/articles/[id]/ai-summary/route.ts`、`src/app/api/articles/[id]/ai-translate/route.ts`、`src/app/api/feeds/[id]/refresh/route.ts` 等接口：

1. 入队成功返回 `ok({ enqueued: true, jobId })`。
2. 已存在任务、缺少前置条件等返回 `ok({ enqueued: false, reason })`。
3. 真正非法请求或系统异常才走 `fail(...)`。

这样可以和现有异步任务状态模型保持一致，避免把“已在处理中”误展示成失败。

### 5.3 RSS 校验接口

`src/app/api/rss/validate/route.ts` 是本次最重要的 JSON 特例：

1. 它必须收敛到统一 envelope，不能继续返回自定义顶层结构。
2. 但它的“校验失败”本质是表单反馈，不是全局错误。
3. 因此更适合改为：`ok({ valid: true, ... })` 或 `ok({ valid: false, reason, message })`，而不是 `fail(...)`。

这样 `FeedDialog` 可以继续以内联状态展示“链接无效 / 需要授权 / 不是合法 RSS”，同时完全绕开全局失败通知。

### 5.4 未知异常与兜底

未知异常统一按以下原则处理：

1. 服务端记录原始异常。
2. 对客户端仅返回稳定 `code`，如 `internal_error`。
3. 对客户端返回统一中文 `message`，例如“服务暂时不可用，请稍后重试”。
4. 前端如果收到非标准响应，仍以 `Invalid API response` 类错误兜底，但尽量通过路由统一避免进入该分支。

## 6. 错误处理与退化策略

### 6.1 服务端错误安全性

不得直接向客户端暴露：

1. SQL constraint 原文。
2. fetch / parser 原始异常。
3. 未经筛选的英文内部错误。

所有此类错误必须先归一化后再写入 `error.message`。

### 6.2 前端通知退化策略

若全局 notifier 尚未注册或在非浏览器上下文中调用：

1. `apiClient` 仍抛出 `ApiError`。
2. 通知触发静默跳过。
3. 调用方可继续自行处理错误。

这保证请求层不会因为通知系统不可用而破坏原始控制流。

### 6.3 非 API 异常兜底

保留 `src/features/notifications/mapApiErrorToUserMessage.ts`，但其角色调整为：

1. 兼容极少量仍未迁移的旧分支。
2. 处理非 `ApiError` 的前端运行时异常。
3. 作为过渡期兜底，而不是默认主路径。

## 7. 测试策略

### 7.1 服务端单测

应补充或更新以下覆盖：

1. `src/server/http/apiResponse.ts`：验证成功 envelope、失败 envelope、未知异常中文兜底。
2. `src/server/http/errors.ts`：验证常见业务错误码与用户文案一致。
3. 典型路由测试：验证 `ValidationError` / `ConflictError` / `NotFoundError` 返回统一结构。

### 7.2 路由回归测试

重点覆盖：

1. `src/app/api/rss/validate/route.ts`：改为统一 envelope 后，`valid: false` 路径仍可被表单消费。
2. `src/app/api/articles/routes.test.ts`：异步任务类接口在 `enqueued: false` 时仍走成功 envelope。
3. 现有 JSON 路由：不再返回英文 message。

### 7.3 前端单测

应补充 `src/lib/apiClient.test.ts` 与通知相关测试，覆盖：

1. 标准失败 envelope 会抛出 `ApiError`。
2. `notifyOnError: true` 时会触发一次全局失败通知。
3. `notifyOnError: false` 时不会触发通知。
4. 成功 envelope 中的业务结果未执行（如 `enqueued: false`）不会触发通知。

### 7.4 组件回归测试

至少覆盖一个真实业务回归：

1. `FeedDialog` 提交重复 URL 时，失败提示直接来自后端中文 `message`。
2. `FeedList` / `ArticleList` 不再重复弹出业务层手写失败通知。
3. `loadSnapshot` 或轮询类静默请求失败时，不会触发通知轰炸。

## 8. 相关经验与证据

- `docs/summaries/2026-03-07-rss-feed-fetch-error-indicator.md`
  - 已确认“不要把底层原始异常直接暴露给 UI”，并已在抓取错误映射中实践稳定中文文案，本次应沿用相同原则。
- `docs/summaries/2026-03-04-async-tasks-refactor.md`
  - 已确认异步任务失败应通过稳定 `errorCode/errorMessage` 与持久化状态表达，本次需要继续保持“可预期业务结果”与“真正失败”分层。
- `docs/summaries/2026-03-07-simplified-chinese-translation-eligibility.md`
  - 已有 `{ enqueued: false, reason }` 语义先例，说明任务类接口的“未执行”不应一律视为失败通知。

## 9. 实施结论

本次需求的最终设计为：

1. 所有 JSON API 统一收敛到 `{ ok: true, data } | { ok: false, error }` envelope。
2. `SSE` / 流式接口继续保持协议特例，不纳入本次统一范围。
3. 后端统一输出稳定错误码与可直接展示的中文 `message`，未知异常统一安全兜底。
4. 前端在 `apiClient` 集中解析失败并按调用策略触发全局通知。
5. 静默请求默认不通知，业务成功但未执行的结果继续走成功 envelope。
6. `rss validate` 改为统一 envelope 下的表单校验结果模型，避免误触全局错误提示。

