# Component Guidelines

> 组件层以函数组件 + 明确 Props 类型 + Tailwind 原子类为主。

---

## Component Structure

- 优先函数组件；业务组件通常 `export default function`。
- 文件顺序建议：`import -> types/interface -> constants -> component -> helper`。
- 复用 UI 能力先看 `src/components/ui/`，避免在业务组件重复造轮子。

示例：
- `src/features/reader/ReaderToolbarIconButton.tsx`
- `src/features/feeds/FeedDialog.tsx`
- `src/components/ui/button.tsx`

---

## Props Conventions

- Props 使用 `type` 或 `interface` 显式声明。
- 可选项使用 `?`，并在参数解构处给默认值（如 `pressed = false`）。
- 不要用 `any` 接 props，复杂 props 优先拆成命名类型。

示例：
- `ReaderToolbarIconButtonProps` in `src/features/reader/ReaderToolbarIconButton.tsx`
- `ReaderAppProps` in `src/app/(reader)/ReaderApp.tsx`

---

## Styling Patterns

- 统一使用 Tailwind class 字符串，组合场景用 `cn(...)`。
- 组件变体统一用 `cva` 定义，不在调用方拼接大量分支样式。
- 复杂视觉 token 放 `src/lib/designSystem.ts`（如抽屉样式常量）。

示例：
- `buttonVariants` in `src/components/ui/button.tsx`
- `cn` helper in `src/lib/utils.ts`
- `SETTINGS_CENTER_SHEET_CLASS_NAME` in `src/features/settings/SettingsCenterDrawer.tsx`

---

## Accessibility

- 可点击图标按钮必须提供 `aria-label`；可切换状态用 `aria-pressed`。
- Tooltip 内容应可被读屏识别，必要时提供额外可访问文本。
- 装饰性占位元素使用 `aria-hidden="true"`。

示例：
- `ReaderToolbarIconButton` 的 `aria-label`/`aria-pressed`
- `ArticleList` 虚拟滚动占位 `aria-hidden`

---

## Common Mistakes

- 在业务组件里直接发请求并管理太多状态（应沉到 store/hook）。
- 在多个页面复制相同按钮/弹窗样式（应抽到 `components/ui`）。
- 仅做视觉提示但缺少 `aria-*` 属性。
