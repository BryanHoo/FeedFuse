# 全局 bigint ID 迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将系统内所有持久化与接口相关业务 ID 从 `uuid` 迁移到 PostgreSQL `bigint identity`，并保持 API/前端以 `string` 传输。

**Architecture:** 采用“数据库类型统一迁移 + 应用层字符串兼容”策略：migration 层把主外键与数组字段统一改成 `bigint`/`bigint[]`，repository 层替换所有 `::uuid` 类型转换，API 层统一改为数字字符串校验。持久化 ID 生成职责全部下放数据库，移除业务层 `randomUUID`。测试按 TDD 分批落地，先锁定 schema 与校验行为，再做实现与回归。

**Tech Stack:** Next.js 16 + React 19 + TypeScript + PostgreSQL + Zod + Vitest + pnpm

---

## Context Snapshot

- Approved spec: `docs/superpowers/specs/2026-03-18-global-bigint-id-migration-design.md`
- Hard constraints:
  - 允许清库重建，不做线上无损迁移
  - 接受 ID 可枚举
  - 仅改持久化/API ID，不改前端临时 ID（如 `toastStore`）
  - 验证必须执行 `pnpm build`
- Current `uuid` hotspots:
  - Migrations: `src/server/db/migrations/0001_init.sql`, `0013`, `0014`, `0018`, `0019`, `0020`
  - Repositories: `src/server/repositories/aiDigestRepo.ts`, `articleAiSummaryRepo.ts`, `categoriesRepo.ts`
  - Services/routes: `src/server/services/aiDigestLifecycleService.ts`, `src/app/api/**/route.ts`（多个 `z.string().uuid()`）
  - API tests: `src/app/api/**/*.test.ts` 中大量 UUID fixture

## Scope Check

该需求是单一“全局 ID 体系迁移”子系统，虽然涉及数据库/API/测试多个层面，但强耦合且必须一体交付；保持为一个 implementation plan，不拆分子计划。

## File Structure Plan

Planned creates:
- `src/server/http/idSchemas.ts` - 统一定义数字字符串 ID 校验 schema（单值与数组项复用）。
- `src/server/http/idSchemas.test.ts` - 校验规则单元测试（合法/非法输入、边界值）。

Planned modifies:
- Database migrations:
  - `src/server/db/migrations/0001_init.sql`
  - `src/server/db/migrations/0013_article_tasks.sql`
  - `src/server/db/migrations/0014_article_translation_sessions.sql`
  - `src/server/db/migrations/0018_article_ai_summary_streaming.sql`
  - `src/server/db/migrations/0019_ai_digest_sources.sql`
  - `src/server/db/migrations/0020_ai_digest_run_sources.sql`
- Migration tests:
  - `src/server/db/migrations/aiDigestRunSourcesMigration.test.ts`
  - `src/server/db/migrations/aiDigestSourcesMigration.test.ts`
  - `src/server/db/migrations/articleTasksMigration.test.ts`
  - `src/server/db/migrations/articleTranslationSessionsMigration.test.ts`
  - `src/server/db/migrations/articleAiSummaryStreamingMigration.test.ts`
- Repository/service:
  - `src/server/repositories/aiDigestRepo.ts`
  - `src/server/repositories/articleAiSummaryRepo.ts`
  - `src/server/repositories/categoriesRepo.ts`
  - `src/server/services/aiDigestLifecycleService.ts`
- API routes:
  - `src/app/api/feeds/route.ts`
  - `src/app/api/feeds/[id]/route.ts`
  - `src/app/api/feeds/[id]/refresh/route.ts`
  - `src/app/api/feeds/[id]/keyword-filter/route.ts`
  - `src/app/api/categories/[id]/route.ts`
  - `src/app/api/categories/reorder/route.ts`
  - `src/app/api/articles/[id]/route.ts`
  - `src/app/api/articles/[id]/fulltext/route.ts`
  - `src/app/api/articles/[id]/tasks/route.ts`
  - `src/app/api/articles/[id]/ai-summary/route.ts`
  - `src/app/api/articles/[id]/ai-summary/stream/route.ts`
  - `src/app/api/articles/[id]/ai-translate/route.ts`
  - `src/app/api/articles/[id]/ai-translate/stream/route.ts`
  - `src/app/api/articles/[id]/ai-translate/segments/[index]/retry/route.ts`
  - `src/app/api/articles/mark-all-read/route.ts`
  - `src/app/api/ai-digests/route.ts`
  - `src/app/api/ai-digests/[feedId]/route.ts`
  - `src/app/api/ai-digests/[feedId]/generate/route.ts`
