# Backend Error Handling

## Route 层统一模式

以 `src/app/api/feeds/route.ts`、`src/app/api/articles/[id]/ai-summary/route.ts` 为基线：

- handler 外层使用 `try/catch`，末尾统一 `return fail(err)`。
- 参数校验用 `zod.safeParse`；失败映射为 `ValidationError`。
- 业务不存在用 `NotFoundError`，鉴权失败用 `UnauthorizedError`，资源冲突用 `ConflictError`。

## PostgreSQL 异常映射

当前路由会按错误码做业务映射（示例：`src/app/api/feeds/route.ts`）：

- `23505` -> `ConflictError`
- `23503` -> `ValidationError`

规则：

- 不要把数据库原始错误直接透出给前端。
- 对用户可处理的错误优先映射为稳定 `code` + `fields`。

## 任务错误映射与脱敏

任务失败统一通过 `src/server/tasks/errorMapping.ts` 与 `rawErrorMessage.ts`：

- `mapTaskError(...)` 负责把底层异常转为稳定 `errorCode/errorMessage`。
- `toRawErrorMessage(...)` 会做敏感信息脱敏并截断（最大 800 字符）。

规则：

- 新增任务错误场景时，必须补充 `mapTaskError` 分支与测试。
- 原始报错日志可保留诊断信息，但不能包含明文 token/api key。

## 外部请求错误与日志

外部请求入口（`src/server/http/externalHttpClient.ts`、`src/server/ai/openaiClient.ts`）统一写系统日志：

- category：`external_api`
- 失败日志带 `details`，成功日志仅保留必要上下文

规则：

- 新增外部调用时，必须带 `source` 和 `requestLabel` 以便追踪。
- 禁止仅 `console.error` 丢失结构化上下文。

## 常见反模式

- 在 route 里直接 `NextResponse.json({ error: ... })` 绕过 `ok/fail`。
- 直接把 `err.message` 原样返回用户，导致错误文案不稳定或泄露内部信息。
