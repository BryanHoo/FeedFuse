# 验证策略

## 默认基线

除纯文档修改外，默认至少执行：

- `pnpm lint`
- `pnpm type-check`
- 与改动相关的测试

纯文档、`.superwork` 规格或命令说明修改，可以不跑 `pnpm` 命令，但至少要核对：

- 引用的文件路径真实存在
- 命令名和脚本名与 `package.json` 一致
- 技能名、目录职责和代码事实一致

## 单测命令约定

- 跑单个或少量测试文件时，优先使用 `pnpm test:unit <path>`，例如 `pnpm test:unit src/test/server/db/pool.test.ts`
- 改动范围不清、跨多个层或跨多个消费方时，再退回整套 `pnpm test:unit`

## 按改动范围追加

### 前端

- 改 `src/features/**`、`src/components/**`、`src/app/(reader)/**`、`src/app/login/**`
- 先跑 `src/test` 镜像目录下相关 `*.test.tsx` / `*.spec.tsx`
- 交互或布局变更较大时，再跑 `pnpm build`

### API / 服务端

- 改 `src/app/api/**`、`src/server/**`
- 先跑 `src/test/app/api/**/route.test.ts`、`src/test/app/api/**/routes.test.ts`、`src/test/server/**/*.test.ts`
- 影响全局响应结构、环境变量或构建行为时，再跑 `pnpm build`

### Worker

- 改 `src/worker/**`
- 先跑对应 `src/test/worker/**/*.test.ts`
- 如果任务依赖 `src/server/domains/**/services/**` 或 `src/server/infra/queue/**`，补跑相关服务或队列测试

### Shared

- 改 `src/lib/**`、`src/utils/**`、`src/types/**`、`src/data/**`、`src/mock/**`
- 先跑对应 `src/test/lib/**`、`src/test/utils/**`、`src/test/data/**` 和相关消费测试
- 改 `src/lib/api/**` 时，额外确认 `src/test/store/**` 或相关 feature 测试
- 改 `src/lib/ui/designSystem.ts` 时，额外确认 `src/test/app/theme-token-usage.contract.test.ts` 与相关 UI 合约测试

### 数据库

- 改 `src/server/infra/db/migrations/**`、`src/server/domains/**/repositories/**`
- 先跑 `src/test/server/db/migrations/**` 与 `src/test/server/repositories/**` 对应测试
- 如果测试依赖真实数据库，确认 `DATABASE_URL` 可用
- 变更迁移逻辑后，至少检查 `scripts/db/migrate.mjs`

## 测试分布提醒

- 测试文件统一放在 `src/test/**`，目录结构与业务代码在 `src/**` 下保持镜像
- `config/vitest/vitest.config.ts` 把 `src/test/server`、`src/test/worker`、`src/test/app/api`、`src/test/lib`、`src/test/utils`、`src/test/data` 里的 `*.test.ts` 归到 `node` 环境
- 其他 `src/test/**/*.{test,spec}.{ts,tsx}` 默认走 `jsdom`
- 通用测试初始化在 `src/test/setup.ts`
