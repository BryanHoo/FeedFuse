# AI 解读来源 TreeSelect 改造设计（rc-tree-select）

## 1. 背景与目标

当前 `Add AI解读` 弹窗中的“来源”字段采用两列 checkbox（RSS 源、分类）实现。该交互在可发现性、层级语义和多选效率上与用户预期存在差距。  
本次目标是在不改变核心业务能力的前提下，将来源选择改为社区成熟组件 `rc-tree-select`，并适配 FeedFuse 现有 UI 风格与表单提交流程。

## 2. 已确认需求（会话结论）

- 引入 `rc-tree-select`，并改造成现有 UI 风格。
- 勾选关系采用父子联动（分类与子 RSS 自动联动）。
- 后端仅接受 RSS 源 ID：只保留 `selectedFeedIds`。
- `AI解读源` 不可选：在来源树中直接过滤不显示。
- 所有分类可勾选；空分类不显示。
- 输入框不显示分类名，只显示选中的 RSS 源名称。
- 标签固定宽度，最多一排，超出显示 `...(+N)`。
- 启用搜索（分类名 + RSS 名称）。
- 接口兼容策略采用严格模式：若出现 `selectedCategoryIds`，直接返回 400。
- 旧配置处理策略采用破坏性策略：不迁移旧 `selected_category_ids`，历史依赖该字段的配置失效，用户手动重建。

## 3. 方案对比与决策

### 方案 A：`rc-tree-select` 受控联动 + 叶子值提交（采用）

- 构建“分类 -> RSS”两级树，分类可勾选并联动子项。
- 组件内保留联动语义，提交时统一归一化为 `selectedFeedIds`（仅叶子 RSS）。
- 后端 schema 与 service/repo 类型统一为“只接受 RSS 源”。

优点：

- 满足全部交互目标。
- 业务语义清晰，前后端契约收敛。
- 可测试性高（映射逻辑与 UI 可独立验证）。

代价：

- 需要新增“联动结果 -> RSS 叶子集合”的归一化逻辑与测试。

### 方案 B：组件原值直通 + 提交前过滤（不采用）

优点：实现速度快。  
缺点：联动/半选场景值语义不稳定，容易引入边界 bug。

### 方案 C：引入 `antd` 全量 `TreeSelect`（不采用）

优点：行为与 Ant Design 文档最接近。  
缺点：样式体系侵入大、依赖体积增长明显，不符合当前 UI 技术栈轻量化方向。

## 4. 设计详情

### 4.1 前端组件边界

新增组件：

- `src/features/feeds/AiDigestSourceTreeSelect.tsx`

职责：

- 封装 `rc-tree-select` 的树数据构建、联动值归一化、搜索、标签渲染与样式适配。

输入：

- `categories: Category[]`
- `feeds: Feed[]`
- `selectedFeedIds: string[]`
- `onChange: (nextSelectedFeedIds: string[]) => void`
- `error?: string | null`

输出：

- 仅输出 `selectedFeedIds`（不输出分类节点 ID）。

`AiDigestDialogForm` 调整：

- 移除两列 checkbox UI。
- 接入 `AiDigestSourceTreeSelect` 作为“来源”字段。
- 来源字段错误展示保持现有文案通道。

`useAiDigestDialogForm` 调整：

- 删除 `selectedCategoryIds` state 与 toggle handler。
- 提交 payload 仅保留 `selectedFeedIds`。
- “至少一个来源”校验基于 `selectedFeedIds.length > 0`。

### 4.2 树数据模型与过滤规则

树节点规则：

- 仅显示 `feed.kind === 'rss'` 的叶子节点。
- `feed.kind === 'ai_digest'` 直接过滤，不进入树。
- 分类节点显示全部业务分类（含“未分类”）；但若某分类下没有 RSS 子节点，则不渲染该分类节点。

节点结构建议：

- 分类节点：`value = category:<categoryId>`
- RSS 节点：`value = feed:<feedId>`

归一化策略：

- UI 层可接收含分类节点的勾选反馈。
- 提交前统一筛选 `feed:` 前缀并去前缀，得到 `selectedFeedIds`。
- 去重后按字符串稳定排序（便于测试断言与请求可预测性）。

### 4.3 选择行为与展示行为

选择行为：

- 启用树勾选与父子联动（非 `treeCheckStrictly`）。
- 勾选分类时自动勾选子 RSS；取消分类时自动取消子 RSS。
- 半选态由组件自动展示。

搜索行为：

- 开启 `showSearch`。
- 自定义过滤：分类名和 RSS 名称均可命中。
- 搜索不改变已勾选状态。

标签展示：

