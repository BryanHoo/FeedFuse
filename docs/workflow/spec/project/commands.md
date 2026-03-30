# 项目命令

## 环境准备

- Node：`>=20.19.0`
- 包管理器：优先使用 `pnpm@10`
- 数据库：PostgreSQL 16
- 初始化环境变量：`cp .env.example .env`
- 启动本地数据库：`docker compose up -d db`
- 安装依赖：`pnpm install`
- 执行迁移：`node scripts/db/migrate.mjs`

## 本地开发

- 启动 Web：`pnpm dev`
- 启动 Web（turbo 版本）：`pnpm dev:turbo`
- 启动 Worker：`pnpm worker:dev`
- 默认地址：`http://127.0.0.1:9559`

## 常用验证

- 单元测试：`pnpm test:unit`
- 持续观察测试：`pnpm test:unit:watch`
- Lint：`pnpm lint`
- Type check：`pnpm type-check`
- 生产构建：`pnpm build`

## 改动后的最低验证建议

- 只改前端渲染或样式：
  运行 `pnpm test:unit` 中与页面、组件或 contract test 相关的用例，至少补跑 `pnpm lint`
- 改 API 路由、服务端逻辑或数据库查询：
  至少跑对应 `routes.test.ts` / `*.test.ts`，并补跑 `pnpm type-check`
- 改数据库 schema：
  新增 SQL migration，运行 `node scripts/db/migrate.mjs`，并补跑 migration 相关测试
- 改 worker / AI / 队列逻辑：
  至少跑相关 worker 或 runtime 测试，尤其注意 `src/server/ai/openaiClient.runtime.test.ts`

## 预览与镜像验证

- 本地生产启动：`pnpm build && pnpm start`
- 源码构建 Docker：`docker compose up --build`

## 额外说明

- 当前 `package.json` 没有封装数据库迁移脚本，迁移仍然通过 `node scripts/db/migrate.mjs` 直接执行。
- Web 和 Worker 通常需要两个终端并行运行，否则异步任务不会被消费。