- API tests:
  - `src/app/api/feeds/routes.test.ts`
  - `src/app/api/feeds/[id]/keyword-filter/route.test.ts`
  - `src/app/api/categories/routes.test.ts`
  - `src/app/api/articles/routes.test.ts`
  - `src/app/api/articles/[id]/ai-summary/stream/route.test.ts`
  - `src/app/api/articles/[id]/ai-translate/stream/route.test.ts`
  - `src/app/api/ai-digests/routes.test.ts`
  - `src/app/api/ai-digests/[feedId]/route.test.ts`

Skills reference for implementers:
- `@test-driven-development`
- `@vitest`
- `@verification-before-completion`

## Task 1: 建立统一数字字符串 ID 校验基座（TDD）

**Files:**
- Create: `src/server/http/idSchemas.ts`
- Create: `src/server/http/idSchemas.test.ts`
- Modify: `src/app/api/categories/[id]/route.ts`
- Modify: `src/app/api/categories/reorder/route.ts`
- Test: `src/server/http/idSchemas.test.ts`

- [ ] **Step 1: 先写 `idSchemas` 失败测试，锁定合法与非法输入**

```ts
import { describe, expect, it } from 'vitest';
import { numericIdSchema } from './idSchemas';

describe('numericIdSchema', () => {
  it('accepts positive integer strings', () => {
    expect(numericIdSchema.parse('1')).toBe('1');
    expect(numericIdSchema.parse('9007199254740993')).toBe('9007199254740993');
  });

  it('rejects non-digit formats', () => {
    expect(() => numericIdSchema.parse('abc')).toThrow();
    expect(() => numericIdSchema.parse('-1')).toThrow();
    expect(() => numericIdSchema.parse('1.2')).toThrow();
    expect(() => numericIdSchema.parse('001')).toThrow();
  });
});
```

- [ ] **Step 2: 运行定向测试确认失败**

Run: `pnpm test:unit src/server/http/idSchemas.test.ts`
Expected: FAIL（文件/导出尚不存在）。

- [ ] **Step 3: 实现最小可用 `idSchemas`，并在 categories 路由接入**

```ts
// src/server/http/idSchemas.ts
import { z } from 'zod';

export const numericIdSchema = z.string().regex(/^[1-9]\d*$/, 'Invalid numeric id');
export const optionalNumericIdSchema = numericIdSchema.optional();
```

```ts
// 示例替换（categories）
import { numericIdSchema } from '../../../../server/http/idSchemas';

const paramsSchema = z.object({
  id: numericIdSchema,
});
```

- [ ] **Step 4: 重新运行定向测试确认通过**

Run: `pnpm test:unit src/server/http/idSchemas.test.ts`
Expected: PASS（`idSchemas` 测试通过，后续在 Task 5 统一处理旧 UUID fixture）。

- [ ] **Step 5: 提交**

```bash
git add src/server/http/idSchemas.ts src/server/http/idSchemas.test.ts \
  src/app/api/categories/[id]/route.ts src/app/api/categories/reorder/route.ts
git commit -m "refactor(api): 抽取统一数字ID校验schema"
```

## Task 2: 迁移 SQL 全量改为 bigint identity（TDD）

