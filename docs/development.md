# 开发指南

这份文档面向想在本地修改、调试或参与 FeedFuse 开发的人。

如果你只是想把应用运行起来，请改看 [部署指南](./deploy.md)。

## 环境要求

- `Node >=20.19.0`；与仓库 Dockerfile 对齐时使用 Node.js 24
- `pnpm@10.30.3`，以 `package.json` 的 `packageManager` 为准
- PostgreSQL 16

以下命令均在仓库根目录执行。Web、Worker 和迁移需要连接同一个数据库。

## 1. 准备环境变量

先复制默认配置：

```bash
cp .env.example .env
```

根目录 `.env.example` 默认包含：

- `DATABASE_URL=postgresql://feedfuse:feedfuse@127.0.0.1:5432/feedfuse`
- `AUTH_INITIAL_PASSWORD=change-me-before-first-login`
- `AUTH_COOKIE_SECURE=false`
- `IMAGE_PROXY_SECRET=change-me-before-prod`
- `RSS_NETWORK_MODE=public`
- `RSS_ALLOWED_CIDRS=`

全新数据库的开发环境至少需要保证：

- `DATABASE_URL` 指向可用的 PostgreSQL
- `AUTH_INITIAL_PASSWORD` 已配置，供初始用户首次登录使用
- `IMAGE_PROXY_SECRET` 不为空

执行迁移后，初始用户的用户名为 `admin`，密码来自 `AUTH_INITIAL_PASSWORD`。首次登录成功后，密码哈希会写入数据库；后续修改 `.env` 中的初始密码不会重置已有账号密码。

初始用户可以在 `设置中心` -> `账号与安全` 中改名或改密码。即使用户名不再是 `admin`，该账号仍是固定的初始用户。

`AUTH_COOKIE_SECURE=false` 用于本地 HTTP 访问。如果你用 HTTPS 访问开发环境，可以改为 `AUTH_COOKIE_SECURE=true`。

RSS 网络访问默认使用 `RSS_NETWORK_MODE=public`，只允许公网地址。可选模式：

- `public`：默认，仅允许公网地址
- `fake-ip`：额外允许 `198.18.0.0/15`
- `lan`：额外允许常见 RFC1918 局域网地址
- `custom`：只额外允许 `RSS_ALLOWED_CIDRS` 里声明的 CIDR

如果你在 Clash、sing-box 等 fake-ip 网络环境下录入 RSS 源，优先改成 `RSS_NETWORK_MODE=fake-ip`。如果你只想放开特定局域网网段，使用 `RSS_NETWORK_MODE=custom` 并设置 `RSS_ALLOWED_CIDRS=192.168.0.0/16,10.0.0.0/8`。

本机地址与 Docker 宿主机别名没有默认豁免。开发时访问本机 RSS，可显式设置 `RSS_NETWORK_MODE=custom` 和 `RSS_ALLOWED_CIDRS=127.0.0.1/32,::1/128`；Docker 宿主机需要加入其实际解析到的 IP。`lan` 不额外允许回环地址。这是所有账号共用的部署策略，也适用于正文和媒体抓取；连接时会校验全部 DNS 候选 IP 并使用已校验地址，重定向每一跳同样受限。

## 2. 准备 PostgreSQL

