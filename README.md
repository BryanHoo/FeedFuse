<p align="center">
  <img src="./public/feedfuse-logo.svg" alt="FeedFuse" width="88" />
</p>

<h1 align="center">FeedFuse</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-149eca" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.2-06b6d4" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169e1" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/OpenAI-API-412991" alt="OpenAI" />
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/License-AGPL--3.0-0f766e" alt="AGPL-3.0" />
  </a>
</p>

<p align="center">
  一个把 RSS 阅读、全文抓取和 AI 辅助理解放进同一工作台的信息阅读器。
</p>

<p align="center">
  <a href="./docs/user-guide.md">使用指南</a>
  ·
  <a href="./docs/deploy.md">快速部署</a>
  ·
  <a href="./docs/development.md">本地开发</a>
  ·
  <a href="./CHANGELOG.md">更新日志</a>
  ·
  <a href="./LICENSE">开源协议</a>
</p>

## FeedFuse 是什么

FeedFuse 想解决的不是“信息从哪里来”，而是“订阅之后怎样更稳定地读完、理解并整理这些信息”。

它保留了 RSS 最有价值的部分：开放、可迁移、可掌控。同时把全文抓取、文章过滤、AI 摘要、翻译和 `AI解读` 放进同一条阅读工作流里，让你不用在 RSS 工具、稍后阅读工具和聊天工具之间来回切换。

FeedFuse 不替你决定看什么。订阅源由你决定，阅读节奏由你决定，AI 只在你需要的时候参与。

## 为什么用 FeedFuse

- 不依赖推荐算法，信息入口仍然掌握在你自己手里
- 把 “RSS 收集 → 过滤 → 阅读 → 理解 → 汇总” 串成一条连续工作流
- 支持自托管，数据和迁移路径都更可控
- 既能保持 RSS 的轻量输入，又能补上现代阅读里高频的 AI 能力

## 适合谁

- 想长期跟踪行业、产品、研究或新闻信息的人
- 想集中管理多个 RSS 源，而不是频繁切换工具的人
- 想用 AI 提高理解效率，但不想把信息选择权交给算法的人
- 想自托管阅读工具，保留数据和迁移自由的人

## 核心能力

- `RSS 管理`：集中管理订阅源、分类组织、支持 OPML 导入和导出
- `阅读体验`：三栏界面配合全文抓取，把订阅、列表和正文阅读放在同一工作台
- `内容减噪`：支持关键词过滤、AI 过滤，以及重复 / 相似转载过滤
- `AI 辅助理解`：支持文章摘要、标题翻译、正文翻译和沉浸式双语阅读
- `AI解读`：把多个信息源汇总成更高层的重点归纳，帮助快速把握趋势
- `多账号使用`：支持管理员创建用户、启用或禁用账号，并按用户隔离订阅、设置、Fever 服务和阅读状态
- `自托管部署`：可直接用预构建镜像启动，也可以从源码运行和调试

## 快速开始

当前版本：[`v0.4.4`](https://github.com/BryanHoo/FeedFuse/releases/tag/v0.4.4)。本版修复源站安全检测页导致订阅源被误判的问题，并改善访问受阻提示。完整变更见 [更新日志](./CHANGELOG.md#044---2026-10-08)。

1. 按 [部署指南](./docs/deploy.md) 启动服务
2. 使用 `admin` 和 `.env` 里的 `AUTH_INITIAL_PASSWORD` 首次登录
3. 打开 `设置中心` -> `账号与安全`，修改当前账号用户名或密码
4. 需要多人共用同一实例时，由管理员在 `账号与安全` 中新增用户
5. 每个用户分别添加 RSS 源、Fever 服务和 AI 配置

完整的账号、RSS、Fever 和 AI 使用流程见 [使用指南](./docs/user-guide.md)。

## 文档导航

| 目标 | 文档 |
| --- | --- |
| 部署实例、升级和排查运行问题 | [部署指南](./docs/deploy.md) |
| 管理账号、订阅、Fever 和 AI 配置 | [使用指南](./docs/user-guide.md) |
| 运行源码、启动 Worker 和执行测试 | [开发指南](./docs/development.md) |
| 查看版本变更 | [更新日志](./CHANGELOG.md) |
| 查看依赖安全复核记录及适用范围 | [生产依赖安全复核](./docs/dependency-security.md) |

## 预览

![FeedFuse 首页 / 三栏阅读视图](./.github/assets/readme/home.png)

<p align="center">首页 / 三栏阅读视图</p>

![FeedFuse AI 解读阅读视图](./.github/assets/readme/ai-read.png)

<p align="center">AI解读阅读视图</p>

## 开源协议

FeedFuse 采用 [GNU Affero General Public License v3.0](./LICENSE) 开源。

## 社区支持

你可以在这些社区里提问，或者分享你对 FeedFuse 的想法和需求。

[LinuxDo](https://linux.do/)
