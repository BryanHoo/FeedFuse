# FeedFuse Container Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-subagent-driven-development (recommended) or superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让自托管用户不必拉取完整源码仓库，即可通过公开预构建镜像和发布版 Compose 清单安装 FeedFuse。

**Architecture:** 保留根目录 `Dockerfile` 作为唯一构建定义，复用现有 `web` / `worker` target，在 GitHub Actions 中构建多架构镜像并发布到 `ghcr.io/BryanHoo/feedfuse-web` 与 `ghcr.io/BryanHoo/feedfuse-worker`。新增 `deploy/compose.yaml` 和 `deploy/.env.example` 作为发布入口，继续沿用现有 `db` 服务、迁移命令、健康检查和环境变量约定。README 默认安装流程切换为“下载发布版 Compose + 配置 `.env` + 拉镜像启动”，源码构建保留为开发者路径。

**Tech Stack:** Docker Buildx, GitHub Actions, GHCR, Docker Compose, Next.js, pnpm

---

> 仓库 `AGENTS.md` 明确要求不使用 subagents；执行本计划时如果仍在该仓库内，改用 `@superwork-executing-plans` 内联执行，并跳过任何 reviewer / subagent 分发步骤。

## File Structure

- Create: `.github/workflows/release-images.yml`
  责任：在 `push tags` 和 `workflow_dispatch` 下构建并推送 `web` / `worker` 预构建镜像到 GHCR。
- Create: `deploy/compose.yaml`
  责任：为普通自托管用户提供纯 `image:` 安装入口，不再要求本地源码构建。
- Create: `deploy/.env.example`
  责任：提供发布版安装所需的最小环境变量模板，显式要求用户填写 `FEEDFUSE_VERSION` 和生产密钥。
- Modify: `README.md`
  责任：将默认安装路径改为预构建镜像分发，保留源码构建说明给开发者。
- Verify against: `Dockerfile`
  责任：继续作为唯一镜像构建来源，确保 `web` / `worker` target 能被发布工作流直接复用。
- Verify against: `docker-compose.yml`
  责任：作为当前本地构建版本的行为基线，发布版 `deploy/compose.yaml` 要复用同一服务拓扑、命令和健康检查语义。
- Verify against: `.env.example`
  责任：保留本地开发约定，避免将开发环境变量模板与发布环境模板混在一起。

## Execution Notes

- 使用 `@docker-expert` 处理 Buildx、多架构镜像、Compose 发布清单和 GHCR tag 规则。
- 在完成所有修改后，使用 `@superwork-verification-before-completion` 做最终验证，且必须运行 `pnpm build`。
- 本计划不包含 Kubernetes、Helm、Homebrew、npm 包分发，也不在这一轮引入额外安装脚本。
- 本计划默认不做浏览器测试，符合仓库约束。

### Task 1: 建立 GHCR 镜像发布工作流

**Files:**
- Create: `.github/workflows/release-images.yml`
- Verify: `Dockerfile`
- Verify: `package.json`

- [ ] **Step 1: 先验证当前 Docker target 是可发布输入**
  - Run: `docker build --target web -t feedfuse-web:plan-check .`
  - Expected: `web` target 构建成功，没有缺失构建产物或启动文件错误。

- [ ] **Step 2: 再验证 worker target 可单独构建**
  - Run: `docker build --target worker -t feedfuse-worker:plan-check .`
  - Expected: `worker` target 构建成功，说明现有 `Dockerfile` 已满足镜像发布的最小前提。

- [ ] **Step 3: 创建发布工作流骨架**
  - 触发条件使用两条路径：
  - `push.tags: ['v*']` 用于正式版本发布。
  - `workflow_dispatch` 用于首轮人工验证和后续手动重发。
  - `permissions` 至少包含 `contents: read` 和 `packages: write`。

- [ ] **Step 4: 接入 Buildx 与 GHCR 登录**
  - 使用 `docker/setup-qemu-action`、`docker/setup-buildx-action`、`docker/login-action`。
  - GHCR 登录直接使用 `${{ github.actor }}` 与 `${{ secrets.GITHUB_TOKEN }}`。
  - 不额外引入 Docker Hub 发布，避免初版分发链路变复杂。

- [ ] **Step 5: 为 web / worker 两个镜像分别生成 tag 和 label**
  - 统一镜像名：
  - `ghcr.io/BryanHoo/feedfuse-web`
  - `ghcr.io/BryanHoo/feedfuse-worker`
  - 正式 tag 发布时输出：
  - Git tag 对应的完整版本，例如 `v0.1.0`
  - 短 SHA tag，便于问题定位
  - 如果 `docker/metadata-action` 能从 tag 解析 semver，则额外输出 `0.1` 这类小版本 tag
  - 不自动发布 `latest`，避免默认安装漂移到未知版本。

