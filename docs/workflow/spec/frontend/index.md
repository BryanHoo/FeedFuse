# 前端规范索引

开始改页面、组件、store、浏览器端 API 调用前，按下面顺序阅读。

## 必读顺序

1. [目录结构](./directory-structure.md)
2. [组件规范](./component-guidelines.md)
3. [Hook 规范](./hook-guidelines.md)
4. [状态管理](./state-management.md)
5. [类型安全](./type-safety.md)
6. [质量与验证](./quality-guidelines.md)

## 这个层包含什么

- `src/app` 中的页面和布局
- `src/features` 中的业务 UI
- `src/components/ui` 中的共享原语
- `src/store` 中的 Zustand 状态
- `src/lib/apiClient.ts` 及其他浏览器侧工具

## 进入实现前先确认

- 这是局部组件状态、全局 store 状态，还是 URL/服务端数据状态
- 同类 API 能否直接复用 `src/lib/apiClient.ts`
- 是否已经有对应 feature 目录、共享 UI 原语或 contract test
