# 全站基础交互件扁平化设计

- 日期：2026-03-12
- 状态：已确认
- 需求：将全站基础交互件统一为左栏、中栏当前的扁平风格，覆盖 `Button`、`Input`、`Select`、`Textarea`、`Switch`、`Tabs`、`Badge` 及少量局部按钮样式；弱化边框，移除阴影，依靠底色、文字和状态表达层级，并统一控件密度。

## 背景

当前交互件的视觉语言不一致，主要表现在三类地方：

- 共享基础组件自带立体感：`src/components/ui/button.tsx`、`src/components/ui/input.tsx`、`src/components/ui/select.tsx`、`src/components/ui/switch.tsx`、`src/components/ui/tabs.tsx`、`src/components/ui/badge.tsx` 均存在 `shadow-sm` 或更强的阴影表达
- 阅读器右栏动作按钮仍走厚重按钮风格：`src/features/articles/ArticleView.tsx` 的 `收藏 / 抓取全文 / 翻译 / 生成摘要` 额外使用了 `hover:shadow-md`
- 局部直接手写样式仍沿用旧的输入视觉：`src/features/feeds/FeedKeywordFilterDialog.tsx` 与 `src/features/settings/panels/RssSettingsPanel.tsx` 的 `textarea` 直接写入了 `shadow-sm`
- reader 中仍存在未复用共享 `Button` 的阴影按钮：`src/features/articles/ArticleScrollAssist.tsx` 使用了自定义 `button` 与 `shadow-sm`

这导致左栏、中栏已经趋于扁平，而右栏和部分表单仍然保留明显的“浮起按钮/输入框”观感，不像同一套设计系统。

## 目标

- 统一基础交互件的扁平视觉语言
- 统一交互件的密度与节奏，使 reader 左栏、中栏、右栏观感一致
- 保留清晰的 hover、active、focus、disabled 状态，不因去阴影损伤可用性
- 优先通过共享组件收敛样式，减少页面级重复覆盖

## 非目标

- 不重做 `Dialog`、`Sheet`、`Popover` 等浮层容器本身的表面语言
- 不修改阅读器布局、信息层级或按钮文案
- 不引入新的业务逻辑、交互流程或状态模型
- 不做一次性的大规模设计系统重构，例如新增大量语义化变体或重排所有页面结构

## 已确认输入

- 范围：方案 `B`
  - 覆盖所有基础交互件，并把 `Switch`、`Tabs`、`Badge`、`Textarea` 一起去立体感
- 视觉方向：方案 `B`
  - 去阴影，弱化边框，主要依靠底色和文字状态区分
- 密度策略：方案 `C`
  - 全站基础控件统一密度，包括 `button`、`input`、`select` 的高度和圆角比例
- 设计方案：方案 `1`
  - 先建立一套共享“扁平基线”，再清理右栏和局部偏离样式

## 备选方案

### 方案 A：只删阴影，不重建尺寸与状态体系

优点：

- 改动小，回归风险最低

缺点：

- 只能解决“去立体感”，不能解决“像不像同一套系统”
- 右栏按钮、输入类控件和设置面板的密度仍会割裂

### 方案 B：建立共享扁平基线，再回收局部偏离样式（推荐）

做法：

- 在共享组件层去阴影、弱边框、统一状态语言与密度
- 让阅读器右栏按钮、共享 `Textarea`、少量直接写死的交互件重新对齐共享基线

优点：

- 边界清晰，收益集中
- 能同时解决“视觉扁平化”和“密度统一”
- 后续新页面默认继承，不需要持续补丁

### 方案 C：顺手把交互件彻底语义化重构

优点：

- 长期最干净

缺点：

- 范围明显扩大
- 本轮目标会从“基础扁平化”膨胀为“设计系统重构”

## 推荐方案

采用方案 B：建立共享扁平基线，再清理局部偏离样式。

理由：

- 与本轮“统一基础组件视觉语言”的目标最匹配
- 能覆盖 reader 左栏、中栏、右栏当前最明显的不一致点
- 不会把任务升级成一次高风险的大重构

## 已确认设计

### 1. 设计原则与视觉基线

本轮扁平化不是简单删除 `shadow-*`，而是把基础交互件统一到一套明确的平面交互规则：

- 不再依赖阴影表达交互层级
  - 去掉基础交互件上的 `shadow-sm`
  - 去掉局部按钮上的 `hover:shadow-md`
  - 使用底色、文字色和边框对比表达 hover / active / selected
- 边框降权但不消失
  - `Input`、`Select` trigger、`Textarea` 保留轻边框，避免录入边界消失
  - `Button` 不再依赖厚边框和阴影“站起来”
- 保留可访问的 focus 反馈
  - 继续保留 `focus-visible:ring-*` 作为键盘焦点表达
  - 不以去立体感为代价牺牲键盘可用性
- 状态统一表达
  - 默认态：低对比、轻底色或透明底
  - hover：提高底色而不是增加阴影
  - active / selected / pressed：使用 `bg-primary/10 + text-primary` 一类组合表达
  - disabled：继续通过低不透明度表达

### 2. 密度与尺寸规则

全站统一密度，但不把所有控件压成完全相同高度；改为统一“两档基线”：

- `compact`
  - 面向 reader 顶部工具条、左栏/中栏图标按钮、右栏动作按钮等高频紧凑操作
- `default`
  - 面向表单输入、设置页常规按钮、对话框表单操作

统一原则：

- 控件圆角比例收敛到同一档，不再各自漂移
- 文本优先使用 `text-sm`
- 同类控件的内边距与图标间距遵循同一节奏

明确取舍：

