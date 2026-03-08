# FeedFuse 阅读界面质量审计报告

- 日期：2026-03-08
- 范围：`src/app/(reader)/page.tsx:3` 对应的阅读器主界面
- 方法：静态代码审查 + 浏览器实测
- 证据：`artifacts/audit/desktop.png`、`artifacts/audit/mobile.png`、`artifacts/audit/dark-desktop.png`
- 说明：本文件仅记录问题与建议，不包含修复实现

## Anti-Patterns Verdict

**结论：Pass（但有明显“通用 AI / shadcn 审美”风险）**

- 整体不像典型 AI 落地页：没有 gradient text、hero metrics、重复卡片宫格、过度发光暗黑风。
- 但设置中心有明显模板味：`src/features/settings/SettingsCenterDrawer.tsx:63`、`src/features/settings/SettingsCenterDrawer.tsx:230`、`src/features/settings/SettingsCenterDrawer.tsx:253` 使用了安全的 `slate/blue` 配色、`backdrop-blur`、渐变面板、圆角 tab-card 组合。
- 次级风险在 `src/features/articles/ArticleScrollAssist.tsx:32`，玻璃感和模糊效果更像装饰，而不是功能驱动。
- 因此它**不是 AI slop**，但**设计辨识度仍然不够强**。

## Executive Summary

- 共发现 **12** 个问题：**1 Critical / 4 High / 5 Medium / 2 Low**
- 最关键的 5 个问题：
  - 移动端三栏布局没有真正适配，核心内容和操作被挤出视口
  - 首页存在 `React error #418`，并伴随多条 404 console 噪音
  - 多处核心按钮触控尺寸明显小于 `44x44`
  - 面板 resize 仅支持指针，不支持键盘
  - 文章列表按钮的可访问名称过长，屏幕阅读器成本很高
- 综合质量分：**58/100**
- 推荐修复顺序：先修移动端结构与运行时错误，再修交互可达性，再统一主题系统，最后做视觉去模板化。

## Detailed Findings by Severity

### Critical Issues

#### 1. 移动端三栏布局未适配，核心功能被挤出视口

- **Location**：`src/features/reader/readerLayoutSizing.ts:1`、`src/features/reader/ReaderLayout.tsx:240`
- **Severity**：Critical
- **Category**：Responsive
- **Description**：阅读器使用固定三栏宽度常量，移动端只关闭 `ResizeHandle`，没有切换布局模式。浏览器实测在 `390px` 视口下，`feed pane = 240px`、`article pane = 400px`，工具按钮落到屏外。
- **Impact**：移动端用户无法完整看到文章列和操作区，主任务路径被破坏，等同于隐藏关键功能。
- **WCAG/Standard**：WCAG 1.4.10 Reflow；同时命中设计技能中的 “Don’t hide critical functionality on mobile”。
- **Recommendation**：改为 mobile-first 单栏/双栏流转；订阅源侧栏使用 `sheet/drawer`，文章列表与正文在窄屏上做显式切换。
- **Suggested command**：`/impeccable-adapt`

### High-Severity Issues

#### 2. 高频图标按钮触控面积过小

- **Location**：`src/features/feeds/FeedList.tsx:259`、`src/features/articles/ArticleList.tsx:477`、`src/features/reader/ReaderLayout.tsx:291`、`src/features/articles/ArticleScrollAssist.tsx:33`、`src/features/settings/panels/GeneralSettingsPanel.tsx:55`
- **Severity**：High
- **Category**：Accessibility / Responsive
- **Description**：多个核心按钮尺寸明显低于推荐目标尺寸；浏览器实测 `add-feed = 28x28`、`refresh = 24x24`、`toggle-unread-only = 24x24`、`mark-all-as-read = 24x24`、`open-settings = 36x36`。
- **Impact**：移动端误触率高，不利于触摸屏、触控板和低精度输入设备使用。
- **WCAG/Standard**：WCAG 2.5.8 Target Size (Minimum)
- **Recommendation**：所有高频 icon button 至少扩到 `44x44`，可以保留较小图标，但必须扩大 hit area。
- **Suggested command**：`/impeccable-adapt`

#### 3. 分栏 resize 仅支持指针，缺少键盘与状态语义

- **Location**：`src/features/reader/ResizeHandle.tsx:20`、`src/features/reader/ReaderLayout.tsx:166`、`src/features/reader/ReaderLayout.tsx:184`
- **Severity**：High
- **Category**：Accessibility
- **Description**：分栏 resize 通过 `pointerdown` 驱动，没有 `tabIndex`、键盘箭头控制，也没有 `aria-valuenow/min/max` 一类状态信息。
- **Impact**：键盘用户无法调整布局；辅助技术也无法理解控件当前状态。
- **WCAG/Standard**：WCAG 2.1.1 Keyboard；WCAG 4.1.2 Name, Role, Value
- **Recommendation**：将 resize handle 升级为可聚焦控件，补全键盘微调、当前宽度播报与语义属性。
- **Suggested command**：`/impeccable-harden`

#### 4. 首页存在运行时错误与明显 console 噪音

