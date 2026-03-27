# 优化黑色主题视觉风格

## Goal
参考 `docs/Design Style Linear  Modern.md` 的 Linear / Modern 设计语言，优化现有界面的黑色主题视觉表现，使色彩、背景层次和组件表面更贴近目标风格，同时保持现有信息架构与交互逻辑不变。

## Requirements
- 仅优化黑色主题，不修改 light 主题视觉。
- 仅优化色彩、背景、边框、阴影、组件表面等视觉样式，不调整交互行为。
- 优化后的黑色主题应体现 near-black 基底、柔和层次、精细边框和适度强调色。
- 优先复用和集中现有 design token，避免零散的一次性样式。
- 保持现有可访问性与响应式布局不退化。

## Acceptance Criteria
- [ ] 黑色主题主要背景、前景、边框和强调色更接近设计文档中的 Linear / Modern 风格。
- [ ] 至少核心容器与常用组件在 dark 模式下呈现更统一的层次、阴影与表面样式。
- [ ] light 主题视觉输出未被改动。
- [ ] 未引入交互逻辑变更。
- [ ] lint 与 typecheck 通过。

## Technical Notes
- 优先检查主题 token、全局样式、共享 UI 组件和 reader 相关页面布局。
- 若现有 token 同时服务 light/dark，需要通过 dark 分支变量或 dark selector 精准覆盖，避免影响 light。
