# 后端目录结构

## 目录职责

- `src/app/api/**/route.ts`
  Next.js Route Handler。负责鉴权、解析请求、调用服务端领域层、返回统一响应。
- `src/server/auth`
  会话、密码校验、cookie 序列化等认证逻辑。
- `src/server/db`
  连接池、迁移和数据库基础设施。
- `src/server/repositories`
  面向表或聚合根的数据访问层。这里可以写 SQL，但应保持业务规则最少化。
- `src/server/services`
  多仓储协作、带事务边界或带明显业务含义的流程。
- `src/server/rss`
  订阅抓取、解析、清洗和外链安全校验。
- `src/server/ai`
  AI 客户端、配置指纹、摘要/翻译相关服务端逻辑。
- `src/server/queue`
  队列定义、发送选项、队列启动和可观测逻辑。
- `src/server/logging`
  系统日志和用户操作日志。
- `src/server/tasks`
  跨模块共享的任务辅助逻辑，例如错误映射。
- `src/worker`
  真正消费队列的执行器和调度逻辑。

## 放置规则

- 新 HTTP 接口：
  先放到 `src/app/api/.../route.ts`，不要把复杂业务堆在 route 文件里
- 新 SQL：
  优先放到 `src/server/repositories/*`
- 新多步骤业务流程：
  放到 `src/server/services/*`
- 新后台任务：
  先补 `src/server/queue/*`，再补 `src/worker/*`
- 只属于某个 feature 的前后端胶水：
  优先按领域靠近已有实现，避免新增过宽泛的 `utils`

## 已有结构示例

- feed CRUD：`src/app/api/feeds/route.ts` -> `src/server/services/feedCategoryLifecycleService.ts` / `src/server/repositories/feedsRepo.ts`
- 设置保存：`src/app/api/settings/route.ts` -> `src/server/repositories/settingsRepo.ts` + 事务
- 异步抓取：`src/server/queue/*` -> `src/worker/index.ts` -> `src/server/rss/*` / `src/server/fulltext/*`
