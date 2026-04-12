# Frontend Component Patterns

## 分层组织

- 页面入口放在 `src/app/**`（示例：`src/app/(reader)/ReaderApp.tsx`）。
- 业务组合放在 `src/features/**`（示例：`src/features/reader/ReaderLayout.tsx`）。
- 通用 UI 原子组件放在 `src/components/ui/**`（button/dialog/sheet 等）。

规则：

- 新业务组件优先放 `features`，不要直接堆进 `components/ui`。
- `components/ui` 只收敛可复用且与业务解耦的基础组件。

## 组件与样式约定

- 可复用交互组件采用 `class-variance-authority` 管理变体（示例：`src/components/ui/button.tsx`）。
- className 合并统一用 `cn()`（`src/lib/utils.ts`）。
- 设计 token 定义在 `src/app/globals.css`，复用布局 class 常量放在 `src/lib/designSystem.ts`。

规则：

- 不要在业务组件里重复硬编码与 token 等价的颜色/尺寸常量。
- 涉及通用布局 class 时优先扩展 `designSystem.ts`，避免字符串散落。

## 状态与副作用边界

- 全局状态由 Zustand store 承载（`src/store/appStore.ts`、`src/store/settingsStore.ts`）。
- 组件优先通过 selector 读取最小状态切片，避免整 store 订阅。
- API 请求优先走 `src/lib/apiClient.ts`，再由 store action 统一管理 optimistic 更新与错误提示。

## 响应式与交互约定

- 断点与读屏布局尺寸常量在 `src/lib/designSystem.ts` 和 `src/features/reader/readerLayoutSizing.ts`。
- 复杂交互（拖拽、快捷键、弹层）在 feature 组件内部收敛，不下沉到 UI 原子层。

## 常见反模式

- 在页面组件直接发请求并绕过 store/action。
- 把业务状态塞进 `components/ui` 组件，导致基础组件耦合业务。
