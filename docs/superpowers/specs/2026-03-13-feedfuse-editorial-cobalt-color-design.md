# FeedFuse 编辑感钴蓝品牌色增强设计

- 日期：2026-03-13
- 状态：已确认
- 需求：以当前 FeedFuse 蓝色品牌为基础，做一轮更有品牌感的色彩增强；方向选择为更成熟的“编辑感钴蓝”，增强力度为高曝光区域与表面层一并收紧，但不改布局结构与交互模型。

## 背景

当前界面已经完成了语义 token 化，主题主要由 `src/app/globals.css` 提供，并通过 `background / foreground / primary / muted / accent / border / overlay` 等 token 驱动 reader、settings、toast 和弹层组件。

但从品牌感看，现状仍有两个明显问题：

- light 与 dark 主题的中性色仍接近通用灰 / slate 体系，和 FeedFuse 当前 logo 的蓝色梯度联系偏弱
- 品牌蓝主要停留在按钮、链接和少数激活态上，没有形成覆盖阅读器 chrome、表面层、浮层和提示块的一整套统一气质

项目里已有几项会直接约束这次设计：

- `src/app/theme-token-usage.contract.test.ts` 已经要求主要功能区优先使用语义 token，而不是直接写 `slate / gray / blue / red` 等原子色
- `src/app/globals-css.contract.test.ts` 已经锁住 `globals.css` 的主题结构、overlay、shadow 和布局变量
- reader、settings、toast、popover、tooltip 已分别拥有各自的表面实现；如果只改全局 token 而不收紧高曝光 surface，风格会继续分裂

因此，这次设计的重点不是“换一组蓝色”，而是把 FeedFuse 从“使用默认蓝色的 RSS 阅读器”，收紧成“具有自有编辑感钴蓝语言的阅读产品”。

## 目标

- 保留 FeedFuse 当前 logo 蓝色家族的识别关系，不脱离现有品牌基础
- 将主色从偏亮工具蓝收紧为更成熟的编辑感钴蓝
- 让中性色、表面层、阴影、overlay 与交互态共同服务同一套品牌气质
- 优先增强用户高频接触区域：reader 三栏 chrome、settings 头部与侧栏、popover、tooltip、toast、按钮层级、阅读区提示块
- 保持现有语义 token 名称和组件结构边界，降低实现和回归风险

## 非目标

- 不新增新的主题模式或品牌配色分支
- 不修改 reader、settings、toast、dialog 等组件的交互模型和信息架构
- 不做页面重布局、重排版或大面积装饰性背景设计
- 不把 `success / warning / error` 语义色收编为品牌蓝
- 不顺手重构 Zustand 状态、服务端逻辑、数据流或 SSR 结构

## 已确认输入

- 设计方向：`B. 编辑感钴蓝`
- 增强力度：`3`，即除 token 外，还收紧高曝光区域、按钮层级、阴影与阅读提示面板
- 风格目标：更成熟、更安定、更像编辑工具，而不是更亮、更跳或更偏青
- 约束边界：在现有色彩基础上增强品牌感，不改产品骨架

## 备选方案

### 方案 A：仅改全局 token

做法：

- 只更新 `src/app/globals.css` 与 `src/app/layout.tsx`
- 依赖语义 token 自动带动大多数组件变化

优点：

- 改动最小
- 风险最低
- 适合快速完成一次基础校色

缺点：

- 难以达到这次要求的增强力度
- reader / settings / tooltip / popover 等高曝光 surface 仍会保留各自的旧气质

### 方案 B：全局 token + 高曝光 chrome 统一（推荐）

做法：

- 先收紧 `globals.css` 的品牌钴蓝 token、overlay、shadow、light/dark 底色关系
- 再把 reader 三栏、frosted header、button、popover、tooltip、toast、settings 侧栏和文章提示块统一到同一品牌语言

优点：

- 能明显提升品牌感，同时不动布局结构
- 与这次确认的 `B + 3` 方向完全一致
- 变更范围可控，仍然是一次系统化校色，不是局部重设计

缺点：

- 会触及多个高曝光文件，需要补足测试验证

### 方案 C：编辑化局部重设计

做法：

- 在方案 B 的基础上继续引入更强的 surface 差异、装饰色节奏与局部版式强调

优点：

- 视觉冲击更强

缺点：

- 容易超出“基于现有色彩增强品牌感”的范围
- 会把本轮需求推向局部重设计，而不是主题收紧

## 推荐方案

采用方案 B：全局 token + 高曝光 chrome 统一。

理由：

- 它既能保留 FeedFuse 当前蓝色品牌的连续性，又能让界面从“默认蓝主题”升级为“有品牌辨识度的编辑感钴蓝”
- 它满足用户选择的增强力度，但不把需求扩大为高风险布局改造
- 它能最大化复用当前语义 token 体系与现有 contract test，而不是重走一遍主题基础设施

## 已确认设计

### 1. 色彩系统

本轮色彩调整遵循“主色收紧、中性色染蓝、light/dark 同家族”的原则。

具体规则：

- `primary` 从当前偏亮的功能蓝，调整为更深一档的钴蓝，使主要动作更稳重、更克制
- `background / card / popover / muted / accent / border / input` 不再维持近中性灰，而是统一带有轻微蓝灰冷调
- `foreground / muted-foreground` 保持足够对比度，不为了追求“高级感”而牺牲可读性
- `overlay` 从通用黑色压暗，调整为更带蓝墨气质的遮罩
- `shadow-popover` 从通用深灰阴影，调整为蓝墨阴影，以统一浮层氛围
- `dark` 模式不使用常见 slate 黑，而是采用更接近“墨蓝纸面”的背景和表面层，使 light / dark 两套模式仍然属于同一品牌家族
- `themeColor` 跟随新的 light / dark 品牌底色，而不是继续使用纯白与近黑

