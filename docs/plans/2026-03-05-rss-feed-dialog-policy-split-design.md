# 设计文档：RSS 源新增/编辑精简与策略弹窗拆分

## 1. 背景

当前 `FeedDialog` 同时承载“RSS 源基础信息编辑”和“AI/翻译策略配置”，导致表单过长、操作意图混杂，用户在新增/编辑时需要处理大量与基础录入无关的开关。

结合近期已完成的订阅源级触发策略能力（`on_fetch` / `on_open`），需要将基础信息与策略配置在交互层彻底分离。

## 2. 目标与范围

### 2.1 目标

1. 新增/编辑 RSS 源主弹窗只保留三项：`URL`、`名称`、`分类`。
2. 在 RSS 源右键菜单新增 `AI摘要配置` 与 `翻译配置` 两项。
3. 点击右键项仅打开配置弹窗，配置为长期策略，不触发即时任务。
4. `AI摘要配置` 使用 2 个 `Switch`：
   - `aiSummaryOnFetchEnabled`
   - `aiSummaryOnOpenEnabled`
5. `翻译配置` 使用 3 个 `Switch`：
   - `titleTranslateEnabled`
   - `bodyTranslateOnFetchEnabled`
   - `bodyTranslateOnOpenEnabled`
6. 保留主弹窗 URL 验证与名称自动回填能力。
7. 对历史字段 `bodyTranslateEnabled` 进行迁移收敛到 `bodyTranslateOnOpenEnabled`。

### 2.2 非目标

1. 不改动文章页手动触发按钮逻辑与 `force` 机制。
2. 不改动 worker 的自动触发引擎与任务队列模型。
3. 不新增全局 AI 参数（模型、语言等）配置。
4. 不在右键菜单提供快捷切换（仅通过弹窗配置）。

## 3. 已确认交互决策

1. 主弹窗继续使用单组件结构（不拆 Add/Edit 组件结构）。
2. 右键菜单仅负责打开配置弹窗，不直接提供快捷开关。
3. `AI摘要配置` 使用两项 `Switch`。
4. `翻译配置` 使用三项 `Switch`。
5. 主弹窗保留 URL `blur` 验证 + 名称自动回填。
6. 旧字段处理采用迁移策略，不做简单保留或强制清零。

## 4. 方案与取舍

采用方案：**保持现有 `FeedDialog` 主体用于基础信息 + 新增两个策略弹窗**。

原因：

1. 与当前诉求一一对应，避免把主弹窗继续做成“万能配置面板”。
2. 改造范围集中在 `src/features/feeds`，回归面可控。
3. 不触发已稳定的文章任务链路与翻译渲染链路回归风险。

## 5. 架构设计

### 5.1 组件层

1. 主弹窗：`FeedDialog`
   - 保留字段：`url`、`title`、`categoryId`
   - 移除所有策略类控件。
2. 右键菜单入口：`FeedList`
   - 新增菜单项：`AI摘要配置`、`翻译配置`。
3. 新弹窗：
   - `FeedSummaryPolicyDialog`（2 个 `Switch`）
   - `FeedTranslationPolicyDialog`（3 个 `Switch`）

### 5.2 数据流

1. 主弹窗提交 patch 仅包含基础字段。
2. `AI摘要配置` 提交 patch 仅包含：
   - `aiSummaryOnFetchEnabled`
   - `aiSummaryOnOpenEnabled`
3. `翻译配置` 提交 patch 仅包含：
   - `titleTranslateEnabled`
   - `bodyTranslateOnFetchEnabled`
   - `bodyTranslateOnOpenEnabled`
4. 所有保存均通过 `useAppStore.updateFeed` -> `patchFeed` -> `PATCH /api/feeds/:id`。

### 5.3 迁移策略（旧字段到新字段）

针对历史数据 `bodyTranslateEnabled`：

1. 当 `feed.bodyTranslateOnOpenEnabled` 明确为 `true` 时，优先使用新字段。
2. 当 `feed.bodyTranslateOnOpenEnabled` 为 `false` 且 `feed.bodyTranslateEnabled` 为 `true` 时：
   - 在翻译策略弹窗初始化时，将 `bodyTranslateOnOpenEnabled` 初始视图值视为 `true`。
3. 保存后只写新字段，不再写 `bodyTranslateEnabled`。
4. 迁移逻辑幂等：一旦新字段被显式保存，旧字段不再影响后续展示。

## 6. UI/UX 设计原则（frontend-design 对齐）

本次不做视觉风格重设计，重点是信息结构与交互效率，遵循以下原则：

1. 基础信息与策略配置分区明确，减少认知负担。
2. 两项/三项策略统一使用 `Switch`，确保“一眼看懂 + 一次点击”。
3. 弹窗文案明确“仅保存自动触发策略，不会立即批量执行”。
4. 使用 shadcn 组件体系保持一致性；若缺少 `Switch` 组件则按 shadcn 标准补齐。

## 7. 错误处理

1. 主弹窗：沿用既有 URL 验证状态机（`idle/validating/verified/failed`）。
2. 策略弹窗：
   - 保存中禁用重复提交；
   - 保存失败保留当前改动并展示错误；
   - 保存成功 toast 提示并关闭弹窗。
3. 弹窗仅做配置保存，不调用任务触发 API。

## 8. 测试设计

### 8.1 前端测试

1. `FeedList.test.tsx`
   - 右键菜单新增项渲染验证。
   - 点击后对应弹窗打开验证。
2. `AddFeedDialog.test.tsx`
   - 主弹窗仅含三项字段验证。
3. 策略弹窗测试（新增或重构现有测试）
   - `AI摘要配置` 两项提交 patch 验证。
   - `翻译配置` 三项提交 patch 验证。
   - `bodyTranslateEnabled` 迁移初始化验证。

### 8.2 Store/API 回归

1. `appStore` 局部 patch 更新不回归。
2. `patchFeed` 局部字段序列化正确，不回写旧字段。

## 9. 风险与缓解

1. 风险：主弹窗字段缩减可能造成旧测试大量失效。
   - 缓解：先改测试断言，再最小实现代码。
2. 风险：旧字段迁移逻辑导致误覆盖。
   - 缓解：仅在翻译策略弹窗初始化进行一次性映射；提交仅写新字段。
3. 风险：新增弹窗后右键交互复杂度上升。
   - 缓解：菜单分组与文案简洁，避免增加快捷子菜单。

## 10. 验收标准

1. 新增/编辑主弹窗只出现 `URL`、`名称`、`分类`。
2. 右键新增 `AI摘要配置`、`翻译配置`，点击仅打开弹窗。
3. `AI摘要配置` 两项 `Switch` 可保存并正确持久化。
4. `翻译配置` 三项 `Switch` 可保存并正确持久化。
5. 旧字段 `bodyTranslateEnabled` 在迁移窗口内能正确映射到 `bodyTranslateOnOpenEnabled`。
6. URL 验证与自动回填名称能力保留。

## 11. 关联总结

1. `docs/summaries/2026-03-05-ai-summary-translation-trigger-strategy-refactor.md`
2. `docs/summaries/2026-03-05-translation-preserve-html-structure.md`
3. `docs/summaries/2026-03-04-async-tasks-refactor.md`
