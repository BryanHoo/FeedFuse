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
- `IMAGE_PROXY_SECRET=change-me-before-prod`

开发环境至少需要保证：

- `DATABASE_URL` 指向可用的 PostgreSQL
- `IMAGE_PROXY_SECRET` 不为空

## 2. 准备 PostgreSQL

你可以使用自己本地已有的 PostgreSQL 16，也可以直接用仓库根目录的 `docker-compose.yml` 启一个数据库：

```bash
docker compose up -d db
```

如果使用默认配置，数据库连接会匹配 `.env.example` 中的 `DATABASE_URL`。

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

## 常用命令

```bash
pnpm dev
pnpm worker:dev
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
