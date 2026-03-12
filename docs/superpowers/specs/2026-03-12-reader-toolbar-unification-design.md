# Reader 中右栏工具条统一设计

- 日期：2026-03-12
- 状态：已确认
- 需求：统一右栏设置按钮与中栏顶部图标按钮的样式；将 `AI 摘要`、`翻译`、`抓取全文`、`收藏` 一并移动到右栏顶部；桌面端统一为只显示图标并通过 tooltip 展示中文提示；中栏顶部图标也统一接入同一套 tooltip；移动端保持现状不改。

## 背景

当前 reader 的中栏与右栏操作入口分散，已经形成三套不同的表达：

- 中栏顶部 `src/features/articles/ArticleList.tsx` 已经使用紧凑的 icon-only `Button`，但主要依赖 `title`，没有统一接入 shadcn `Tooltip`
- 右栏 `src/features/articles/ArticleView.tsx` 仍把 `收藏 / 抓取全文 / 翻译 / 生成摘要` 放在文章标题下方，使用带文字的按钮行
- 桌面端设置入口 `src/features/reader/ReaderLayout.tsx` 以悬浮按钮形式固定在右上角，与中栏顶部和右栏正文按钮不属于同一视觉层级

同时，项目中已有两个直接相关的约束：

- `src/components/ui/tooltip.tsx` 已经提供 shadcn / Radix Tooltip 封装，可直接复用，不需要另起一套气泡组件
- `docs/summaries/2026-03-11-accessible-name-token-leak.md` 已确认图标按钮必须保留中文 `aria-label`，不能把 tooltip 当作语义名称来源

因此，这次设计的重点不是简单“换图标”，而是把 reader 工具条统一到一套结构、视觉和可访问性规则中。

## 目标

- 统一桌面端中栏与右栏顶部工具条的视觉语言和交互节奏
- 将右栏文章动作统一收口到固定顶栏，正文滚动时仍可见
- 统一图标按钮的 tooltip 机制，显示中文提示并与当前主题保持一致
- 保留中文 `aria-label`、`aria-pressed`、disabled 等可访问性语义
- 控制改动范围，不把这次需求扩展为阅读器整体布局重构

## 非目标

- 不修改移动端和平板窄屏当前顶栏结构与交互
- 不改动 `收藏`、`抓取全文`、`翻译`、`生成摘要` 的业务判断和后端流程
- 不重做摘要卡片、错误提示、重试按钮等正文区内容块
- 不在本轮抽象完整的 `ReaderPaneHeader` 通用布局组件

## 已确认输入

- 顶栏位置：右栏动作放到固定顶栏，正文滚动时始终可见
- 动作范围：`收藏`、`抓取全文`、`翻译`、`生成摘要` 全部迁移到右栏顶部
- 响应式边界：移动端保持当前结构不改；统一方案只在桌面端落地
- tooltip 语言：统一使用中文提示
- 主题要求：优先复用现有 shadcn Tooltip，保证与当前整体主题一致

## 备选方案

### 方案 A：仅在两个页面内局部改 class

做法：

- 直接在 `ArticleList` 和 `ArticleView` 分别包一层 Tooltip
- 右栏新增固定顶栏，但不抽共享按钮原语

优点：

- 改动最小
- 实现速度快

缺点：

- 中栏和右栏仍各自维护按钮、tooltip、激活态 class
- 后续新增图标动作时容易再次漂移

### 方案 B：抽共享 reader 图标工具按钮原语，再改桌面端右栏结构（推荐）

做法：

- 新增一个薄的共享按钮封装，例如 `ReaderToolbarIconButton`
- 统一处理 `Button`、`Tooltip`、中文 `aria-label`、`aria-pressed`、disabled 与 loading 状态
- 中栏顶部与右栏顶部都复用它
- 桌面端右栏新增固定顶栏，桌面端设置按钮并入右栏顶栏

优点：

- 最符合“统一样式”的目标
- 将 tooltip 与可访问性约束集中，后续更容易复用
- 结构改动可控，不会演变为 reader 全量重构

缺点：

- 比纯局部改动多一层整理成本

### 方案 C：顺手抽完整 pane header 体系

做法：

- 为中栏和右栏都抽完整 `ReaderPaneHeader`
- 连同标题、布局、按钮组与空态一并统一

