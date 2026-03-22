---
id: 2026-03-22-container-distribution-release-path
date: 2026-03-22
area: container-distribution
kind: release
symptoms:
  - 普通用户只能先拉完整仓库，再运行 `docker compose up --build`
  - 仓库里没有可复用的 GHCR 镜像发布 workflow
  - 发布版 `compose.yaml` 在首轮远端发镜像前仍需要本地烟测路径
keywords:
  - GHCR
  - docker compose
  - prebuilt image
  - release workflow
  - manual tag
  - api health
  - feedfuse-web
  - feedfuse-worker
files:
  - .github/workflows/release-images.yml
  - deploy/compose.yaml
  - deploy/.env.example
  - README.md
  - Dockerfile
decision: 用 GitHub Actions 发布双镜像到 GHCR，并提供独立的 `deploy/compose.yaml` 作为默认安装入口；在首轮远端发镜像前，先把本地 `release-check` 镜像打到发布 tag 上做 compose 烟测。
related:
---

# FeedFuse 预构建镜像分发与本地发布烟测

## Symptom

- 普通用户默认路径只能先获取完整源码仓库，再本地构建 `web` / `worker`
- 发布版 Compose 清单虽然能做 `config` 展开，但在 GHCR 还没真正出包前，无法直接验证启动链路

## Impact

- 安装门槛偏高，用户机器必须具备完整构建环境
- 如果只改文档和 workflow 而不做真实启动验证，发布后容易在迁移命令、环境变量拼接或镜像 tag 上翻车

## Root Cause

- 原仓库只有根目录 `docker-compose.yml`，并且 `web` / `worker` 都依赖本地 `build.context: .`
- 仓库没有独立的发布版 `compose.yaml`、部署用 `.env.example`、也没有自动构建并推送镜像的 workflow
- 首轮实现时 GHCR 还没有真实镜像可拉，因此需要一条不依赖远端 registry 的本地验证路径

## Fix

- 新增 `.github/workflows/release-images.yml`，在 `push` tag 和 `workflow_dispatch` 下构建并推送 `ghcr.io/bryanhoo/feedfuse-web` 与 `ghcr.io/bryanhoo/feedfuse-worker`
- 新增 `deploy/compose.yaml` 和 `deploy/.env.example`，把普通用户入口切到纯 `image:` 安装
- 更新 `README.md`，默认安装改成下载发布版 Compose 文件、设置 `FEEDFUSE_VERSION`、`docker compose pull`、`docker compose up -d`
- 在本地烟测阶段先构建 `release-check` 镜像，再用 `docker tag` 打到 `ghcr.io/bryanhoo/...:replace-with-release-tag`，从而直接复用发布版 Compose 清单完成启动验证

## Verification

- Run: `docker compose -f deploy/compose.yaml --env-file deploy/.env.example config`
  - Result: pass，Compose 成功展开 `db`、`web`、`worker` 及 `DATABASE_URL`
- Run: `docker build --target web -t feedfuse-web:release-check .`
  - Result: pass，`web` target 可单独构建
- Run: `docker build --target worker -t feedfuse-worker:release-check .`
  - Result: pass，`worker` target 可单独构建
- Run: `pnpm build`
  - Result: pass，Next.js 生产构建完成
- Run: `docker tag feedfuse-web:release-check ghcr.io/bryanhoo/feedfuse-web:replace-with-release-tag`
  - Result: pass，本地镜像具备发布版 tag
- Run: `docker tag feedfuse-worker:release-check ghcr.io/bryanhoo/feedfuse-worker:replace-with-release-tag`
  - Result: pass，本地镜像具备发布版 tag
- Run: `env POSTGRES_PORT=65432 WEB_PORT=19559 docker compose -p feedfuse-release-smoke -f deploy/compose.yaml --env-file deploy/.env.example up -d`
  - Result: pass，`db`、`web`、`worker` 启动成功
- Run: `curl -fsS http://127.0.0.1:19559/api/health`
  - Result: pass，返回 `{"ok":true,"data":{"status":"ok"}}`

## Prevention / Follow-ups

- 首轮 GitHub 发布后，必须把两个 GHCR package 设为 `public`，否则 README 的匿名拉取路径无效
- 推荐继续通过显式版本 tag 分发，不要补 `latest`
- 如果后续发现拉取体积偏大，再单独规划 `Next.js standalone` 和 `worker` 预编译

## Notes

- 发布版 compose 烟测完成后，记得执行 `docker compose ... down -v` 清理临时容器和卷
- 如果本机没有 `gh` CLI，可以先用 `git push` 推代码与 tag，再从 GitHub 网页触发 `workflow_dispatch` 或观察 tag 触发的 workflow
