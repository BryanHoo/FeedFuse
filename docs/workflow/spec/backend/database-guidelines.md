# 数据库规范

## 基础约定

- 数据库是 PostgreSQL 16
- 连接池由 `src/server/db/pool.ts` 提供单例 `Pool`
- 环境变量入口统一走 `src/server/env.ts`
- 迁移脚本入口是 `node scripts/db/migrate.mjs`

## 迁移规则

- schema 变更必须新增 `src/server/db/migrations/*.sql`
- 文件名保持顺序编号前缀，按字符串排序执行
- migration 生效记录由 `schema_migrations` 表维护，不手改
- 有代表性的 schema 变更要补对应 migration test，当前已有大量 `*Migration.test.ts` 作为先例

## Repository 规则

- Repository 函数优先接收 `Pool | PoolClient`
  这样事务内外都能复用
- SQL 字段在查询层完成 `snake_case -> camelCase` 别名映射
  例如 `site_url as "siteUrl"`
- 返回值要有明确 TypeScript 类型
  例如 `FeedRow`
- 单表 CRUD 或轻量聚合优先放 repository，不在 route 里拼复杂 SQL

## 事务规则

- 需要跨多次写入、需要和日志一起提交、或者有“先写后补偿”风险时，显式开启事务
- 参考 `src/app/api/settings/route.ts`
  先 `client.query('begin')`，完成所有写入后 `commit`，异常时 `rollback`
- 事务内优先把 `client` 继续传给 repository / logger，避免部分操作跑到事务外

## 禁止事项

- 不要绕过 migration 直接手改线上/本地 schema
- 不要在多个 route 文件里复制同样的 SQL 片段
- 不要把数据库字段原样泄漏到前端，统一做 DTO 映射