该层只负责 token 关系，不负责具体页面的局部 surface 选择。

### 2. 系统层表面语言

在共用设计系统层，收紧所有高频复用的表面组件，使它们共享同一套编辑感钴蓝语言。

主要覆盖：

- `src/lib/designSystem.ts` 中的 `FROSTED_HEADER_CLASS_NAME` 与 `FLOATING_SURFACE_CLASS_NAME`
- `src/components/ui/button.tsx` 的 `default / outline / secondary / ghost / link` 层级
- `src/components/ui/popover.tsx` 的浮层底色、边框与阴影
- `src/components/ui/tooltip.tsx` 的背景与文字关系，移除脱离主题的 `bg-black/80`
- 依赖 `shadow-popover` 的 context menu / dialog / sheet / alert-dialog 等表面层

统一原则：

- 主按钮更稳、更像主编工具栏里的确认动作
- `ghost` 与 `pressed` 态要有足够重量，避免漂浮感
- 弹层与菜单保持同一家族，不出现某些是默认白卡、某些是品牌蓝灰卡、某些仍是黑 tooltip 的割裂感

### 3. 高曝光功能区

本轮只对高曝光区域的表面层进行校色，不改变结构。

#### Reader

覆盖 `src/features/reader/ReaderLayout.tsx`：

- 左栏底色从当前的 `bg-muted/45` 调整为更明确的品牌蓝灰导航表面
- 中栏底色从 `bg-muted/5` 调整为更柔和但仍可区分的次级表面
- resize 激活边框、顶部 `frosted header` 与选中态一起收紧到同一家族
- 三栏关系仍然清晰，但视觉来源从“通用灰 + 功能蓝高亮”变成“品牌蓝灰层次 + 钴蓝强调”

#### Settings

覆盖 `src/features/settings/SettingsCenterDrawer.tsx`：

- header 与 reader header 使用同一套品牌 frosted surface
- 侧栏底色、active tab、hover 和分隔边界调整为同一套钴蓝灰关系
- 保持现有可访问性和导航结构，不重做 tab 或 drawer 组织方式

#### Article 提示块

覆盖 `src/features/articles/ArticleView.tsx`：

- 所有 `bg-muted/30` 的提示面板收紧为统一的品牌表面层
- 语义色继续只承担状态表达，不承担整个容器的主视觉
- 阅读内容区整体仍保持内容优先，不引入喧宾夺主的装饰

#### Toast 与局部通知

覆盖 `src/features/toast/ToastHost.tsx`：

- success / error / info 仍保留语义区分
- 它们的边框、背景承载关系与关闭按钮 hover 态收紧到同一品牌 surface 体系
- 通知应看起来像 FeedFuse 的系统消息，而不是来自另一个设计系统的临时组件

### 4. 结构边界与职责

本轮改动按三层边界推进：

- Token layer：`src/app/globals.css`、`src/app/layout.tsx`
- System layer：`src/lib/designSystem.ts`、`src/components/ui/button.tsx`、`src/components/ui/popover.tsx`、`src/components/ui/tooltip.tsx`
- Feature layer：`src/features/reader/ReaderLayout.tsx`、`src/features/settings/SettingsCenterDrawer.tsx`、`src/features/articles/ArticleView.tsx`、`src/features/toast/ToastHost.tsx`

边界要求：

- Token layer 负责颜色关系与全局主题值
- System layer 负责共用表面语言与按钮层级
- Feature layer 只接入新语言，不新增并行的局部色彩体系

### 5. 风险与防护

主要风险：

- 对比度下降，尤其体现在 `muted-foreground`、tooltip 文本、浅色提示块和 `ghost` 按钮上
- dark 模式变脏或失去层次，看起来像“染蓝的纯黑”
- reader、settings、tooltip、popover 之间继续风格分裂
- 测试中已有的 class 断言因细节改动而回归

对应防护：

- 优先调整表面层与边框，不通过弱化文字对比度制造“精致感”
- 为 dark 主题单独设计品牌底色关系，而不是机械沿用 light 的反相思路
- 先统一 system layer，再落 feature layer，避免页面级补丁到处散落
- 尽量保持现有语义类的使用模式，优先改 token 值和必要的表面 class，不轻易推翻断言结构

### 6. 验证策略

至少需要完成以下验证：

- 契约测试
  - `pnpm exec vitest run src/app/globals-css.contract.test.ts src/app/theme-token-usage.contract.test.ts`
  - 必要时补充 `themeColor`、tooltip 或 popover 的契约断言
- 行为回归
  - `pnpm exec vitest run src/app/'(reader)'/ReaderApp.test.tsx src/features/reader/ReaderLayout.test.tsx src/features/feeds/FeedList.test.tsx`
  - 如果按钮、tooltip 或 toast 的表现发生变化，再补充相关组件测试
- 浏览器核验
  - 实际检查 reader、settings、toast、popover、tooltip 在 light / dark 下的视觉一致性
  - 确认高曝光表面已统一，但文章内容本身仍保持阅读优先

## 实施建议

实现顺序建议如下：

1. 先更新 `globals.css` 与 `layout.tsx`，确定品牌钴蓝 token 和 `themeColor`
2. 再统一 `designSystem`、`button`、`popover`、`tooltip`
3. 最后接入 reader、settings、article 提示块和 toast
4. 每一层完成后都运行对应测试，避免回归被最后一轮大改掩盖

该顺序可以把视觉变化按“基础主题 -> 共用系统 -> 高曝光页面”的路径逐步收紧，便于定位问题和控制风险。
