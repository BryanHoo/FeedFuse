# 后端质量与验证

## 测试形态

- API route 通常配套 `routes.test.ts`
- migration 通常配套 `*Migration.test.ts`
- runtime 兼容问题会用 `*.runtime.test.ts`
- 解析器、仓储、日志等模块有各自的 `*.test.ts`

## 变更后的验证建议

- 改 route：
  跑对应 `routes.test.ts`，并补跑 `pnpm type-check`
- 改 repository / service：
  跑对应单测；如果影响 API 响应，再补 route test
- 改 migration：
  补 migration test，并实际执行 `node scripts/db/migrate.mjs`
- 改 worker / AI runtime：
  跑 worker 相关测试和 runtime test

## 实现检查表

- 需要数据库或 cookie 的 route 明确声明 `runtime = 'nodejs'`
- 数据依赖动态结果时，保留 `dynamic = 'force-dynamic'`
- 外部 URL 相关能力检查 SSRF guard
- 所有环境变量都经 `getServerEnv()` 读取
- 统一返回 `ok` / `fail`

## 常见回归点

- 改了设置结构，但忘记同步 `normalizePersistedSettings`
- 改了 repository 返回字段，但忘记同步 `src/types` 或 `apiClient` DTO 映射
- 在 API 里塞入长耗时逻辑，导致本该进 worker 的流程阻塞请求
- 新增 migration 但没有补排序编号或测试
- 调整 `ai_digest` 候选筛选时误把 `ai_digest_configs.top_n` 当成用户可见上限；当前约定是该字段仅作兼容保留，运行时应优先按“是否相关”筛选，并在筛选结果为空时落 `skipped_no_updates`
