# 代码复用检查表

开始新写一层实现前，先确认下面这些可复用入口是否已经存在。

## 前端复用点

- API 请求：
  先看 `src/lib/apiClient.ts`，不要在组件里重复写请求和错误处理
- 全局状态：
  先看 `src/store/appStore.ts`、`src/store/settingsStore.ts`
- 通用 UI：
  先看 `src/components/ui/*`
- 业务级可复用逻辑：
  先看 `src/features/*` 下已有 hook、工具和子组件

## 后端复用点

- 认证与会话：
  先看 `src/server/auth/*`
- 错误模型和统一响应：
  先看 `src/server/http/errors.ts`、`src/server/http/apiResponse.ts`
- 数据访问：
  先看 `src/server/repositories/*`
- 多步骤业务流程：
  先看 `src/server/services/*`
- 异步任务：
  先看 `src/server/queue/*` 与 `src/worker/*`
- 系统日志和用户操作日志：
  先看 `src/server/logging/*`

## 明确不要重复造的东西

- 不要再创建第二套 API response envelope
- 不要在多个 route 文件里复制同样的字段映射和错误翻译
- 不要在多个组件里重复实现 toast、轮询、任务状态拼装
- 不要在新模块里直接持有原始设置 JSON，而绕过 `normalizePersistedSettings`

## 什么时候允许新增抽象

只有在满足以下条件时再新增共享模块：

- 至少两个调用点确实需要复用
- 现有模块职责已经明显过载
- 新抽象能减少跨层耦合，而不是制造一层新的中转包装
