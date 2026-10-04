# 开发指南

这份文档面向想在本地修改、调试或参与 FeedFuse 开发的人。

如果你只是想把应用运行起来，请改看 [部署指南](./deploy.md)。

## 环境要求

- `Node >=20.19.0`
- `pnpm@10`
- PostgreSQL 16

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

首次启动新库后，初始用户的用户名为 `admin`，密码来自 `AUTH_INITIAL_PASSWORD`。首登成功后，密码会写入数据库；后续登录使用数据库中的账号密码。

初始用户可以在 `设置中心` -> `账号与安全` 中改名或改密码。即使用户名不再是 `admin`，该账号仍是固定的初始用户。

`AUTH_COOKIE_SECURE=false` 用于本地 HTTP 访问。如果你用 HTTPS 访问开发环境，可以改为 `AUTH_COOKIE_SECURE=true`。

RSS 网络访问默认使用 `RSS_NETWORK_MODE=public`，只允许公网地址。可选模式：

- `public`：默认，仅允许公网地址
- `fake-ip`：额外允许 `198.18.0.0/15`
- `lan`：额外允许常见 RFC1918 局域网地址
- `custom`：只额外允许 `RSS_ALLOWED_CIDRS` 里声明的 CIDR

如果你在 Clash、sing-box 等 fake-ip 网络环境下录入 RSS 源，优先改成 `RSS_NETWORK_MODE=fake-ip`。如果你只想放开特定局域网网段，使用 `RSS_NETWORK_MODE=custom` 并设置 `RSS_ALLOWED_CIDRS=192.168.0.0/16,10.0.0.0/8`。

## 2. 准备 PostgreSQL

你可以使用自己本地已有的 PostgreSQL 16，也可以显式叠加开发配置，启动一个仅向宿主机回环地址开放端口的数据库：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
```

默认绑定 `127.0.0.1:5432`，匹配 `.env.example` 中的 `DATABASE_URL`。如需修改端口，在 `.env` 中设置 `POSTGRES_PORT` 并同步调整 `DATABASE_URL`。不叠加 `docker-compose.dev.yml` 时，数据库端口不会发布到宿主机。

## 3. 安装依赖

```bash
pnpm install
```

## 4. 执行数据库迁移

```bash
node scripts/db/migrate.mjs
```

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
pnpm worker:dev
```

`worker` 负责后台任务，包括全文抓取、摘要、翻译和 `AI解读` 等异步流程。

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

## 常用命令

```bash
pnpm dev
pnpm worker:dev
pnpm type-check
pnpm build
pnpm lint
pnpm test:unit
```

## 从源码构建 Docker 版本

如果你是在开发或调试镜像，可以继续使用仓库根目录的 `docker-compose.yml`：

```bash
cp .env.example .env
docker compose up --build
```

这个入口会从当前源码构建 `web` 和 `worker` 镜像，适合本地验证镜像行为，不适合作为推荐部署方式。