你可以使用自己本地已有的 PostgreSQL 16，也可以显式叠加开发配置，启动一个仅向宿主机回环地址开放端口的数据库：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
```

默认绑定 `127.0.0.1:5432`，匹配 `.env.example` 中的 `DATABASE_URL`。如需修改端口，在 `.env` 中设置 `POSTGRES_PORT` 并同步调整 `DATABASE_URL`。不叠加 `docker-compose.dev.yml` 时，数据库端口不会发布到宿主机。

Web 与 Worker 使用的应用连接池在 `src/server/infra/db/pool.ts` 中设置超时：新建连接和池内排队等待最多 5 秒，数据库语句最多执行 30 秒，客户端查询等待最多 35 秒。语句超时用于取消数据库中的慢语句，客户端超时用于兜底处理网络中断或无响应；这些限制针对单次操作，不是整个请求或事务的总时限，也不应用于迁移脚本和 pg-boss 自建的连接池。

空闲连接错误写入进程标准错误日志，由 `pg` 自动移除故障连接。连接池每秒采样等待量；存在排队请求时输出 `[db.pool]` 告警，包含 `totalCount`、`idleCount`、`waitingCount`，持续积压每 30 秒最多输出一次。排查时查看 Web 或 Worker 的进程日志；这些日志不依赖数据库，也不写入设置中心的数据库日志表。

## 3. 安装依赖

```bash
corepack enable
pnpm install --frozen-lockfile
```

## 4. 执行数据库迁移

```bash
node --env-file=.env scripts/db/migrate.mjs
```

迁移脚本不会自动读取 `.env`，因此需要显式传入 `--env-file`。已导出的同名环境变量优先于文件内容。迁移文件位于 `src/server/infra/db/migrations`，执行记录保存在 `schema_migrations`；重复运行只应用未执行的迁移。

## 5. 启动 Web 开发服务

```bash
pnpm dev
```

默认访问地址：

```text
http://127.0.0.1:9559
```

## 6. 启动 Worker

另开一个终端执行：

```bash
pnpm exec tsx --env-file=.env --tsconfig config/typescript/tsconfig.json src/worker/index.ts
```

Web 开发服务会自动读取 `.env`；独立运行的 Worker 不会。上面的命令显式加载配置；仅当终端已导出所需环境变量时，才可直接使用 `pnpm worker:dev`。

Worker 负责 RSS 刷新、Fever 同步、全文抓取、摘要、翻译和 `AI解读` 等异步流程。它不会随 `pnpm dev` 自动启动，修改 Worker 代码后需要重启该进程。

## 7. 首次登录

启动 Web 与 Worker 后，打开：

```text
http://127.0.0.1:9559/login
```

首次登录默认使用：

- 用户名：`admin`
- 密码：`.env` 里的 `AUTH_INITIAL_PASSWORD`

登录后可在 `设置中心` -> `账号与安全` 中新增测试用户。管理员可以创建、编辑、启用或禁用用户；只有初始用户可以删除其他用户。

本地开发调试多账号问题时，重点确认这些隔离边界：

- RSS 源、分类、文章阅读状态按当前用户隔离
- `user_settings` 保存每个用户自己的 AI、翻译和 UI 设置
- Fever 服务、同步状态和远端投影源按当前用户隔离
- Worker 任务 payload 需要携带 `userId`

## 目录与验证

| 路径 | 职责 |
| --- | --- |
| `src/app` | 页面与 `src/app/api` 下的 HTTP 入口 |
| `src/features`、`src/components`、`src/hooks`、`src/store` | 前端功能、组件、hooks 与状态 |
| `src/server/domains` | 业务服务与数据库仓储 |
| `src/server/infra` | 数据库、队列、环境变量和日志 |
| `src/server/integrations` | RSS、Fever、AI、全文与图片处理 |
| `src/worker` | 后台任务调度与执行 |
| `src/lib`、`src/types`、`src/utils` | 共享客户端、类型与工具；部分模块仅供前端使用 |
| `src/test` | 集中存放测试，按业务目录组织 |
| `config` | ESLint、TypeScript 与 Vitest 配置 |

常用检查：

```bash
pnpm lint
pnpm type-check
pnpm test:unit
pnpm build
```

只运行指定测试文件：

```bash
pnpm test:unit src/test/server/db/pool.test.ts
```

Vitest 配置见 [vitest.config.ts](../config/vitest/vitest.config.ts)，包含 `node` 和 `jsdom` 两个测试项目。真实数据库集成测试需要进程环境中的 `DATABASE_URL`；未设置时会跳过这部分测试。需要执行时使用独立测试数据库，并先阅读 [集成测试](../src/test/server/repositories/repositories.integration.test.ts) 的数据准备与清理逻辑。

项目长期规范见 [仓库地图](../.superwork/spec/guides/repo-map.md) 和 [验证策略](../.superwork/spec/guides/verification.md)。

## 从源码构建 Docker 版本

如果你是在开发或调试镜像，可以继续使用仓库根目录的 `docker-compose.yml`：

```bash
docker compose up --build
```

复用前面准备好的 `.env`，避免覆盖已有配置。这个入口会从当前源码构建 `web` 和 `worker` 镜像，两者启动时都会执行迁移。容器内数据库地址由 Compose 设置为 `db:5432`。

根目录 Compose 没有向 Web 传入 `AUTH_COOKIE_SECURE`，生产模式默认使用 Secure Cookie。若要通过 HTTP 验证源码镜像，需要在本地 Compose 覆盖文件的 `web.environment` 中设置 `AUTH_COOKIE_SECURE: 'false'`；正式部署使用 [部署指南](./deploy.md) 中的发布配置。

## 发布版本

正式发布由 [.github/workflows/release-images.yml](../.github/workflows/release-images.yml) 执行，推送 `v*` 标签后触发：

1. 对照上一版本标签之后的提交，更新 `package.json` 版本和 `CHANGELOG.md`，同步 README 与相关指南中的版本说明。
2. 执行 `pnpm lint`、`pnpm type-check`、`pnpm test:unit`、`pnpm build` 和 `pnpm audit --prod`，确认检查结果及跳过的测试范围。
3. 提交版本与文档修改，创建和 `package.json` 一致的 `v<version>` 标签，再推送发布提交和标签。
4. 等待 `Release Images` 工作流成功，核对 GitHub Release 的更新说明、部署附件，以及 Web / Worker 两个镜像的版本标签。

工作流从 `CHANGELOG.md` 提取对应版本区块作为 Release 说明，同时构建 `linux/amd64` 与 `linux/arm64` 镜像。正式标签发布会更新完整版本、主次版本和 `latest` 镜像通道；GitHub 标签带 `v`，完整版本镜像标签不带 `v`。

手动触发工作流时必须填写 `manual_tag`，并确认所选代码的 `CHANGELOG.md` 包含对应版本。手动发布不会更新 `latest`；需要更新正式通道时使用版本标签触发。

## 常见问题

| 现象 | 检查项 |
| --- | --- |
| `Missing DATABASE_URL` 或环境变量校验失败 | 迁移和 Worker 是否显式加载 `.env`，是否被终端中的同名变量覆盖 |
| 本地数据库连接失败 | 是否叠加 `docker-compose.dev.yml`，`POSTGRES_PORT` 与 `DATABASE_URL` 是否匹配 |
| 页面可用但刷新、摘要或翻译一直等待 | Worker 是否启动，是否与 Web 使用同一个数据库 |
| 测试报 `ERR_REQUIRE_ESM` | 先检查 `node --version` 是否满足项目要求 |