- **Location**：`src/app/(reader)/ReaderApp.tsx:1`、`src/features/reader/ReaderLayout.tsx:44`、`src/features/reader/ReaderLayout.tsx:254`
- **Severity**：High
- **Category**：Performance / Reliability
- **Description**：浏览器实测首页出现多次 `Minified React error #418`，同时存在多条 404 console 错误。结合代码看，`window.innerWidth` 参与首帧布局分支，存在 hydration mismatch 风险。
- **Impact**：运行时不稳定会削弱页面可靠性，后续容易演变成交互错位、布局闪烁或事件绑定异常。
- **WCAG/Standard**：运行时健壮性问题
- **Recommendation**：先定位 hydration mismatch 根因，确保 SSR 与 CSR 首帧输出一致，再清理 404 资源请求来源。
- **Suggested command**：`/impeccable-harden`

#### 5. 文章列表按钮的可访问名称过长

- **Location**：`src/features/articles/ArticleList.tsx:570`、`src/features/articles/ArticleList.tsx:621`
- **Severity**：High
- **Category**：Accessibility
- **Description**：整条文章内容被包在 `button` 中，可访问名称会带上标题、摘要、来源、时间等整段文本。浏览器实测首批按钮名称长度达到 `108–229` 字。
- **Impact**：屏幕阅读器在列表导航时信息过载，定位目标成本非常高。
- **WCAG/Standard**：可访问命名清晰度最佳实践
- **Recommendation**：将按钮的可访问名称压缩为“标题 + 必要状态”，摘要和元信息改为 `aria-describedby` 或只做视觉展示。
- **Suggested command**：`/impeccable-clarify`

### Medium-Severity Issues

#### 6. 颜色 token 与业务层硬编码并存

- **Location**：`src/features/settings/SettingsCenterDrawer.tsx:42`、`src/features/notifications/NotificationViewport.tsx:8`、`src/features/feeds/FeedDialog.tsx:80`
- **Severity**：Medium
- **Category**：Theming
- **Description**：主题 token 已在 `src/app/globals.css:6` 集中定义，但业务层仍有大量 `slate/blue/red/emerald/amber` 颜色硬编码。静态扫描命中 **27** 处，分布于 **8** 个文件。
- **Impact**：主题一致性被绕开，后续调整品牌色、状态色或暗色策略时维护成本高。
- **WCAG/Standard**：设计系统一致性问题
- **Recommendation**：将状态色和界面语义色上移到 token 层，业务组件只消费 token，不直接写具象色值。
- **Suggested command**：`/impeccable-normalize`

#### 7. `theme-color` 未跟随用户手动主题选择

- **Location**：`src/app/layout.tsx:19`、`src/hooks/useTheme.ts:7`、`src/features/settings/panels/GeneralSettingsPanel.tsx:15`
- **Severity**：Medium
- **Category**：Theming
- **Description**：应用支持 `light / dark / auto` 三种主题，但 `viewport.themeColor` 只跟随 `prefers-color-scheme`，不跟随设置中的手动主题。
- **Impact**：移动端地址栏或 PWA chrome 颜色可能与应用实际主题不一致，视觉反馈割裂。
- **WCAG/Standard**：浏览器主题一致性最佳实践
- **Recommendation**：让 `theme-color` 与用户设置保持同步，必要时在客户端更新对应 `meta`。
- **Suggested command**：`/impeccable-normalize`

#### 8. 面板宽度使用 `width` 过渡，存在布局动画性能风险

- **Location**：`src/features/reader/ReaderLayout.tsx:76`、`src/features/reader/ReaderLayout.tsx:247`
- **Severity**：Medium
- **Category**：Performance
- **Description**：布局宽度变化直接使用 `transition-[width]`，属于 layout property 动画。
- **Impact**：拖拽、折叠或布局切换时更容易触发重排与抖动。
- **WCAG/Standard**：动画性能最佳实践
- **Recommendation**：优先改用 `transform` 驱动动画；如果必须改宽度，也应避免在高频交互上做过渡。
- **Suggested command**：`/impeccable-optimize`

#### 9. 三栏阅读器缺少明确 landmark 结构

- **Location**：`src/app/layout.tsx:36`、`src/features/reader/ReaderLayout.tsx:237`、`src/features/feeds/FeedList.tsx:247`、`src/features/articles/ArticleList.tsx:473`、`src/features/articles/ArticleView.tsx:450`
- **Severity**：Medium
- **Category**：Accessibility
- **Description**：复杂阅读器界面目前几乎只有一个 `main`，没有明确区分订阅源、文章列表和正文区域的 landmark。
- **Impact**：屏幕阅读器用户难以快速跨区域导航。
- **WCAG/Standard**：WCAG 1.3.1 Info and Relationships；WCAG 2.4.1 Bypass Blocks
- **Recommendation**：为三大 pane 增加带名称的 `nav`、`aside`、`section/region` 或等效结构。
- **Suggested command**：`/impeccable-harden`

#### 10. 可访问标签文案中混用英文 token