优点：

- 一致性最高

缺点：

- 会把这次需求扩大为布局重构
- 改动面和回归面都明显增加

## 推荐方案

采用方案 B：抽共享 reader 图标工具按钮原语，再改桌面端右栏固定顶栏。

理由：

- 能同时解决“图标按钮样式统一”“tooltip 统一”“设置按钮并层”“右栏动作固定可见”四个问题
- 能把中文可访问名称和 tooltip 规范一起收口，避免后续重复散落
- 不会把需求升级成高风险的 reader 整体布局改造

## 已确认设计

### 1. 结构与组件边界

桌面端 reader 结构调整为：

- 中栏：继续保留现有 `h-12` 顶部栏位与文章列表结构
- 右栏：改为“固定顶栏 + 可滚动正文”两层结构
- 桌面端原本悬浮在右上角的设置按钮移入右栏顶栏，不再单独悬浮

组件边界上，建议新增一个很薄的共享原语，例如 `ReaderToolbarIconButton`，职责只做以下几件事：

- 统一 icon-only `Button` 的尺寸、颜色和激活态样式
- 统一包裹 shadcn `Tooltip`
- 统一要求中文 `aria-label`
- 透传 `disabled`、`aria-pressed`、`onClick`、`className` 等必要状态

该组件不承载任何业务逻辑，也不负责不同按钮的状态判断；业务条件仍留在 `ArticleList` 和 `ArticleView`。

为避免实现时再次把职责拆散，组件所有权明确如下：

- 桌面端右栏新顶栏放在 `src/features/articles/ArticleView.tsx` 内部
- `ArticleView` 继续持有文章动作、标题展示、滚动容器和摘要/翻译状态块
- `ReaderLayout` 只负责外层三栏布局，并移除桌面端原有的悬浮设置按钮与 floating title 组合逻辑
- 平板与手机分支继续沿用 `ReaderLayout` 当前的非桌面结构，不把桌面端右栏 header 方案外溢到非桌面布局

### 2. 桌面端顶栏布局

右栏新增的固定顶栏建议与中栏保持同一节奏：

- 高度与中栏顶部保持同档，维持 reader 内部一致的工具层级
- 左侧放当前文章标题的截断文本，承担“滚动时持续显示当前上下文”的职责
- 右侧放图标按钮组

标题行为需要保留现有桌面端 floating title 的能力，避免无意回归：

- 若当前文章存在 `link`，顶栏标题继续作为外链，可打开原文
- 若当前文章没有 `link`，顶栏标题按静态文本展示
- 仅替换展示位置，不移除“滚动后仍可从顶栏打开原文”的能力

右栏按钮顺序建议为：

- `收藏`
- `抓取全文`
- `翻译`
- `生成摘要`
- `打开设置`

布局上将前四个视为“文章动作”，设置按钮视为“全局入口”，但第一版不额外引入复杂分组容器，只通过间距表达层级。

无选中文章时：

- 顶栏继续存在，避免右栏高度和边框结构跳动
- 左侧标题显示空态提示，例如“选择文章后可查看内容”
- 右侧仅保留仍然有意义的动作；文章相关按钮根据无选中状态自然 disabled

### 3. 正文区变化与滚动关系

正文区保留当前的大标题、来源信息、摘要卡片、翻译内容、错误提示与重试块。

仅移除正文标题下方现有的四个文字按钮：

- `收藏`
- `抓取全文`
- `翻译`
- `生成摘要`

滚动相关的明确取舍：

- 桌面端因为右栏固定顶栏已经持续显示当前文章标题，不再需要额外的 `reader-floating-title`
- 移除桌面端 floating title 可以避免它与新顶栏标题在滚动时重复出现
- 移动端和平板窄屏保持当前结构，不修改顶栏和文章区关系

### 4. 按钮视觉与 tooltip 规则

统一按钮规则：

- 使用 icon-only 形式，不显示可见文字
- 视觉密度与中栏现有顶部按钮一致
- 默认使用 muted 前景色与轻量 ghost 风格
- 选中/激活态继续沿用当前 reader 已在用的 `bg-primary/10 + text-primary` 体系

tooltip 规则：