- [ ] **Step 6: 为两个 target 分别添加多架构构建与推送**
  - `platforms` 使用 `linux/amd64,linux/arm64`。
  - `target` 分别指定 `web` 与 `worker`。
  - `push: true`。
  - 开启 GitHub Actions 缓存，减少重复构建时间。

- [ ] **Step 7: 为手动发布场景补一个明确输入**
  - `workflow_dispatch` 添加 `manual_tag` 输入。
  - 手动执行时仅推送 `manual_tag` 和 SHA tag，便于首轮发布前先打一个 `manual-test` 镜像做安装验证。

- [ ] **Step 8: 本地完成代码审查后提交**
  - Run: `git add .github/workflows/release-images.yml`
  - Run: `git commit -m "build(release): 添加 GHCR 镜像发布工作流"`

### Task 2: 新增纯镜像发布版 Compose 清单

**Files:**
- Create: `deploy/compose.yaml`
- Create: `deploy/.env.example`
- Verify: `docker-compose.yml`
- Verify: `.env.example`

- [ ] **Step 1: 先定义发布版环境变量边界**
  - `deploy/.env.example` 至少包含：
  - `FEEDFUSE_VERSION=replace-with-release-tag`
  - `IMAGE_PROXY_SECRET=change-me-before-prod`
  - `POSTGRES_DB=feedfuse`
  - `POSTGRES_USER=feedfuse`
  - `POSTGRES_PASSWORD=change-me-before-prod`
  - `POSTGRES_PORT=5432`
  - `WEB_PORT=9559`
  - 不复用根目录 `.env.example`，避免把本地开发 `DATABASE_URL` 模板和部署入口耦合在一起。

- [ ] **Step 2: 创建发布版 `deploy/compose.yaml`**
  - 保留三个服务：`db`、`web`、`worker`。
  - `db` 继续使用 `postgres:16`、命名卷、健康检查和 `unless-stopped`。
  - `web` / `worker` 改为 `image:`，不再使用 `build:`。
  - 镜像固定为：
  - `ghcr.io/BryanHoo/feedfuse-web:${FEEDFUSE_VERSION}`
  - `ghcr.io/BryanHoo/feedfuse-worker:${FEEDFUSE_VERSION}`
  - `web` / `worker` 继续保留当前迁移命令：
  - `node scripts/db/migrate.mjs && exec node node_modules/next/dist/bin/next start -p 9559`
  - `node scripts/db/migrate.mjs && exec node node_modules/tsx/dist/cli.mjs src/worker/index.ts`

- [ ] **Step 3: 保持发布版服务行为与当前 compose 对齐**
  - `DATABASE_URL` 通过 `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD` 拼接为容器内连接串，host 继续使用 `db`。
  - `extra_hosts`、`depends_on`、健康检查、端口映射、卷名称、`restart` 策略全部沿用当前语义。
  - 不在本轮额外拆分 Redis、外部 Postgres 或 override 文件。

- [ ] **Step 4: 先做配置级验证**
  - Run: `docker compose -f deploy/compose.yaml --env-file deploy/.env.example config`
  - Expected: Compose 配置成功展开，没有缺失变量、非法字段或插值错误。

- [ ] **Step 5: 记录首轮安装 smoke test 的命令**
  - 在计划执行阶段，工作流首次成功发布 `manual-test` 或正式 tag 后运行：
  - `cp deploy/.env.example /tmp/feedfuse-release.env`
  - 将 `FEEDFUSE_VERSION` 改为刚发布的 tag
  - Run: `docker compose -f deploy/compose.yaml --env-file /tmp/feedfuse-release.env pull`
  - Expected: `web` / `worker` 两个镜像都能匿名拉取成功；如果失败，优先检查 GHCR package visibility 是否为 `public`。

- [ ] **Step 6: 本地完成代码审查后提交**
  - Run: `git add deploy/compose.yaml deploy/.env.example`
  - Run: `git commit -m "build(deploy): 添加镜像版 Compose 部署清单"`

### Task 3: 将 README 默认安装入口切换为预构建镜像

**Files:**
- Modify: `README.md`
- Verify: `deploy/compose.yaml`
- Verify: `deploy/.env.example`

- [ ] **Step 1: 重写“快速开始”章节的默认路径**
  - 不再让用户先 `git clone` 再 `docker compose up --build`。
  - 改为先准备一个空目录，再下载发布版文件：
  - `mkdir -p feedfuse && cd feedfuse`
  - `curl -fsSL -o compose.yaml https://raw.githubusercontent.com/BryanHoo/FeedFuse/main/deploy/compose.yaml`
  - `curl -fsSL -o .env https://raw.githubusercontent.com/BryanHoo/FeedFuse/main/deploy/.env.example`