- 仅展示 RSS 标签（不展示分类标签）。
- 每个标签固定宽度（例如 `112px`），文本超出省略。
- 通过 `ResizeObserver` 计算单行可容纳标签数，动态设置 `maxTagCount`。
- 使用 `maxTagPlaceholder` 渲染 `...(+N)`。
- 输入框强制单行布局，超出不换行。

### 4.4 UI 风格适配

在不引入 Ant Design 全局主题系统前提下，局部覆盖 `rc-tree-select` 样式：

- 外层输入框对齐现有 `Input` 风格：
  - 边框、圆角、背景、文本、placeholder、focus ring、错误态。
- 下拉面板对齐现有 `Popover/Select` 风格：
  - 面板背景、阴影、边框、滚动条、层级 z-index。
- 节点交互态对齐现有语义 token：
  - hover 使用 `accent` 语义。
  - checked/active 使用 `primary` 语义。
- 暗色模式沿用现有 token，不新增独立配色分支。

### 4.5 API 与后端契约调整

`POST /api/ai-digests` 请求体：

- 保留：`title`, `prompt`, `intervalMinutes`, `selectedFeedIds`, `categoryId|categoryName`
- 移除：`selectedCategoryIds`

校验策略：

- `selectedFeedIds` 至少 1 个。
- 对 `selectedCategoryIds` 采用严格拒绝：
  - 若请求体包含该字段，返回 400 与明确错误信息。
- 请求体采用严格对象校验（拒绝未知字段）：
  - 需使用 `z.strictObject(...)` 或 `z.object(...).strict()`。
  - 目的：确保 `selectedCategoryIds` 不会被静默丢弃，而是显式报错。

服务与仓储类型：

- `createAiDigestWithCategoryResolution` 入参仅保留 `selectedFeedIds`。
- `createAiDigestConfig` 入参仅保留 `selectedFeedIds`（`selected_category_ids` 不再参与新写入）。
- 运行时候选解析链路（tick/generate）统一只读取 `selected_feed_ids`：
  - 全面移除按 `selected_category_ids` 展开 RSS 的逻辑。
  - 从行为上保证历史“仅分类来源”配置不再生效。

### 4.6 旧配置策略（破坏性变更）

明确采用“不迁移、手动重建”：

- 不做历史 `selected_category_ids -> selected_feed_ids` 迁移。
- 历史仅依赖分类选择的 AI 解读配置将失效（候选为空或不再按分类扩展）。
- 通过发布说明提示用户重建相关 AI 解读源。
- 若历史配置“同时包含 feed 与 category”，仅保留 `selected_feed_ids` 的行为。

## 5. 错误处理与空态

- 无可选 RSS 时：
  - 来源字段显示空态文案（例如“暂无可选 RSS 源”）。
  - 禁用“创建 AI 解读源”按钮。
- 提交校验失败：
  - 维持“请至少选择一个来源”字段错误提示。
- 接口拒绝旧字段：
  - 返回结构化字段错误，前端走现有 `mapApiErrorToUserMessage`。

## 6. 测试计划

前端单测：

- 分类勾选联动子 RSS。
- `ai_digest` feed 不出现在树里。
- 空分类不显示。
- 搜索可匹配分类名与 RSS 名称。
- 标签只显示 RSS，且超出显示 `...(+N)`。

表单提交测试：

- payload 仅包含 `selectedFeedIds`。
- 不再传 `selectedCategoryIds`。

API 路由测试：

- 包含 `selectedCategoryIds` 返回 400。
- 仅含合法 `selectedFeedIds` 返回 200。
- `selectedFeedIds` 为空时返回 400。
- 包含任意未知字段时返回 400（严格对象模式生效）。

服务/仓储测试：

- 类型与入参不再依赖 `selectedCategoryIds`。
- 新配置写入仅基于 RSS 选择。

worker/运行时测试：

- 历史仅有 `selected_category_ids` 的配置不会再按分类展开候选。
- 历史同时有 `selected_feed_ids` 与 `selected_category_ids` 时，仅 `selected_feed_ids` 生效。

## 7. 风险与缓解

- 风险：`rc-tree-select` 样式与现有设计系统不一致。  
  缓解：新增局部样式层并补充视觉回归测试。

- 风险：单行标签容量计算在极窄宽度下抖动。  
  缓解：设置最小可见标签数为 1，并在 `ResizeObserver` 中做节流。

- 风险：旧配置失效引发用户困惑。  
  缓解：在发布说明与相关入口提示“需重建来源配置”。

## 8. 验收标准

- 创建弹窗来源字段为树形多选，分类可勾选且联动子 RSS。
- 来源树仅包含 RSS 源；`AI解读源` 不可见不可选；空分类不显示。
- 输入框仅展示 RSS 标签，单行固定宽度，超出显示 `...(+N)`。
- 请求体只提交 `selectedFeedIds`；后端拒绝 `selectedCategoryIds`。
- 相关单元测试与接口测试覆盖通过。