- 统一复用 `src/components/ui/tooltip.tsx`
- 中栏顶部与右栏顶部所有图标按钮都使用同一套 tooltip 逻辑
- tooltip 内容统一使用中文动作文案，例如“刷新全部订阅源”“标记全部为已读”“生成摘要”
- 去掉这些按钮上的原生 `title`，避免浏览器 tooltip 与 Radix tooltip 叠加
- tooltip 风格保持现有 shadcn 主题，不额外定制另一套配色语言

### 5. 可访问性与状态表达

图标按钮继续保留中文 `aria-label`，tooltip 只是视觉提示，不能替代语义名称。

状态表达保持现有业务判断，不改规则，只改入口位置与样式：

- `收藏` 使用 `aria-pressed` 和激活态底色表达当前状态
- `抓取全文`、`生成摘要` 在进行中可显示 loading 图标或旋转态
- `翻译` 是否可用仍由现有 `bodyTranslationEligible` 等条件决定
- 无选中文章时，文章相关按钮保持 disabled

需要特别处理 disabled tooltip：

- 不能把 tooltip 直接依赖在 disabled `button` 本身上
- 共享按钮原语应提供一个可悬停的触发包裹层，确保 disabled 时桌面端仍能显示 tooltip
- 真正的 disabled 语义仍落在内部 `button` 上，不能为了显示 tooltip 破坏无障碍与交互语义

### 6. 影响范围

预期主要改动文件：

- `src/features/articles/ArticleList.tsx`
- `src/features/articles/ArticleView.tsx`
- `src/features/reader/ReaderLayout.tsx`
- `src/components/ui/tooltip.tsx` 或新的 reader 共享按钮文件

如果新增共享组件，建议将它放在 reader feature 内部，而不是直接升级为全局通用 UI 原语。原因是它仍然带有明显的 reader 场景语义，当前复用边界只覆盖 reader 中栏与右栏。

### 7. 风险与防护

主要风险：

- 右栏新增固定顶栏后，桌面端正文可用高度变化，可能影响现有滚动与截图测试
- 桌面端 floating title 与新顶栏标题职责重叠，若移除逻辑不完整，可能产生双标题或测试回归
- disabled 按钮接 tooltip 时若实现不当，容易破坏 `button` 语义或 hover 行为
- 中栏从 `title` 切到 Radix tooltip 后，测试需要从 DOM 属性断言转向真实交互断言

对应防护：

- 将桌面端与移动端逻辑按 breakpoint 明确分支，避免“一套结构同时兼顾所有端”
- 用单独测试覆盖“桌面端无 floating title、移动端保留现状”
- 为共享 reader 工具按钮增加最小单测，锁住 `aria-label`、pressed、disabled 与 tooltip 行为
- 保留现有业务 handler，不在这次顺手改 API 调用链或状态机

### 8. 验证策略

至少补齐以下验证：

- `src/features/articles/ArticleList.test.tsx`
  - 中栏顶部按钮都使用统一 tooltip
  - 中文 `aria-label` 保持不变
  - 激活态按钮仍能表达 `aria-pressed`
- `src/features/articles/ArticleView.aiSummary.test.tsx` 或 `src/features/articles/ArticleView` 相关测试
  - 桌面端右栏出现固定顶栏
  - 正文标题下方原有四个文字按钮不再出现
  - 顶栏中的 `生成摘要`、`翻译`、`抓取全文`、`收藏` 仍按原条件工作
- `src/features/reader/ReaderLayout.test.tsx`
  - 桌面端不再渲染单独悬浮设置按钮
  - 桌面端滚动后不再使用 `reader-floating-title`
  - 移动端顶栏结构保持现状

若新增共享 `ReaderToolbarIconButton`，建议补一个独立单测，专门锁住：

- tooltip 显示中文提示
- disabled 态仍能展示 tooltip
- `aria-label` 与 `aria-pressed` 正确透传

## 结论

本轮采用“共享 reader 图标工具按钮原语 + 桌面端右栏固定顶栏”的方式统一中右栏工具条。

这样既能保持与当前主题一致的 shadcn tooltip 风格，又能把中文可访问名称、桌面端滚动上下文和右栏操作入口统一到同一套设计语言中；同时将响应式范围明确限制在桌面端，避免把移动端一起卷入不必要的结构调整。