- [ ] **Step 2: 把安装步骤明确写成“编辑 `.env` -> 拉镜像 -> 启动”**
  - 指导用户至少修改：
  - `FEEDFUSE_VERSION`
  - `IMAGE_PROXY_SECRET`
  - `POSTGRES_PASSWORD`
  - 启动命令改为：
  - `docker compose pull`
  - `docker compose up -d`
  - 这样用户只依赖 Docker，不依赖完整源码仓库。

- [ ] **Step 3: 增加升级说明**
  - 升级命令保持最小化：
  - 更新 `.env` 中的 `FEEDFUSE_VERSION`
  - Run: `docker compose pull`
  - Run: `docker compose up -d`
  - 提醒用户镜像 tag 默认应固定到明确版本，而不是依赖漂移的默认标签。

- [ ] **Step 4: 保留源码构建路径给开发者**
  - 在 README 中单独放到“本地开发”或“从源码运行”小节。
  - 明确说明根目录 `docker-compose.yml` 仍用于本地构建与开发，不再作为普通用户的首选安装方式。

- [ ] **Step 5: 检查 README 命令与实际文件名完全一致**
  - 核对 raw URL、`compose.yaml` 文件名、`.env` 文件名、端口和访问地址。
  - 确保 README 不引用尚未创建的 release asset 或不存在的脚本。

- [ ] **Step 6: 本地完成代码审查后提交**
  - Run: `git add README.md`
  - Run: `git commit -m "docs(readme): 更新预构建镜像安装说明"`

### Task 4: 做首轮端到端发布验证

**Files:**
- Verify: `.github/workflows/release-images.yml`
- Verify: `deploy/compose.yaml`
- Verify: `deploy/.env.example`
- Verify: `README.md`
- Verify: `Dockerfile`

- [ ] **Step 1: 先做仓库内静态与构建验证**
  - Run: `docker compose -f deploy/compose.yaml --env-file deploy/.env.example config`
  - Expected: PASS
  - Run: `docker build --target web -t feedfuse-web:release-check .`
  - Expected: PASS
  - Run: `docker build --target worker -t feedfuse-worker:release-check .`
  - Expected: PASS

- [ ] **Step 2: 运行仓库要求的构建验证**
  - Run: `pnpm build`
  - Expected: PASS

- [ ] **Step 3: 合并后先手动触发一次 GHCR 发布**
  - 在 GitHub Actions 中通过 `workflow_dispatch` 执行 `release-images.yml`
  - 输入 `manual_tag=manual-test`
  - Expected: GHCR 中出现：
  - `ghcr.io/BryanHoo/feedfuse-web:manual-test`
  - `ghcr.io/BryanHoo/feedfuse-worker:manual-test`

- [ ] **Step 4: 确认 GHCR 包可匿名拉取**
  - 检查两个 container package 是否为 `public`。
  - 如果首次发布后仍是私有包，在 GitHub Packages 设置中显式切到 `public`。
  - 只有匿名可拉取，README 的“无需源码即可安装”才成立。

- [ ] **Step 5: 用 README 里的真实命令做一次安装烟测**
  - 在临时目录运行：
  - `mkdir -p /tmp/feedfuse-install && cd /tmp/feedfuse-install`
  - `curl -fsSL -o compose.yaml https://raw.githubusercontent.com/BryanHoo/FeedFuse/main/deploy/compose.yaml`
  - `curl -fsSL -o .env https://raw.githubusercontent.com/BryanHoo/FeedFuse/main/deploy/.env.example`
  - 将 `FEEDFUSE_VERSION` 改为 `manual-test`
  - Run: `docker compose pull`
  - Run: `docker compose up -d`
  - Expected: `db`、`web`、`worker` 均能启动；访问 `http://127.0.0.1:9559` 时服务可达。

- [ ] **Step 6: 推出第一个正式版本 tag**
  - 在首轮手动验证通过后，再创建正式版本 tag，例如 `v0.1.0`
  - 依赖 `push tags` 自动发布正式镜像
  - 正式版本发布后，把 README 示例中的推荐版本更新到该 tag

### Task 5: 收尾与后续边界

**Files:**
- Verify: `next.config.mjs`
- Verify: `Dockerfile`

- [ ] **Step 1: 记录本轮明确不做的内容**
  - 不在本轮加入 Docker Hub 镜像同步
  - 不在本轮加入安装脚本、Release ZIP、Helm chart、Kubernetes 清单
  - 不在本轮切换到 `latest` 默认 tag

- [ ] **Step 2: 记录下一轮可选优化**
  - 如 GHCR 拉取体积过大，再单独规划：
  - 为 `web` 启用 Next.js `standalone` 输出并缩小运行时镜像
  - 为 `worker` 去掉运行时 `tsx` 依赖，改为预编译后启动
  - 如用户反馈需要，再评估同步 Docker Hub

- [ ] **Step 3: 完成最终提交整理**
  - Run: `git status --short`
  - Expected: 仅剩本计划涉及文件改动，没有混入无关工作区变更。
