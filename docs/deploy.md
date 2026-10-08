# 部署指南

这份文档面向想直接运行 FeedFuse 的用户，默认使用预构建镜像和 `docker compose` 完成部署。

如果你是要本地改代码或调试实现，请改看 [开发指南](./development.md)。

当前版本为 [`v0.4.3`](https://github.com/BryanHoo/FeedFuse/releases/tag/v0.4.3)，支持 `linux/amd64` 与 `linux/arm64`。Release 提供 `compose.yaml`、`.env.example` 和 `feedfuse-deploy-0.4.3.tar.gz` 部署附件。

## 推荐方式

推荐使用仓库 `deploy/` 目录对应的发布文件：

- `deploy/compose.yaml`
- `deploy/.env.example`

这样可以直接使用已经构建好的镜像，不需要先拉取完整源码仓库。

## 环境要求

- 已安装 Docker
- 已安装 Docker Compose，命令为 `docker compose`

以下命令均在保存 `compose.yaml` 和 `.env` 的安装目录执行。

## 1. 准备安装目录并下载发布文件

```bash
mkdir -p feedfuse
cd feedfuse
curl -fsSL -o compose.yaml https://raw.githubusercontent.com/BryanHoo/FeedFuse/main/deploy/compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/BryanHoo/FeedFuse/main/deploy/.env.example
```

## 2. 编辑 `.env`

至少需要修改这三个值：

- `IMAGE_PROXY_SECRET`：改成你自己的随机密钥
- `AUTH_INITIAL_PASSWORD`：改成初始用户首次登录密码
- `POSTGRES_PASSWORD`：改成你自己的数据库密码

可分别执行 `openssl rand -hex 32` 生成随机值。Compose 会把数据库密码拼入连接 URL，使用十六进制随机值可避免 `@`、`/`、`#` 等字符影响 URL 解析。

默认情况下，`.env` 已包含本地自托管所需的基础配置：

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `WEB_PORT`
- `IMAGE_PROXY_SECRET`
- `AUTH_INITIAL_PASSWORD`
- `AUTH_COOKIE_SECURE`
- `RSS_NETWORK_MODE`
- `RSS_ALLOWED_CIDRS`

`AUTH_COOKIE_SECURE=false` 适合默认的 HTTP 端口访问，包含局域网 IP 访问。如果你在前面接了 HTTPS 反向代理，并且用户通过 `https://` 访问 FeedFuse，建议改成 `AUTH_COOKIE_SECURE=true`。

RSS 网络访问默认使用 `RSS_NETWORK_MODE=public`，仅允许公网地址。常见模式：

- `public`：默认，仅允许公网地址
- `fake-ip`：额外允许 `198.18.0.0/15`
- `lan`：额外允许常见 RFC1918 局域网地址
- `custom`：只额外允许 `RSS_ALLOWED_CIDRS` 里的网段

只有在你明确需要兼容 fake-ip 或内网 RSS 时才调整这些值。例如：

- `RSS_NETWORK_MODE=fake-ip`
- `RSS_NETWORK_MODE=custom`
- `RSS_ALLOWED_CIDRS=192.168.0.0/16,10.0.0.0/8`

## 3. 拉取镜像并启动服务

```bash
docker compose pull
docker compose up -d
```

启动后访问：

```text
http://<服务器地址>:9559
```

在服务器本机访问时，使用 `http://127.0.0.1:9559`。若修改了 `WEB_PORT`，同步替换访问端口。

`docker compose` 会同时启动：

- `db`：PostgreSQL
- `web`：FeedFuse Web 应用
- `worker`：后台任务进程，负责 RSS 刷新、Fever 同步、全文抓取、摘要、翻译和 `AI解读`

`web` 和 `worker` 都会在启动前执行数据库迁移；迁移脚本通过数据库锁串行执行，并跳过已经应用的迁移。

数据库端口默认不发布到宿主机，`web` 和 `worker` 通过 Compose 内部网络连接 `db:5432`。需要维护数据库时可使用 `docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`。

检查启动结果：

```bash
docker compose ps
docker compose logs --tail=100 web worker
curl -fsS http://127.0.0.1:9559/api/health
```

最后一条命令在服务器上执行，端口应与 `WEB_PORT` 一致。`/api/health` 只确认 Web 能响应请求，不检查数据库连接或 Worker 状态；还需要确认能够登录、添加订阅并完成刷新。

## 4. 首次使用

1. 使用用户名 `admin` 和 `.env` 里的 `AUTH_INITIAL_PASSWORD` 登录
2. 打开 `设置中心` -> `账号与安全`，修改当前账号用户名或密码
3. 添加自己的 RSS 源，或通过 OPML 导入订阅
4. 按需整理分类
5. 如果需要 AI 能力，再到 `设置中心` -> `AI` 补充配置
6. 开始阅读，并按需要生成摘要、翻译或 `AI解读`

初始用户首次登录成功后，密码哈希会写入数据库。此后修改 `AUTH_INITIAL_PASSWORD` 不会重置已有账号密码，请在应用内修改密码。

## 5. 账号与权限

FeedFuse 支持单实例多用户使用。所有用户的 RSS 源、分类、文章状态、Fever 服务、AI 配置和阅读设置默认隔离。

初始用户是系统创建的第一个用户，首次用户名为 `admin`。这个账号可以改名，但仍保留初始用户权限。

角色说明：

- `管理员`：可以新增用户，编辑、启用或禁用非初始用户
- `成员`：只能管理自己的订阅、设置和账号资料
- `初始用户`：拥有管理员能力，并且可以删除其他用户

删除用户会同步删除该用户拥有的订阅、分类、Fever 服务和任务数据，且无法恢复。

更完整的日常使用说明见 [使用指南](./user-guide.md)。

## 6. 配置 AI

AI 为可选功能，由每个用户在 `设置中心 -> AI` 中配置，操作步骤见 [使用指南：配置 AI](./user-guide.md#8-配置-ai)。无需把模型密钥写入部署 `.env`。

## 7. 升级

升级前先备份数据库，并保留当前的 `.env`、`compose.yaml` 和两个镜像的版本记录：

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "feedfuse-$(date +%Y%m%d-%H%M%S).sql"
```

确认命令成功退出、备份文件非空后，先更新部署配置。

从 `0.4.2` 或更早版本升级到 `0.4.3` 时，先检查本地 `compose.yaml`：新版默认不发布 PostgreSQL 端口，应移除 `db` 服务的 `ports` 配置。`docker compose pull` 只更新镜像，不会修改这个文件；如有自定义配置，按新版 [compose.yaml](../deploy/compose.yaml) 合并修改，并保留现有 `.env` 和数据库卷。

如需从宿主机连接数据库，应另行配置仅绑定 `127.0.0.1` 的端口；本地源码开发可使用 [开发指南](./development.md#2-准备-postgresql) 中的覆盖文件。

如果需要固定版本，把 `compose.yaml` 中两个镜像同时改为同一个已发布版本：

- `ghcr.io/bryanhoo/feedfuse-web:0.4.3`
- `ghcr.io/bryanhoo/feedfuse-worker:0.4.3`

默认的 `latest` 通道会跟随正式版本更新；固定版本时两个镜像都使用不带 `v` 的 `0.4.3` 标签。升级会自动应用数据库迁移；仅换回旧镜像不会撤销迁移，回退时需要同时评估数据库备份恢复。

完成配置修改后，拉取镜像并重建服务：

```bash
docker compose pull
docker compose up -d
```

升级后执行 `docker compose ps`，检查 `db`、`web`、`worker` 状态和日志，再确认能够登录、刷新订阅并连续加载文章列表。

从旧版本升级到多用户版本后，原有单用户数据会归属到初始用户。升级完成后先使用原 `admin` 登录，再到 `设置中心` -> `账号与安全` 检查账号资料。

## 常见问题与维护

| 现象 | 检查项 |
| --- | --- |
| 无法打开页面 | 用 `docker compose ps` 检查状态，再检查 `WEB_PORT`、防火墙和反向代理 |
| HTTP 登录后仍返回登录页 | 检查 `AUTH_COOKIE_SECURE=false`，修改 `.env` 后执行 `docker compose up -d` |
| 提示数据库尚未就绪 | 查看 `docker compose logs --tail=100 db web worker`，核对数据库账号和密码 |
| 修改数据库密码后连接失败 | 已初始化的数据卷不会随 `POSTGRES_PASSWORD` 自动改密，需要同步修改数据库中的实际密码 |
| RSS 或 AI 任务一直等待 | 检查 Worker 日志、网络连通性以及当前用户的 AI 配置 |
| fake-ip 或内网 RSS 抓取失败 | 检查前述 `RSS_NETWORK_MODE` 与 `RSS_ALLOWED_CIDRS`，并确认容器能访问目标地址 |

`docker compose stop` 可停止服务；`docker compose down` 会移除容器和网络，但保留数据库卷。`docker compose down -v` 会删除数据库卷及其中的数据，不要用于普通升级。

从源码构建镜像见 [开发指南](./development.md#从源码构建-docker-版本)。
