# Type Safety

> 统一使用 TypeScript + Zod，前后端都要求“静态类型 + 运行时校验”双重约束。

---

## Type Organization

- 跨层共享领域类型放 `src/types/index.ts`（`Feed`、`Article`、`PersistedSettings`）。
- API DTO 类型通常在 `src/lib/apiClient.ts` 或对应 server 模块就近定义。
- Repository 行类型与 SQL 列别名保持一致，定义在对应 `*Repo.ts` 文件内。

示例：
- `src/types/index.ts`
- `src/lib/apiClient.ts` (`ReaderSnapshotDto`, `ApiEnvelope<T>`)
- `src/server/repositories/articlesRepo.ts` (`ArticleRow`)

---

## Validation

- API Route 入参使用 Zod `safeParse`，失败返回 `ValidationError`。
- 环境变量统一经 `src/server/env.ts` 的 `envSchema` 解析。
- 对外部输入（URL、事件 payload）先做结构检查再使用。

示例：
- `createFeedBodySchema` in `src/app/api/feeds/route.ts`
- `querySchema` in `src/app/api/reader/snapshot/route.ts`
- `envSchema` in `src/server/env.ts`

---

## Common Patterns

- 使用 `isRecord(value): value is Record<string, unknown>` 做类型收窄。
- 通过 DTO 映射函数隔离后端字段与前端模型差异。
- 对可空字段使用显式 `null`，避免 `undefined/null` 混用。

示例：
- `isRecord` in `src/lib/utils.ts` 与 `src/features/settings/settingsSchema.ts`
- `mapFeedDto` / `mapArticleDto` in `src/lib/apiClient.ts`

---

## Forbidden Patterns

- 禁止 `any` 逃逸类型系统（除测试临时替身且无法避免的边界）。
- 禁止无依据的 `as` 强转替代校验。
- 禁止把 `request.json()` 结果直接当作可信对象使用。
