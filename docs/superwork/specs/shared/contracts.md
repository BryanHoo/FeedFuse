# Shared Contracts

## API 响应契约

统一 envelope 定义在 `src/server/http/apiResponse.ts`：

- 成功：`{ ok: true, data: T }`
- 失败：`{ ok: false, error: { code, message, fields? } }`

约束：

- 业务路由不要自定义第三种响应格式。
- 未知错误由 `fail(err)` 兜底为 `code: 'internal_error'` 且返回中文安全文案。

## 错误模型契约

统一错误类型在 `src/server/http/errors.ts`：

- 基类：`AppError(message, code, status, fields?)`
- 常用派生：`ValidationError`、`NotFoundError`、`ConflictError`、`UnauthorizedError`、`ServiceUnavailableError`

约束：

- 需要前端字段级提示时，把字段错误放入 `fields`。
- 禁止在 route 层直接返回散乱字符串错误；统一用 `AppError` 派生类型表达。

## 路由参数与 ID 契约

- 数值 ID 统一使用 `numericIdSchema`（`src/server/http/idSchemas.ts`），正则为 `^[1-9]\d*$`。
- 新增 `/:id` 风格路由时，必须先做 `safeParse`，失败返回 `ValidationError('Invalid route params', ...)`。

## 配置与环境契约

- 服务端环境变量由 `src/server/env.ts` 的 `envSchema` 统一解析。
- 当前受管键：`DATABASE_URL`、`AUTH_INITIAL_PASSWORD`、`IMAGE_PROXY_SECRET`。
- 新增环境键必须同步更新：
  - `src/server/env.ts`
  - `.env.example`
  - 对应测试

## 队列契约

任务名与发送策略统一收敛在 `src/server/queue/contracts.ts`（`QUEUE_CONTRACTS`）。

约束：

- 新增队列任务必须同时定义 `queue`、`worker`、`send`。
- 涉及去重/幂等的任务，必须明确 `singletonKey` / `singletonSeconds` 策略。
- 改动队列契约时同步更新 `src/server/queue/contracts.test.ts`。

## 数据库迁移契约

- SQL 迁移放在 `src/server/db/migrations/*.sql`，版本号按递增前缀维护。
- 每个迁移都要有同目录 `*.test.ts`，至少验证关键 DDL 语句存在。
- 影响共享字段/枚举/约束时，必须同步更新本文件或对应 layer spec。
