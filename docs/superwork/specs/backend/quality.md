# Backend Quality

## 必跑校验

后端改动提交前至少执行：

- `pnpm lint`
- `pnpm type-check`
- `pnpm test`

如只改动局部模块，可先跑对应测试文件做快速回归，但最终仍要跑完整 `pnpm test`。

## API Route 质量基线

- 路由变更需同步更新 `src/app/api/**/route.test.ts` 或 `routes.test.ts`。
- 路由默认声明 `runtime = 'nodejs'` + `dynamic = 'force-dynamic'`。
- 受保护接口应在开头执行 `requireApiSession()`（公开接口需在代码中明确说明原因）。
- 响应必须走 `ok/fail`。

## Repository 与 SQL 质量基线

- SQL 列别名统一映射到 camelCase（示例：`site_url as "siteUrl"`，见 `src/server/repositories/feedsRepo.ts`）。
- 修改查询字段时，同步更新对应 `Row` 类型，避免类型与 SQL 漂移。
- 多步写操作使用事务（示例：`src/app/api/settings/route.ts` 的 `begin/commit/rollback`）。

## Migration 质量基线

- 新增迁移文件后，必须补充同目录迁移测试验证关键 DDL。
- 迁移影响接口或 repository 行为时，同步补充对应 API/repo 测试。

## Queue 与 Worker 质量基线

- 改动队列行为时同步修改 `src/server/queue/contracts.ts` 与 `src/server/queue/*.test.ts`。
- 涉及重试/并发/幂等策略的变更，必须在测试中显式断言。

## 禁止捷径

- 禁止跳过参数校验直接落库。
- 禁止在关键写操作中省略失败回滚路径。
- 禁止引入“只在调用端约定”的隐式字段，不写入共享契约文档。