**Files:**
- Modify: `src/server/db/migrations/0001_init.sql`
- Modify: `src/server/db/migrations/0013_article_tasks.sql`
- Modify: `src/server/db/migrations/0014_article_translation_sessions.sql`
- Modify: `src/server/db/migrations/0018_article_ai_summary_streaming.sql`
- Modify: `src/server/db/migrations/0019_ai_digest_sources.sql`
- Modify: `src/server/db/migrations/0020_ai_digest_run_sources.sql`
- Modify: `src/server/db/migrations/aiDigestRunSourcesMigration.test.ts`
- Modify: `src/server/db/migrations/aiDigestSourcesMigration.test.ts`
- Modify: `src/server/db/migrations/articleTasksMigration.test.ts`
- Modify: `src/server/db/migrations/articleTranslationSessionsMigration.test.ts`
- Modify: `src/server/db/migrations/articleAiSummaryStreamingMigration.test.ts`
- Test: `src/server/db/migrations/*.test.ts`

- [ ] **Step 1: 先写/补 migration 测试断言，显式约束 bigint 与 identity**

```ts
// aiDigestRunSourcesMigration.test.ts
expect(sql).toContain('run_id bigint not null');
expect(sql).toContain('source_article_id bigint not null');

// aiDigestSourcesMigration.test.ts
expect(sql).toContain('selected_feed_ids bigint[] not null');
expect(sql).toContain('selected_category_ids bigint[] not null');

// articleAiSummaryStreamingMigration.test.ts
expect(sql).toContain('id bigint generated by default as identity primary key');
expect(sql).toContain('session_id bigint not null');
```

- [ ] **Step 2: 运行 migration 测试确认失败**

Run: `pnpm test:unit src/server/db/migrations`
Expected: FAIL（当前 SQL 仍是 `uuid`/`uuid[]`）。

- [ ] **Step 3: 改写 SQL 为 bigint 体系并保持约束语义不变**

```sql
-- 示例：0001_init.sql
create table if not exists categories (
  id bigint generated by default as identity primary key,
  ...
);

create table if not exists feeds (
  id bigint generated by default as identity primary key,
  category_id bigint null references categories(id) on delete set null,
  ...
);
```

```sql
-- 示例：0019_ai_digest_sources.sql
create table if not exists ai_digest_configs (
  feed_id bigint primary key references feeds(id) on delete cascade,
  selected_feed_ids bigint[] not null default '{}'::bigint[],
  selected_category_ids bigint[] not null default '{}'::bigint[],
  ...
);
```

- [ ] **Step 4: 重新运行 migration 测试确认通过**

Run: `pnpm test:unit src/server/db/migrations`
Expected: PASS（所有 migration 测试通过）。

- [ ] **Step 5: 提交**

```bash
git add src/server/db/migrations/0001_init.sql \
  src/server/db/migrations/0013_article_tasks.sql \
  src/server/db/migrations/0014_article_translation_sessions.sql \
  src/server/db/migrations/0018_article_ai_summary_streaming.sql \
  src/server/db/migrations/0019_ai_digest_sources.sql \
  src/server/db/migrations/0020_ai_digest_run_sources.sql \
  src/server/db/migrations/aiDigestRunSourcesMigration.test.ts \
  src/server/db/migrations/aiDigestSourcesMigration.test.ts \
  src/server/db/migrations/articleTasksMigration.test.ts \
  src/server/db/migrations/articleTranslationSessionsMigration.test.ts \
  src/server/db/migrations/articleAiSummaryStreamingMigration.test.ts
git commit -m "refactor(db): 将业务主外键迁移到bigint"
```

## Task 3: Repository 与服务层改造为 bigint 语义（TDD）

**Files:**
- Modify: `src/server/repositories/aiDigestRepo.ts`
- Modify: `src/server/repositories/articleAiSummaryRepo.ts`
- Modify: `src/server/repositories/categoriesRepo.ts`
- Modify: `src/server/services/aiDigestLifecycleService.ts`
- Modify: `src/app/api/articles/[id]/ai-summary/route.ts`
- Modify: `src/server/repositories/aiDigestRepo.test.ts`
- Modify: `src/server/repositories/articleAiSummaryRepo.test.ts`
- Modify: `src/server/repositories/categoriesRepo.test.ts`
- Test: `src/app/api/ai-digests/routes.test.ts`
- Test: `src/app/api/ai-digests/[feedId]/route.test.ts`
- Test: `src/app/api/articles/routes.test.ts`
- Test: `src/server/repositories/aiDigestRepo.test.ts`
- Test: `src/server/repositories/articleAiSummaryRepo.test.ts`
- Test: `src/server/repositories/categoriesRepo.test.ts`

