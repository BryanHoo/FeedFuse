# 前端目录结构

## 目录职责

- `src/app`
  页面、布局、App Router 入口，以及少量 route-adjacent 测试
- `src/features`
  业务功能目录。阅读器、文章、订阅源、设置、通知等都按 feature 组织
- `src/components/ui`
  基础 UI 原语和 Radix 封装，给 feature 层复用
- `src/store`
  全局客户端状态与异步 action
- `src/hooks`
  应用级共享 hook
- `src/lib`
  浏览器侧通用工具、API client、视图辅助函数

## 放置规则

- 页面级组合：
  放 `src/app`
- 单个业务域组件、feature 内 hook、feature 工具：
  放 `src/features/<domain>`
- 可跨 feature 复用的 UI primitive：
  放 `src/components/ui`
- 需要在多个页面 / 组件之间共享的客户端状态：
  放 `src/store`
- 与浏览器环境强耦合、但不属于单个 feature 的 hook：
  放 `src/hooks`

## 现有结构示例

- 阅读页入口：`src/app/(reader)/ReaderApp.tsx`
- 阅读器主体：`src/features/reader/*`
- 文章展示：`src/features/articles/*`
- 设置中心：`src/features/settings/*`
- 共享按钮等基础组件：`src/components/ui/*`
- 全局阅读状态：`src/store/appStore.ts`
- 持久化设置状态：`src/store/settingsStore.ts`
