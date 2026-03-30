# 状态管理规范

## 当前状态分层

- `src/store/appStore.ts`
  阅读器全局状态，包含 feed/category/article 列表、选中项、缓存、加载状态和大量异步 action
- `src/store/settingsStore.ts`
  持久化设置、会话设置、草稿编辑状态，以及设置保存相关的异步流程
- 组件局部状态
  只保留与当前视图强绑定的临时交互状态

## 约定

- 远端请求优先放到 `src/lib/apiClient.ts`，由 store action 调用
- 组件不直接散写请求，除非该请求明确是一次性局部行为
- URL 同步属于状态的一部分时，和 store 一起维护
  参考 `appStore` 中的阅读视图与文章选择 URL 同步

## Settings 特殊规则

- 后端设置值进入前端前先经过 `normalizePersistedSettings`
- `settingsStore` 明确区分：
  `persistedSettings`
  `sessionSettings`
  `draft`
- 敏感输入状态如 API Key 不直接塞进持久化设置对象

## 新增状态时的决策

- 多个 feature 或页面共享：
  优先放 store
- 只影响当前组件短时交互：
  留在组件内
- 只是后端数据映射：
  优先放 API client / mapper，而不是先放 store 再修正