- [ ] **Step 1: 先补失败测试，锁定 bigint cast 与“摘要会话不再传 UUID”行为**

```ts
// aiDigestRepo.test.ts
expect(sql).toContain('any($1::bigint[])');
expect(joinedSql).toContain('::bigint');
expect(createRunSql).toContain('returning');
expect(createRunSql).toContain('id');

// categoriesRepo.test.ts
expect(updateSql).toContain('any($1::bigint[])');
expect(updateSql).toContain('unnest($1::bigint[])');

// articles/routes.test.ts
expect(upsertAiSummarySessionMock).toHaveBeenCalledWith(
  pool,
  expect.not.objectContaining({ sessionId: expect.anything() }),
);

expect(createAiDigestWithCategoryResolutionMock).toHaveBeenCalledWith(
  pool,
  expect.not.objectContaining({ feedId: expect.anything() }),
);
```

- [ ] **Step 2: 运行定向测试确认失败**

Run: `pnpm test:unit src/server/repositories/aiDigestRepo.test.ts src/server/repositories/articleAiSummaryRepo.test.ts src/server/repositories/categoriesRepo.test.ts src/app/api/ai-digests/routes.test.ts src/app/api/ai-digests/[feedId]/route.test.ts src/app/api/articles/routes.test.ts`
Expected: FAIL（现有实现仍走 UUID 相关路径）。

- [ ] **Step 3: 替换 repository 的 uuid cast，移除业务层 randomUUID，并移除摘要路由显式 sessionId**

```ts
// aiDigestRepo.ts
values ($1, $2, $3, $4, $5::bigint[], '{}'::bigint[], $6::timestamptz)
...
fields.push(`selected_feed_ids = $${paramIndex++}::bigint[]`);
...
return `($1, $${articleParam}::bigint, $${positionParam})`;
...
a.feed_id = any($1::bigint[])
```

```ts
// articleAiSummaryRepo.ts
// 从 coalesce($1::uuid, gen_random_uuid()) 改为：不传 id 时使用 insert 默认 identity
```

```ts
// aiDigestLifecycleService.ts
// 删除 feedId = crypto.randomUUID()
// 改为 createAiDigestFeed 插入不传 id，依赖 returning 获取
```

```ts
// src/app/api/articles/[id]/ai-summary/route.ts
const session = await upsertAiSummarySession(pool, {
  articleId,
  sourceTextHash,
  status: 'queued',
  draftText: '',
  // 不再传 sessionId，由数据库 identity 生成
});
```

- [ ] **Step 4: 重新运行定向测试确认通过**

Run: `pnpm test:unit src/server/repositories/aiDigestRepo.test.ts src/server/repositories/articleAiSummaryRepo.test.ts src/server/repositories/categoriesRepo.test.ts src/app/api/ai-digests/routes.test.ts src/app/api/ai-digests/[feedId]/route.test.ts src/app/api/articles/routes.test.ts`
Expected: PASS（`::bigint[]` 路径、`insert ... returning id` 路径与摘要会话创建路径全部通过）。

- [ ] **Step 5: 提交**

```bash
git add src/server/repositories/aiDigestRepo.ts \
  src/server/repositories/articleAiSummaryRepo.ts \
  src/server/repositories/categoriesRepo.ts \
  src/server/services/aiDigestLifecycleService.ts \
  src/app/api/articles/[id]/ai-summary/route.ts \
  src/server/repositories/aiDigestRepo.test.ts \
  src/server/repositories/articleAiSummaryRepo.test.ts \
  src/server/repositories/categoriesRepo.test.ts \
  src/app/api/ai-digests/routes.test.ts \
  src/app/api/ai-digests/[feedId]/route.test.ts \
  src/app/api/articles/routes.test.ts
git commit -m "refactor(server): 移除UUID依赖并切换bigint查询"
```

## Task 4: API 路由参数校验全量切换为数字字符串（TDD）