- **Location**：`src/features/feeds/FeedList.tsx:265`、`src/features/articles/ArticleList.tsx:484`、`src/features/articles/ArticleList.tsx:500`、`src/features/articles/ArticleList.tsx:521`、`src/features/reader/ReaderLayout.tsx:297`
- **Severity**：Medium
- **Category**：Accessibility
- **Description**：中文界面中多处 `aria-label` 仍使用 `add-feed`、`refresh-feeds`、`open-settings` 等英文 token。
- **Impact**：对中文读屏、语音控制和统一交互文案都不友好。
- **WCAG/Standard**：可访问文案一致性最佳实践
- **Recommendation**：将这些可访问名称改为自然中文动作句，和视觉文案保持同一语气体系。
- **Suggested command**：`/impeccable-clarify`

### Low-Severity Issues

#### 11. 设置中心有明显模板化视觉语言

- **Location**：`src/features/settings/SettingsCenterDrawer.tsx:63`、`src/features/settings/SettingsCenterDrawer.tsx:230`、`src/features/settings/SettingsCenterDrawer.tsx:253`
- **Severity**：Low
- **Category**：Theming / Anti-pattern
- **Description**：设置中心延续了较强的默认组件库观感：`slate/blue`、渐变、模糊、圆角 tab-card 组合。
- **Impact**：不影响可用性，但会削弱产品的独特记忆点。
- **WCAG/Standard**：设计辨识度问题
- **Recommendation**：降低模板味，收敛装饰性视觉表面，强化产品自己的结构语言。
- **Suggested command**：`/impeccable-distill`

#### 12. 浮动标题与回顶控件的模糊效果偏装饰化

- **Location**：`src/features/articles/ArticleScrollAssist.tsx:32`、`src/features/reader/ReaderLayout.tsx:206`
- **Severity**：Low
- **Category**：Theming / Anti-pattern
- **Description**：浮动标题和回顶控件使用半透明与模糊效果，更像“默认高级感”而不是必要的层级提示。
- **Impact**：轻微增加视觉噪音。
- **WCAG/Standard**：视觉克制最佳实践
- **Recommendation**：仅保留真正有信息分层价值的模糊效果。
- **Suggested command**：`/impeccable-quieter`

## Patterns & Systemic Issues

- 桌面优先布局直接外溢到移动端：`ReaderLayout` 只隐藏 resize handle，没有重构信息架构。
- 触控尺寸系统性偏小：头部按钮、悬浮按钮、设置切换按钮都低于推荐尺寸。
- 主题 token 未完全管住业务层：硬编码颜色已经分散到多个 UI 文件。
- 辅助技术命名策略不统一：有的按钮标签过长，有的按钮标签又是英文 token。
- 局部视觉语言偏模板化：集中在设置中心和少数浮层/悬浮组件。

## Positive Findings

- `src/app/layout.tsx:30` 提供了跳转到主要内容的 skip link，说明已考虑键盘用户。
- `src/app/globals.css:6` 与 `src/hooks/useTheme.ts:4` 建立了全局 token 和暗色切换基础设施，方向正确。
- `src/features/feeds/FeedDialog.tsx:312`、`src/features/settings/panels/AISettingsPanel.tsx:94` 等表单大多使用了显式 `Label` 绑定。
- `src/features/feeds/FeedList.tsx:402`、`src/features/articles/ArticleList.tsx:692`、`src/features/articles/ArticleView.tsx:501` 已对非关键图片使用 `loading="lazy"`，装饰图也大多正确使用空 `alt`。
- 暗色实测下，页面前景色与背景色切换正常，说明基础 dark mode 没有失效。

## Recommendations by Priority

1. **Immediate**
   - 重做移动端阅读器结构，保证 `390px` 下能完成“选源 → 选文 → 阅读”主路径
   - 清理首页 `React error #418` 与 404 运行时噪音
2. **Short-term**
   - 将所有高频按钮扩展到 `44x44`
   - 为 resize handle 增加键盘支持与状态语义
   - 优化文章列表按钮的可访问命名
   - 将英文 token 式 `aria-label` 改为自然中文
3. **Medium-term**
   - 将业务层硬编码颜色收敛到 token
   - 为三栏阅读器补足 landmark 结构
   - 去掉 `width` 过渡这类布局动画
4. **Long-term**
   - 降低设置中心与悬浮控件的模板化审美
   - 重新评估模糊、渐变、卡片化是否真正服务于信息结构

## Suggested Commands for Fixes

- 使用 `/impeccable-adapt` 处理移动端重排、隐藏功能与触控尺寸问题，预计覆盖 3 个核心问题
- 使用 `/impeccable-harden` 处理 hydration/runtime、键盘 resize 与 landmark 结构问题，预计覆盖 3 个问题
- 使用 `/impeccable-normalize` 收敛 token、修正主题一致性，预计覆盖 3 个问题
- 使用 `/impeccable-clarify` 压缩可访问名称、统一中文操作文案，预计覆盖 2 个问题
- 使用 `/impeccable-optimize` 去掉布局动画、降低重排风险，预计覆盖 2 个问题
- 使用 `/impeccable-distill` 或 `/impeccable-quieter` 降低设置中心与悬浮控件的模板味，预计覆盖 2 个问题
- 修复完成后，重新运行 `/impeccable-audit` 做回归审计
