# Repo Conventions

本文件记录 FeedFuse 当前仓库的“实际写法”，不是理想化建议。

## Runtime 与工具链

- Node 版本必须 `>=20.19.0`（`package.json#engines`，并由 `scripts/check-node-version.mjs` 在 `pretest` 阶段强校验）。
- 包管理器统一使用 `pnpm`（`packageManager: pnpm@10.30.3`）。
- 常用本地命令：
  - `pnpm lint`
  - `pnpm type-check`
  - `pnpm test`
  - `pnpm dev`（端口 `9559`）

## 目录边界

| 目录 | 职责 |
|---|---|
| `src/app/api/**` | Next.js Route Handler，负责参数校验、鉴权、调用 service/repo、返回统一 envelope |
| `src/server/**` | 服务端核心逻辑（db/repositories/services/tasks/queue/auth/http） |
| `src/features/**` | 业务 UI 组合层（reader、settings、feeds、articles） |
| `src/components/ui/**` | 可复用 UI 原子组件与交互模式 |
| `src/store/**` | Zustand 全局状态与副作用入口 |
| `src/worker/**` | 后台任务执行器与调度 |

## API 路由约定

- API 路由默认声明 `export const runtime = 'nodejs'` 与 `export const dynamic = 'force-dynamic'`。
- 绝大多数受保护接口在 handler 起始调用 `requireApiSession()`（健康检查等公开接口除外）。
- 返回结构统一走 `ok(...)` / `fail(...)`（`src/server/http/apiResponse.ts`），避免在业务路由里手写分散格式。
- 入参校验优先使用 `zod.safeParse`，错误映射到 `ValidationError`，并通过 `fail(...)` 返回。

## 测试与命名约定

- 测试文件与实现文件同目录放置，命名使用 `*.test.ts` 或 `*.test.tsx`。
- API 路由测试集中在 `src/app/api/**/route.test.ts` 或 `routes.test.ts`。
- 迁移脚本必须有对应测试（示例：`src/server/db/migrations/0026_app_settings_auth.sql` 与 `appSettingsAuthMigration.test.ts`）。
- 前端契约测试使用 `*.contract.test.ts`（例如 `src/app/theme-token-usage.contract.test.ts`）。

## 配置与环境变量

`.env.example` 当前必需键：

- `DATABASE_URL`
- `AUTH_INITIAL_PASSWORD`
- `IMAGE_PROXY_SECRET`

新增环境变量时，必须同步更新以下位置：

- `src/server/env.ts` 的 `envSchema`
- `.env.example`
- 相关接口/服务测试

## 变更前检查

- 先用 `rg` 搜索是否已有同类 helper、schema、常量，避免平行实现。
- 跨层改动（`app/api` + `server` + `store/features`）前先更新或确认 `shared/contracts.md`。