**Files:**
- Modify: `src/app/api/feeds/route.ts`
- Modify: `src/app/api/feeds/[id]/route.ts`
- Modify: `src/app/api/feeds/[id]/refresh/route.ts`
- Modify: `src/app/api/feeds/[id]/keyword-filter/route.ts`
- Modify: `src/app/api/categories/[id]/route.ts`
- Modify: `src/app/api/categories/reorder/route.ts`
- Modify: `src/app/api/articles/[id]/route.ts`
- Modify: `src/app/api/articles/[id]/fulltext/route.ts`
- Modify: `src/app/api/articles/[id]/tasks/route.ts`
- Modify: `src/app/api/articles/[id]/ai-summary/route.ts`
- Modify: `src/app/api/articles/[id]/ai-summary/stream/route.ts`
- Modify: `src/app/api/articles/[id]/ai-translate/route.ts`
- Modify: `src/app/api/articles/[id]/ai-translate/stream/route.ts`
- Modify: `src/app/api/articles/[id]/ai-translate/segments/[index]/retry/route.ts`
- Modify: `src/app/api/articles/mark-all-read/route.ts`
- Modify: `src/app/api/ai-digests/route.ts`
- Modify: `src/app/api/ai-digests/[feedId]/route.ts`
- Modify: `src/app/api/ai-digests/[feedId]/generate/route.ts`
- Test: `src/app/api/articles/routes.test.ts`
- Test: `src/app/api/feeds/routes.test.ts`
- Test: `src/app/api/categories/routes.test.ts`

- [ ] **Step 1: 先写失败测试，锁定“数字字符串合法，UUID 字符串非法”**

```ts
it('rejects non-numeric id in params', async () => {
  const mod = await import('./[id]/route');
  const res = await mod.PATCH(
    new Request('http://localhost/api/categories/not-a-number', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Tech 2' }),
    }),
    { params: Promise.resolve({ id: 'not-a-number' }) },
  );
  const json = await res.json();
  expect(json.ok).toBe(false);
  expect(json.error.code).toBe('validation_error');
});
```

- [ ] **Step 2: 运行定向测试确认失败**

Run: `pnpm test:unit src/app/api/categories/routes.test.ts src/app/api/feeds/routes.test.ts src/app/api/articles/routes.test.ts`
Expected: FAIL（当前校验仍是 `uuid`）。

- [ ] **Step 3: 全量路由切换到 `numericIdSchema` 并移除 UUID 校验**

```ts
import { numericIdSchema } from '../../../../server/http/idSchemas';

const paramsSchema = z.object({
  id: numericIdSchema,
});

const bodySchema = z.strictObject({
  selectedFeedIds: z.array(numericIdSchema).min(1),
  categoryId: numericIdSchema.nullable().optional(),
});
```

- [ ] **Step 4: 重新运行定向测试确认通过**

Run: `pnpm test:unit src/app/api/categories/routes.test.ts -t \"rejects non-numeric id\"`
Expected: PASS（新加的数字 ID 校验用例通过；完整 API fixture 回归在 Task 5 完成）。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/feeds/route.ts src/app/api/feeds/[id]/route.ts \
  src/app/api/feeds/[id]/refresh/route.ts src/app/api/feeds/[id]/keyword-filter/route.ts \
  src/app/api/categories/[id]/route.ts src/app/api/categories/reorder/route.ts \
  src/app/api/articles/[id]/route.ts src/app/api/articles/[id]/fulltext/route.ts \
  src/app/api/articles/[id]/tasks/route.ts src/app/api/articles/[id]/ai-summary/route.ts \
  src/app/api/articles/[id]/ai-summary/stream/route.ts \
  src/app/api/articles/[id]/ai-translate/route.ts \
  src/app/api/articles/[id]/ai-translate/stream/route.ts \
  src/app/api/articles/[id]/ai-translate/segments/[index]/retry/route.ts \
  src/app/api/articles/mark-all-read/route.ts src/app/api/ai-digests/route.ts \
  src/app/api/ai-digests/[feedId]/route.ts src/app/api/ai-digests/[feedId]/generate/route.ts \
  src/app/api/articles/routes.test.ts src/app/api/feeds/routes.test.ts src/app/api/categories/routes.test.ts
