# 日志规范

## 统一入口

- 系统日志：`src/server/logging/systemLogger.ts`
- 用户操作日志：`src/server/logging/userOperationLogger.ts`

## 写日志的基本规则

- `source` 使用稳定的调用源字符串
  例如 `app/api/settings`、`app/api/feeds`
- 普通流程日志优先写在边界层或完整业务流程结束处
- 不要在底层小工具里到处散写日志，否则会造成重复和上下文缺失

## 用户操作日志

以下场景优先写用户操作日志：

- 创建、修改、删除 feed / category / settings
- 用户主动触发刷新、导入、导出、生成解读
- 任何需要在 UI 中与“操作结果”对应起来的行为

推荐字段：

- `actionKey`
- `source`
- `context`
- 失败时传 `err` 或 `details`

## 系统日志

- `writeSystemLog` 默认遵守用户设置里的日志开关和最小级别
- 只有少数基础设施事件才使用 `forceWrite`
  例如开启或关闭 logging 自身

## 事务配合

- 如果日志要和业务写入保持原子性，传 `PoolClient` 而不是全局 `Pool`
- 参考 `src/app/api/settings/route.ts`

## 禁止事项

- 不要记录敏感明文，例如 API Key、密码原文
- 不要把用户可见提示和内部排障细节混在一个 `message` 里
- `details` 可包含排障信息，`message` 保持简洁稳定
