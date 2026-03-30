# 后端规范索引

开始改 API、数据库、worker 或服务端逻辑前，按下面顺序阅读。

## 必读顺序

1. [目录结构](./directory-structure.md)
2. [数据库规范](./database-guidelines.md)
3. [错误处理](./error-handling.md)
4. [日志规范](./logging-guidelines.md)
5. [质量与验证](./quality-guidelines.md)

## 这个层包含什么

- `src/app/api/**/route.ts` 的 HTTP 边界
- `src/server/**` 的领域逻辑
- `src/worker/**` 的异步任务执行
- PostgreSQL schema、迁移与仓储

## 进入实现前先确认

- 这是同步路由、后台任务，还是两者都要改
- 数据形状是否需要同步到 `src/types` 和 `src/lib/apiClient.ts`
- 是否已经存在可复用的 repository / service / queue contract