- 不把表单输入框压缩成和工具按钮同一高度
- 不把右栏文本动作按钮退化成纯 icon button
- 统一的是密度体系和状态语言，而不是所有控件绝对同高

### 3. 组件级落点

#### `Button`

- `default`、`secondary`、`outline` 去掉基础阴影
- `default` 保留主操作语义，但回归纯平面主色按钮
- `secondary` 作为阅读器右栏动作按钮的主要承载样式
- `outline` 保留“次级操作”语义，但弱化描边权重，不再表现为凸起按钮
- `ghost` 继续作为左栏、中栏轻操作样式
- 尺寸上统一到两档密度，避免右栏按钮显得比左/中栏更厚重

#### `Input`

- 去掉基础阴影
- 保留轻边框与 focus ring
- 与 `SelectTrigger` 对齐高度、圆角与内边距节奏

#### `Select`

- `SelectTrigger` 按输入基线扁平化：去阴影、弱边框、统一密度
- `SelectContent` 作为浮层表面，仍按浮层语义处理，不把这次任务扩展为浮层容器重做

#### `Switch`

- 去掉轨道和 thumb 的立体阴影表达
- 保留清晰的开/关结构，通过颜色和位移区分状态

#### `Tabs`

- 去掉 active tab 依赖的 `shadow-sm`
- active 状态改为通过底色和前景色提升表达，呈现更平面的 segmented control 感

#### `Badge`

- 去掉阴影
- 保留语义色，但让它更像信息标签而非悬浮按钮

#### `Textarea`

- 新增共享 `Textarea` 基础组件，作为与 `Input` / `SelectTrigger` 平级的输入原语
- `Textarea` 的职责仅限于提供统一的平面输入视觉、焦点态和密度，不承载业务语义
- 现有直接手写 `textarea` 的页面迁移到共享 `Textarea`，避免继续在页面里复制 class
- 已确认的迁移落点包括：
  - `src/features/feeds/FeedKeywordFilterDialog.tsx`
  - `src/features/settings/panels/RssSettingsPanel.tsx`

### 4. 页面级偏离点收敛

共享基础组件改平后，还需要清理已知的页面级偏离点，避免“基础层已经统一，局部仍显旧”：

- `src/features/articles/ArticleView.tsx`
  - 移除 `收藏 / 抓取全文 / 翻译 / 生成摘要` 上的 `transition-shadow hover:shadow-md`
  - 继续复用共享 `Button`
  - 让右栏动作按钮回到与 reader 其余交互一致的平面语言
- `src/features/articles/ArticleScrollAssist.tsx`
  - 去掉自定义按钮上的 `shadow-sm`
  - 保留其悬浮位置、圆形形态与阅读进度语义，但视觉语言对齐 reader 其他扁平按钮
- `src/features/settings/SettingsCenterDrawer.tsx`
  - 处理 `data-[state=active]:shadow-sm` 造成的激活态凸起感
  - 激活状态改由底色、边框和文字强调承担

原则上只处理“共享基线没有自动覆盖、且当前确实破坏全站一致性”的偏离点，不顺带做结构性重写。

### 5. 实施顺序

建议按两层推进：

1. 先改共享基础组件
   - `src/components/ui/button.tsx`
   - `src/components/ui/input.tsx`
   - `src/components/ui/select.tsx`
   - `src/components/ui/textarea.tsx`
   - `src/components/ui/switch.tsx`
   - `src/components/ui/tabs.tsx`
   - `src/components/ui/badge.tsx`
2. 再补页面级偏离点
   - `src/features/articles/ArticleView.tsx`
   - `src/features/articles/ArticleScrollAssist.tsx`
   - `src/features/settings/SettingsCenterDrawer.tsx`
   - `src/features/feeds/FeedKeywordFilterDialog.tsx`
   - `src/features/settings/panels/RssSettingsPanel.tsx`

这一顺序可以先建立稳定基线，再用最小补丁清理局部例外，降低回归范围。

### 6. 风险与防护

主要风险：

- 去阴影后层次不足，按钮看起来像普通文本块
- 统一密度过度，导致表单录入区过于紧凑
- 基础组件已修改，但局部手写 class 或自定义按钮仍保留旧风格，导致“半统一”

防护策略：

- 通过轻底色、文字色和边框层级维持交互可辨识度
- 维持 `compact` / `default` 两档密度，不强行同高
- 在实现中显式清理已知偏离点，而不是假设共享组件会自动覆盖全部场景

### 7. 测试与验收

#### 共享组件回归

- 更新或补充 `ui` 级测试，锁定基础交互件不再包含阴影类
- 确保 `Switch`、`Tabs`、`Badge` 在去阴影后仍保留清晰的状态差异

#### 页面回归

- 更新 `ArticleView` 相关测试，移除对 `hover:shadow-md` 的旧断言，改为验证新的平面状态类或共享样式结果
- 更新 `ArticleScrollAssist` 相关测试，移除对阴影按钮视觉的旧预期
- 为共享 `Textarea` 及其迁移点补最小必要断言，避免旧 class 回归

#### 验收口径

- 左栏、中栏、右栏按钮不再出现明显悬浮投影感
- 表单录入控件仍有清晰边界和焦点状态
- 键盘 `focus-visible` 体验不退化
- disabled、selected、pressed 等状态仍可辨认

## 后续步骤

本设计确认后，下一步仅进入实现计划编写，不直接开始编码。实现计划需要进一步明确：

- 共享组件每个变体的具体 class 调整策略
- `compact` 与 `default` 两档密度如何映射到现有 `size`
- 共享 `Textarea` 的 API 是否完全对齐原生 `textarea` props
- 哪些现有测试需要更新、哪些应新增