git commit -m "refactor(api): 统一使用数字字符串ID校验"
```

## Task 5: API 测试 fixture 全量替换为数字字符串并补边界用例（TDD）

**Files:**
- Modify: `src/app/api/feeds/routes.test.ts`
- Modify: `src/app/api/feeds/[id]/keyword-filter/route.test.ts`
- Modify: `src/app/api/categories/routes.test.ts`
- Modify: `src/app/api/articles/routes.test.ts`
- Modify: `src/app/api/articles/[id]/ai-summary/stream/route.test.ts`
- Modify: `src/app/api/articles/[id]/ai-translate/stream/route.test.ts`
- Modify: `src/app/api/ai-digests/routes.test.ts`
- Modify: `src/app/api/ai-digests/[feedId]/route.test.ts`
- Test: 上述同文件

- [ ] **Step 1: 先改测试常量与 URL 参数为数字字符串，保留原语义**

```ts
const feedId = '1001';
const categoryId = '2001';
const articleId = '3001';
// URL 同步改成 /api/feeds/1001、/api/articles/3001 等
```

- [ ] **Step 2: 新增非法 ID 边界用例并确认能失败**

Run: `pnpm test:unit src/app/api/ai-digests/routes.test.ts src/app/api/feeds/[id]/keyword-filter/route.test.ts`
Expected: FAIL（新增 case 在实现完善前失败，或旧 fixture 与新校验冲突）。

- [ ] **Step 3: 调整断言与 mock 输入，确保行为与新校验一致**

```ts
expect(res.status).toBe(400);
expect(json.error.code).toBe('validation_error');
expect(json.error.fields.feedId ?? json.error.fields.id).toBeTruthy();
```

- [ ] **Step 4: 运行 API 相关测试集确认通过**

Run: `pnpm test:unit src/app/api`
Expected: PASS（API 测试全部通过）。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/feeds/routes.test.ts \
  src/app/api/feeds/[id]/keyword-filter/route.test.ts \
  src/app/api/categories/routes.test.ts \
  src/app/api/articles/routes.test.ts \
  src/app/api/articles/[id]/ai-summary/stream/route.test.ts \
  src/app/api/articles/[id]/ai-translate/stream/route.test.ts \
  src/app/api/ai-digests/routes.test.ts \
  src/app/api/ai-digests/[feedId]/route.test.ts
git commit -m "test(api): 更新ID夹具为数字字符串"
```

## Task 6: 全量验证与收口

**Files:**
- Modify: 无（仅验证与必要修正）
- Test: 全项目构建与关键单测

- [ ] **Step 1: 先做机械化扫描，确认业务链路已无 UUID 依赖残留**

Run: `rg -n \"z\\.string\\(\\)\\.uuid\\(|::uuid|gen_random_uuid\\(|crypto\\.randomUUID\\(\" src/server src/app/api`
Expected: 无命中（扫描范围仅含 `src/server` 与 `src/app/api`）。

- [ ] **Step 2: 运行关键定向回归，优先覆盖数据库与 API 主链路**

Run: `pnpm test:unit src/server/db/migrations src/app/api`
Expected: PASS。

- [ ] **Step 3: 执行项目强制构建验证**

Run: `pnpm build`
Expected: PASS（必须满足项目约束）。

- [ ] **Step 4: 运行可选全量单测回归**

Run: `pnpm test:unit`
Expected: PASS（如失败，定位并最小修复后重跑）。

- [ ] **Step 5: 汇总结果并提交最终收口提交（如有修复）**

```bash
git add -A
git commit -m "chore(validation): 完成bigint ID迁移回归验证"
```

## Completion Checklist

- [ ] 所有持久化链路不再使用 `uuid`/`gen_random_uuid()`/`::uuid[]`
- [ ] 所有 ID 参数校验改为数字字符串 schema
- [ ] `ai_digest_configs.feed_id` 与 `ai_digest_run_sources` 保持既有主键结构，仅迁移类型
- [ ] API 与前端传输类型仍为 `string`
- [ ] `pnpm build` 通过
