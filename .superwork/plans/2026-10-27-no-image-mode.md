# Feature Implementation Plan

**Goal:** 在通用设置中添加无图片模式，正文图片默认显示小占位，仅在用户点击后加载。

**Suggested Spec Reads:**

- `.superwork/spec/frontend/contracts.md` — 沿用设置自动保存和正文交互契约。
- `.superwork/spec/frontend/quality-guidelines.md` — 验证键盘和正文交互。
- `.superwork/spec/backend/contracts.md` — 同步设置写入校验。
- `.superwork/spec/shared/quality.md` — 保持跨层设置类型一致。
- `.superwork/spec/guides/verification.md` — 执行项目检查。

**Architecture:** 新增 `GeneralSettings.noImageMode`，沿用现有设置持久化。在正文写入 DOM 前将 img/picture 替换为小占位，将原始节点保存在惰性的 template 中，点击或键盘激活时还原单张图片；沿用重试及大图预览。

**Tech Stack:** TypeScript、React、Zustand、Zod、Vitest、pnpm。

## Global Constraints

- 设置默认关闭；读取历史配置时补齐默认值，PUT 严格校验布尔值。
- 不修改正文源数据、导出内容和列表缩略图；覆盖原文、全文刷新与翻译正文。
- 不通过 CSS 隐藏图片冒充阻止请求；img.srcset 和 picture.source 均需保持惰性。
- 中文注释说明关键执行逻辑；保持用户原有改动。
- 使用 Python3；脚本使用 `PATH=/opt/homebrew/opt/python@3.14/libexec/bin:$PATH` 以提供 tomllib。
- 协作登记：id `no-image-mode-20261027`，owner `codex-no-image-20261027`，recordPath `.superwork/parallel/no-image-mode-20261027.json`。

### Task 1: 添加可保存的无图片模式设置

**Files:**

- Modify: `src/types/index.ts`
- Modify: `src/features/settings/settingsSchema.ts`
- Modify: `src/server/domains/settings/settingsWriteSchema.ts`
- Modify: `src/features/settings/panels/GeneralSettingsPanel.tsx`
- Test: `src/test/features/settings/settingsSchema.test.ts`
- Test: `src/test/features/settings/SettingsCenterModal.test.tsx`
- Test: `src/test/app/api/settings/routes.test.ts`

**Interfaces:**

- Consumes: `GeneralSettings`
- Consumes: `SettingsDraft`
- Produces: `GeneralSettings.noImageMode`

**Behavior:**

- 默认关闭，旧配置和非法旧值回退关闭；打开后通过现有自动保存持久化，服务端接受布尔值并返回保存结果。

**Stop Conditions:**

- 设置自动保存机制与现有契约不一致时先修正规划。

- [x] **Task Status:** completed

Run: `pnpm test:unit src/test/features/settings/settingsSchema.test.ts src/test/features/settings/SettingsCenterModal.test.tsx src/test/app/api/settings/routes.test.ts`

Expected: 设置默认值、开关自动保存与 API 请求校验测试通过。

### Task 2: 将正文图片改为点击加载的小占位

**Files:**

- Create: `src/features/articles/utils/articleImageLoading.ts`
- Modify: `src/features/articles/components/ArticleView.tsx`
- Test: `src/test/features/articles/ArticleView.imagePreview.test.tsx`
- Test: `src/test/features/articles/ArticleView.aiTranslate.test.tsx`

**Interfaces:**

- Consumes: `GeneralSettings.noImageMode`
- Produces: `deferArticleImages`
- Produces: `loadArticleImagePlaceholder`

**Behavior:**

- 开启后所有 img/picture 在 DOM 挂载前变为紧凑占位，原始图片保存在 template 中，不暴露可请求的图片节点。
- 点击、Enter 或空格只还原目标图片；链接包裹图片首次操作仅加载，后续恢复链接行为。
- 原文、全文刷新、翻译和新文章均走同一渲染入口；关闭后恢复自动加载；无关重渲染保留已加载图片。

**Stop Conditions:**

- 若正文存在绕过共同渲染入口的图片，先扩展计划并核对范围。

- [x] **Task Status:** completed

Run: `pnpm test:unit src/test/features/articles/ArticleView.imagePreview.test.tsx src/test/features/articles/ArticleView.aiTranslate.test.tsx`

Expected: 占位、单张加载、键盘、链接、切换设置与图片预览回归通过。

## Verification Evidence

- 所有命令均在 `/Users/bryanhu/Develop/person/FeedFuse` 执行；Node v24.19.0、pnpm 10.30.3，未变更依赖或环境配置。
- Task 1 RED：计划中的设置定向测试首次退出 1，失败为字段缺失、API 拒绝新字段和开关缺失；GREEN 同一命令退出 0，80 项通过。后续仅正文相关代码变化，因此该设置证据可复用，最终全量测试亦再次覆盖。
- Task 2 RED：图片定向测试首次退出 1，7 项因仍渲染真实图片而失败；补充 HTML 中间解析的 RED 后确认存在提前传入图片来源的问题。调整为在翻译、加粗和高亮之前转换图片。
- Task 2 最终 GREEN：计划中的图片与翻译定向命令退出 0，36 项通过；覆盖 srcset/picture、逐张加载、键盘焦点、链接保护、刷新正文、切换文章/模式、预览、重试及流式翻译。后续没有代码修改。
- 简化结果 changed：共用 `prepareArticleImagePreview`，展开焦点恢复表达式；定向 GREEN 与后续全量验证覆盖最终代码。
- 最终 `pnpm test:unit` 退出 0：249 个测试文件通过、7 个跳过；1530 项通过、28 项按现有数据库等环境条件跳过。日志 `/tmp/feedfuse-no-image-unit.log`。
- 最终 `pnpm build` 退出 0，编译、构建内 TypeScript 检查和页面生成通过。日志 `/tmp/feedfuse-no-image-build.log`。
- `pnpm type-check && pnpm lint` 在构建结束后退出 0。此前同时运行 type-check 和 build 曾遇到 `.next/types/cache-life.d.ts` 被构建重建，已等待构建完成后串行重跑并通过。
- Chromium 使用实际图片工具的隔离网络验证：初始 2 个占位、0 个图片节点、0 个图片请求；点击第一张后仅 `/a2.svg` 一个请求；Enter 加载第二张后新增 `/wide.svg`，焦点交给第二张的预览入口。浏览器工作区已关闭，临时验证服务器已停止。浏览器测试没有覆盖完整应用的真实数据库场景；组件和 API 联动由自动化测试覆盖。
- Spec decision update：在 `.superwork/spec/frontend/contracts.md` 记录长期无图片模式契约，该文档已有前端索引入口。无新增 API、迁移或队列。
- 共享影响：新增必填布尔设置 `general.noImageMode`；历史读取默认关闭，PUT 完整替换严格校验，沿用用户作用域存储。原文/全文/翻译共用图片惰性转换；原始文章数据及导出不变。
- 最终 `git diff --check` 通过；计划 preflight 和规范路径检查通过。保留开始前已有的 `.superwork/config.json` 和协作文件改动。
