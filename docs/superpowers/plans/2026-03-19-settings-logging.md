# 设置日志模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置中心新增可持久化的日志配置与日志查看面板，并把服务端第三方请求与关键系统任务状态统一写入 `system_logs` 表后按等级筛选展示。

**Architecture:** 继续把日志开关与保留天数保存在 `PersistedSettings` / `app_settings.ui_settings` 中，但把日志正文拆到独立 `system_logs` 表。后端新增 `systemLogger` 作为唯一写入口，读取链路通过 `systemLogsService` + `/api/logs` 提供 opaque cursor 分页；worker、API route 和底层第三方请求封装只在明确的生命周期节点调用 logger，不直接散写 SQL。

**Tech Stack:** Next.js 16 + React 19 + TypeScript + pg + pg-boss + Zustand + Vitest + Testing Library + got + openai

---

## Context Snapshot

- Approved spec: `docs/superpowers/specs/2026-03-19-settings-logging-design.md`
- Existing settings flow:
  - `src/types/index.ts`
  - `src/features/settings/settingsSchema.ts`
  - `src/store/settingsStore.ts`
  - `src/app/api/settings/route.ts`
  - `src/features/settings/SettingsCenterDrawer.tsx`
- Existing worker / queue / task flow:
  - `src/worker/index.ts`
  - `src/worker/articleTaskStatus.ts`
  - `src/worker/aiSummaryStreamWorker.ts`
  - `src/worker/aiDigestGenerate.ts`
  - `src/server/queue/jobs.ts`
  - `src/server/queue/contracts.ts`
- Existing third-party request entry points:
  - `src/server/http/externalHttpClient.ts`
  - `src/server/rss/fetchFeedXml.ts`
  - `src/server/fulltext/fetchFulltextAndStore.ts`
  - `src/server/ai/openaiClient.ts`
  - `src/server/ai/streamSummarizeText.ts`
  - `src/server/ai/summarizeText.ts`
  - `src/server/ai/translateHtml.ts`
  - `src/server/ai/bilingualHtmlTranslator.ts`
  - `src/server/ai/translateTitle.ts`
  - `src/server/ai/aiDigestCompose.ts`
  - `src/server/ai/aiDigestRerank.ts`
- Existing tests worth extending instead of inventing a new harness:
  - `src/features/settings/settingsSchema.test.ts`
  - `src/store/settingsStore.test.ts`
  - `src/app/api/settings/routes.test.ts`
  - `src/app/api/articles/routes.test.ts`
  - `src/features/settings/SettingsCenterModal.test.tsx`
  - `src/lib/apiClient.test.ts`
  - `src/server/http/externalHttpClient.test.ts`
  - `src/server/fulltext/fetchFulltextAndStore.test.ts`
  - `src/server/ai/openaiClient.test.ts`
  - `src/server/ai/streamSummarizeText.test.ts`
  - `src/server/ai/summarizeText.test.ts`
  - `src/server/ai/translateHtml.test.ts`
  - `src/server/ai/bilingualHtmlTranslator.test.ts`
  - `src/server/ai/translateTitle.test.ts`
  - `src/server/ai/aiDigestCompose.test.ts`
  - `src/server/ai/aiDigestRerank.test.ts`
  - `src/worker/articleTaskStatus.test.ts`
  - `src/worker/aiSummaryStreamWorker.test.ts`
  - `src/worker/aiDigestGenerate.test.ts`
- Project constraints:
  - 不自动做浏览器测试。
  - 最终验证必须运行 `pnpm build`。
  - 使用 `pnpm` 作为 Node 包管理器。

## Scope Check

该 spec 覆盖配置、存储、统一写入、业务接入、前端展示五层，但它们共同服务于同一条“设置中心日志链路”。拆成多个计划会让边界日志规则、cursor 契约和 logger 入口分散，因此保留为一个计划，并拆成 6 个可独立提交、可单测验证的任务。

## File Structure Plan

Planned creates:
- `src/server/db/migrations/0022_system_logs.sql` - 新增 `system_logs` 表、level 约束和排序索引。
- `src/server/db/migrations/systemLogsMigration.test.ts` - 锁定 migration SQL 关键结构。
- `src/server/repositories/systemLogsRepo.ts` - 封装插入、分页读取、按保留期清理日志。
- `src/server/repositories/systemLogsRepo.test.ts` - 锁定 repo SQL、参数顺序和 `context_json` 映射。
- `src/server/services/systemLogsService.ts` - 负责 opaque cursor 编解码、limit 规范化和 API DTO 组装。
- `src/server/services/systemLogsService.test.ts` - 验证 cursor、排序、分页边界和 `context` 字段输出。
- `src/server/logging/systemLogger.ts` - 统一日志写入口，负责 enabled 短路、force write、字段归一化。
- `src/server/logging/systemLogger.test.ts` - 验证开关短路、边界日志、details/context 规范化。
- `src/app/api/logs/route.ts` - 新增只读日志接口。
- `src/app/api/logs/route.test.ts` - 验证 `/api/logs` 查询参数、分页和返回形状。
- `src/worker/systemLogCleanup.ts` - 后台清理过期日志的独立 worker 单元。
- `src/worker/systemLogCleanup.test.ts` - 验证保留天数读取与删除调用。
- `src/server/rss/fetchFeedXml.test.ts` - 锁定 RSS 抓取包装器向底层 HTTP 客户端传递日志元信息。
- `src/features/settings/panels/LogsSettingsPanel.tsx` - 日志设置与日志列表面板。
- `src/features/settings/panels/LogsSettingsPanel.test.tsx` - 验证筛选、纯文本详情展示、分页加载和配置交互。

Planned modifies:
- `src/types/index.ts` - 增加 `LoggingSettings`、`LoggingRetentionDays`、`SystemLogLevel`、`SystemLogCategory`、`SystemLogItem`。
- `src/features/settings/settingsSchema.ts` - 补齐 `logging` 默认值与归一化。
- `src/features/settings/settingsSchema.test.ts` - 验证默认值和非法保留天数回退。
- `src/store/settingsStore.ts` - 让草稿与保存链路认识 `persisted.logging`。
- `src/store/settingsStore.test.ts` - 验证日志配置保存时进入 `/api/settings` 请求体。
- `src/app/api/settings/route.ts` - 保存设置时写 settings / logging 边界日志。
- `src/app/api/settings/routes.test.ts` - 验证 `/api/settings` 读写 `logging` 并触发边界日志。
- `src/lib/apiClient.ts` - 新增 `getSystemLogs` 并定义日志 DTO / 查询参数。
- `src/lib/apiClient.test.ts` - 验证 `/api/logs` URL 组装和 DTO 映射。
- `src/features/settings/SettingsCenterDrawer.tsx` - 新增 `日志` 一级分区并接入日志面板。
- `src/features/settings/SettingsCenterModal.test.tsx` - 验证抽屉出现第四个 tab 且不把日志存入 `settingsStore`。
- `src/server/http/externalHttpClient.ts` - 为 RSS/HTML 请求补统一外部 API 日志。
- `src/server/http/externalHttpClient.test.ts` - 验证状态码、耗时和原始错误响应字符串写入 logger。
- `src/server/rss/fetchFeedXml.ts` - 为 RSS 抓取传入来源标签和上下文。
- `src/server/fulltext/fetchFulltextAndStore.ts` - 为全文抓取传入来源标签和文章上下文。
- `src/server/fulltext/fetchFulltextAndStore.test.ts` - 验证全文抓取调用底层 HTTP 时携带日志元信息。
- `src/server/ai/openaiClient.ts` - 为 OpenAI completion/stream 请求补统一日志包装。
- `src/server/ai/openaiClient.test.ts` - 验证包装器保留 `baseURL` 归一化并记录成功/失败日志。
- `src/server/ai/streamSummarizeText.ts` - 传入 `source/requestLabel` 元信息。
- `src/server/ai/streamSummarizeText.test.ts` - 验证摘要流式请求使用带日志包装的 client。
- `src/server/ai/summarizeText.ts` - 避免遗留同步摘要 helper 成为未覆盖的第三方请求入口。
- `src/server/ai/summarizeText.test.ts` - 验证同步摘要 helper 也带日志包装。
- `src/server/ai/translateHtml.ts` - 避免遗留翻译 helper 成为未覆盖的第三方请求入口。
- `src/server/ai/translateHtml.test.ts` - 验证 HTML 翻译 helper 也带日志包装。
- `src/server/ai/bilingualHtmlTranslator.ts` - 为正文翻译批量调用补日志来源信息。
- `src/server/ai/bilingualHtmlTranslator.test.ts` - 验证正文翻译调用 metadata。
- `src/server/ai/translateTitle.ts` - 为标题翻译调用补日志来源信息。
- `src/server/ai/translateTitle.test.ts` - 验证标题翻译调用 metadata。
- `src/server/ai/aiDigestCompose.ts` - 为 digest compose / map / fold 阶段补日志来源信息。
- `src/server/ai/aiDigestCompose.test.ts` - 验证 compose helper 通过统一 client 发请求。
- `src/server/ai/aiDigestRerank.ts` - 为 digest rerank 调用补日志来源信息。
- `src/server/ai/aiDigestRerank.test.ts` - 验证 rerank helper 通过统一 client 发请求。
- `src/server/queue/jobs.ts` - 新增 hourly cleanup job name。
- `src/server/queue/contracts.ts` - 为 cleanup job 设置单 worker 合同。
- `src/worker/index.ts` - 注册 cleanup handler、安排 hourly schedule，并给 RSS/AI translate 任务注入生命周期日志。
- `src/worker/articleTaskStatus.ts` - 扩展通用 task wrapper，支持可选生命周期日志。
- `src/worker/articleTaskStatus.test.ts` - 验证 wrapper 在开始/成功/失败节点调用 logger。
- `src/worker/aiSummaryStreamWorker.ts` - 为摘要开始/成功/失败日志补上下文。
- `src/worker/aiSummaryStreamWorker.test.ts` - 验证摘要 worker 生命周期日志。
- `src/worker/aiDigestGenerate.ts` - 为 AI Digest 开始/成功/失败写日志。
- `src/worker/aiDigestGenerate.test.ts` - 验证 digest 运行成功和失败日志。
- `src/app/api/articles/[id]/ai-summary/route.ts` - 为排队成功写 `AI summary queued`。
- `src/app/api/articles/[id]/ai-translate/route.ts` - 为排队成功写 `AI translation queued`。
- `src/app/api/articles/[id]/ai-translate/segments/[index]/retry/route.ts` - 为分段重试写 `warning` 日志。
- `src/app/api/articles/routes.test.ts` - 验证 summary/translate/retry 路由只在成功排队时写对应日志。

Skills reference for implementers:
- `@vitest`
- `@nodejs-best-practices`
- `@vercel-react-best-practices`
- `@verification-before-completion`

## Chunk 1: 配置层与共享类型（TDD）

### Task 1: 扩展日志设置配置模型

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/features/settings/settingsSchema.ts`
- Modify: `src/features/settings/settingsSchema.test.ts`
- Modify: `src/store/settingsStore.ts`
- Modify: `src/store/settingsStore.test.ts`
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/app/api/settings/routes.test.ts`

- [ ] **Step 1: 先写失败测试，锁定日志配置默认值、归一化和保存 round-trip**

```ts
it('adds logging defaults and rejects unsupported retention days', () => {
  const normalized = normalizePersistedSettings({});
  expect(normalized.logging).toEqual({ enabled: false, retentionDays: 7 });

  expect(
    normalizePersistedSettings({ logging: { enabled: true, retentionDays: 999 } }).logging,
  ).toEqual({ enabled: true, retentionDays: 7 });
});

it('persists logging settings through settingsStore saveDraft', async () => {
  useSettingsStore.getState().loadDraft();
  useSettingsStore.getState().updateDraft((draft) => {
    draft.persisted.logging.enabled = true;
    draft.persisted.logging.retentionDays = 14;
  });

  await useSettingsStore.getState().saveDraft();
  expect(lastSettingsPutBodyText).toContain('"logging":{"enabled":true,"retentionDays":14}');
});
```

- [ ] **Step 2: 运行设置层定向测试，确认当前失败**

Run: `pnpm test:unit src/features/settings/settingsSchema.test.ts src/store/settingsStore.test.ts src/app/api/settings/routes.test.ts`

Expected: FAIL，提示 `logging` 字段、默认值或 PUT/GET 断言不存在。

- [ ] **Step 3: 用最小实现补齐共享类型、schema 默认值和设置保存链路**

```ts
export type LoggingRetentionDays = 1 | 3 | 7 | 14 | 30 | 90;

export interface LoggingSettings {
  enabled: boolean;
  retentionDays: LoggingRetentionDays;
}

export interface PersistedSettings {
  general: GeneralSettings;
  ai: AIPersistedSettings;
  categories: Category[];
  rss: RssSettings;
  logging: LoggingSettings;
}
```

```ts
const defaultLoggingSettings: LoggingSettings = {
  enabled: false,
  retentionDays: 7,
};

function normalizeLoggingSettings(input: Record<string, unknown>): LoggingSettings {
  const loggingInput = isRecord(input.logging) ? input.logging : {};
  return {
    enabled: readBoolean(loggingInput.enabled, defaultLoggingSettings.enabled),
    retentionDays: readNumberEnum(
      loggingInput.retentionDays,
      [1, 3, 7, 14, 30, 90] as const,
      defaultLoggingSettings.retentionDays,
    ),
  };
}
```

- [ ] **Step 4: 重新运行设置层测试，确认通过**

Run: `pnpm test:unit src/features/settings/settingsSchema.test.ts src/store/settingsStore.test.ts src/app/api/settings/routes.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/types/index.ts src/features/settings/settingsSchema.ts src/features/settings/settingsSchema.test.ts src/store/settingsStore.ts src/store/settingsStore.test.ts src/app/api/settings/route.ts src/app/api/settings/routes.test.ts
git commit -m "feat(settings): 添加日志设置配置" \
  -m $'- 添加 logging.enabled 与 logging.retentionDays 共享类型和默认值\n- 更新 settings schema、store 与设置 API 的读写链路'
```

## Chunk 2: 存储层与读取 API（TDD）

### Task 2: 建立 `system_logs` 表、repository、cursor 服务和 `/api/logs`

**Files:**
- Create: `src/server/db/migrations/0022_system_logs.sql`
- Create: `src/server/db/migrations/systemLogsMigration.test.ts`
- Create: `src/server/repositories/systemLogsRepo.ts`
- Create: `src/server/repositories/systemLogsRepo.test.ts`
- Create: `src/server/services/systemLogsService.ts`
- Create: `src/server/services/systemLogsService.test.ts`
- Create: `src/app/api/logs/route.ts`
- Create: `src/app/api/logs/route.test.ts`

- [ ] **Step 1: 先写失败测试，锁定表结构、SQL 分页和 API 返回契约**

```ts
it('adds system_logs table with context_json column and descending indexes', () => {
  const sql = readFileSync('src/server/db/migrations/0022_system_logs.sql', 'utf8');
  expect(sql).toContain('create table if not exists system_logs');
  expect(sql).toContain('context_json jsonb not null default');
  expect(sql).toContain("check (level in ('error', 'warning', 'info'))");
  expect(sql).toContain('create index if not exists idx_system_logs_created_at_desc');
});

it('maps context_json to context and emits nextCursor', async () => {
  listSystemLogsMock.mockResolvedValue({
    items: [
      {
        id: '128',
        level: 'error',
        category: 'external_api',
        message: 'AI summary request failed',
        details: '{"error":{"message":"Rate limit exceeded"}}',
        source: 'aiSummaryStreamWorker',
        context: { status: 429, durationMs: 812 },
        createdAt: '2026-03-19T10:12:30.000Z',
      },
    ],
    nextCursor: 'opaque-cursor',
    hasMore: true,
  });
});
```

- [ ] **Step 2: 运行存储层定向测试，确认当前失败**

Run: `pnpm test:unit src/server/db/migrations/systemLogsMigration.test.ts src/server/repositories/systemLogsRepo.test.ts src/server/services/systemLogsService.test.ts src/app/api/logs/route.test.ts`

Expected: FAIL，提示 migration/repo/service/route 模块缺失。

- [ ] **Step 3: 用最小实现补齐独立日志表、repo、cursor 与读取 API**

```sql
create table if not exists system_logs (
  id bigint generated by default as identity primary key,
  level text not null check (level in ('error', 'warning', 'info')),
  category text not null,
  message text not null,
  details text null,
  source text not null,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_system_logs_created_at_desc
  on system_logs (created_at desc, id desc);

create index if not exists idx_system_logs_level_created_at_desc
  on system_logs (level, created_at desc, id desc);
```

```ts
export function encodeSystemLogCursor(payload: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export async function listSystemLogs(
  pool: Pool,
  input: { level?: SystemLogLevel; before?: string | null; limit: number },
) {
  // select ... context_json as "contextJson"
  // where (created_at, id) < (...)
  // order by created_at desc, id desc
}
```

- [ ] **Step 4: 重新运行存储层测试，确认通过**

Run: `pnpm test:unit src/server/db/migrations/systemLogsMigration.test.ts src/server/repositories/systemLogsRepo.test.ts src/server/services/systemLogsService.test.ts src/app/api/logs/route.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/db/migrations/0022_system_logs.sql src/server/db/migrations/systemLogsMigration.test.ts src/server/repositories/systemLogsRepo.ts src/server/repositories/systemLogsRepo.test.ts src/server/services/systemLogsService.ts src/server/services/systemLogsService.test.ts src/app/api/logs/route.ts src/app/api/logs/route.test.ts
git commit -m "feat(logging): 添加系统日志存储与查询接口" \
  -m $'- 添加 system_logs 表、分页查询和过期清理 SQL\n- 新增 cursor 服务与 /api/logs 只读接口'
```

## Chunk 3: 统一写入口与后台清理（TDD）

### Task 3: 实现 `systemLogger` 和 hourly cleanup worker

**Files:**
- Create: `src/server/logging/systemLogger.ts`
- Create: `src/server/logging/systemLogger.test.ts`
- Create: `src/worker/systemLogCleanup.ts`
- Create: `src/worker/systemLogCleanup.test.ts`
- Modify: `src/server/queue/jobs.ts`
- Modify: `src/server/queue/contracts.ts`
- Modify: `src/worker/index.ts`

- [ ] **Step 1: 先写失败测试，锁定 enabled 短路、force write 和 hourly cleanup 契约**

```ts
it('skips insert when logging is disabled', async () => {
  getUiSettingsMock.mockResolvedValue({ logging: { enabled: false, retentionDays: 7 } });
  await writeSystemLog(pool, { level: 'info', category: 'settings', source: 'route', message: 'x' });
  expect(insertSystemLogMock).not.toHaveBeenCalled();
});

it('force writes boundary logs even when logging is disabled', async () => {
  getUiSettingsMock.mockResolvedValue({ logging: { enabled: false, retentionDays: 7 } });
  await writeSystemLog(
    pool,
    { level: 'info', category: 'settings', source: 'route', message: 'Logging enabled' },
    { forceWrite: true },
  );
  expect(insertSystemLogMock).toHaveBeenCalled();
});
```

```ts
it('cleans expired logs with the configured retentionDays', async () => {
  getUiSettingsMock.mockResolvedValue({ logging: { enabled: false, retentionDays: 30 } });
  await runSystemLogCleanup({ pool });
  expect(deleteExpiredSystemLogsMock).toHaveBeenCalledWith(pool, { retentionDays: 30 });
});
```

- [ ] **Step 2: 运行 logger/cleanup 定向测试，确认当前失败**

Run: `pnpm test:unit src/server/logging/systemLogger.test.ts src/worker/systemLogCleanup.test.ts`

Expected: FAIL，提示 logger/cleanup 模块缺失或 queue job 未定义。

- [ ] **Step 3: 用最小实现补齐统一写入口与后台清理任务**

```ts
export async function writeSystemLog(
  pool: Pool | PoolClient,
  input: WriteSystemLogInput,
  options?: { forceWrite?: boolean; loggingOverride?: LoggingSettings },
) {
  const logging =
    options?.loggingOverride ??
    normalizePersistedSettings(await getUiSettings(pool)).logging;

  if (!logging.enabled && !options?.forceWrite) {
    return { written: false };
  }

  await insertSystemLog(pool, {
    ...input,
    details: input.details ?? null,
    context: input.context ?? {},
  });

  return { written: true };
}
```

```ts
export async function runSystemLogCleanup(input: { pool: Pool | PoolClient }) {
  const logging = normalizePersistedSettings(await getUiSettings(input.pool)).logging;
  return deleteExpiredSystemLogs(input.pool, { retentionDays: logging.retentionDays });
}
```

- [ ] **Step 4: 重新运行 logger/cleanup 定向测试，确认通过**

Run: `pnpm test:unit src/server/logging/systemLogger.test.ts src/worker/systemLogCleanup.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/logging/systemLogger.ts src/server/logging/systemLogger.test.ts src/worker/systemLogCleanup.ts src/worker/systemLogCleanup.test.ts src/server/queue/jobs.ts src/server/queue/contracts.ts src/worker/index.ts
git commit -m "feat(logging): 添加统一日志服务与清理任务" \
  -m $'- 添加 systemLogger 并支持 enabled 短路与 force write\n- 添加每小时执行一次的 system_logs 清理 worker'
```

## Chunk 4: 任务生命周期与设置边界日志（TDD）

### Task 4: 接入设置保存、任务排队和任务生命周期日志

**Files:**
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/app/api/settings/routes.test.ts`
- Modify: `src/app/api/articles/[id]/ai-summary/route.ts`
- Modify: `src/app/api/articles/[id]/ai-translate/route.ts`
- Modify: `src/app/api/articles/[id]/ai-translate/segments/[index]/retry/route.ts`
- Modify: `src/app/api/articles/routes.test.ts`
- Modify: `src/worker/articleTaskStatus.ts`
- Modify: `src/worker/articleTaskStatus.test.ts`
- Modify: `src/worker/aiSummaryStreamWorker.ts`
- Modify: `src/worker/aiSummaryStreamWorker.test.ts`
- Modify: `src/worker/aiDigestGenerate.ts`
- Modify: `src/worker/aiDigestGenerate.test.ts`
- Modify: `src/worker/index.ts`

- [ ] **Step 1: 先写失败测试，锁定排队、开始、成功、失败和边界日志**

```ts
it('writes Logging enabled when settings save turns logging on', async () => {
  getUiSettingsMock.mockResolvedValue({ logging: { enabled: false, retentionDays: 7 } });
  updateUiSettingsMock.mockResolvedValue(normalizePersistedSettings({ logging: { enabled: true, retentionDays: 7 } }));

  await mod.PUT(new Request('http://localhost/api/settings', { method: 'PUT', body: JSON.stringify({ logging: { enabled: true, retentionDays: 7 } }) }));
  expect(writeSystemLogMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ message: 'Logging enabled' }),
    expect.objectContaining({ forceWrite: true }),
  );
});

it('writes Logging disabled as the last forced boundary log when settings save turns logging off', async () => {
  getUiSettingsMock.mockResolvedValue({ logging: { enabled: true, retentionDays: 7 } });
  updateUiSettingsMock.mockResolvedValue(normalizePersistedSettings({ logging: { enabled: false, retentionDays: 7 } }));

  await mod.PUT(new Request('http://localhost/api/settings', { method: 'PUT', body: JSON.stringify({ logging: { enabled: false, retentionDays: 7 } }) }));
  expect(writeSystemLogMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ message: 'Logging disabled' }),
    expect.objectContaining({ forceWrite: true }),
  );
});

it('records retentionDays changes only while logging stays enabled', async () => {
  getUiSettingsMock.mockResolvedValue({ logging: { enabled: true, retentionDays: 7 } });
  updateUiSettingsMock.mockResolvedValue(normalizePersistedSettings({ logging: { enabled: true, retentionDays: 30 } }));

  await mod.PUT(new Request('http://localhost/api/settings', { method: 'PUT', body: JSON.stringify({ logging: { enabled: true, retentionDays: 30 } }) }));
  expect(writeSystemLogMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ message: 'Log retention days updated', context: { retentionDays: 30 } }),
  );
});

it('does not write retentionDays change logs while logging remains disabled', async () => {
  getUiSettingsMock.mockResolvedValue({ logging: { enabled: false, retentionDays: 7 } });
  updateUiSettingsMock.mockResolvedValue(normalizePersistedSettings({ logging: { enabled: false, retentionDays: 30 } }));

  await mod.PUT(new Request('http://localhost/api/settings', { method: 'PUT', body: JSON.stringify({ logging: { enabled: false, retentionDays: 30 } }) }));
  expect(writeSystemLogMock).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ message: 'Log retention days updated' }),
    expect.anything(),
  );
});

it('writes AI translation segment retry as warning only when enqueue succeeds', async () => {
  enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-2' });
  await retryRoute.POST(new Request('http://localhost/api/articles/1/ai-translate/segments/0/retry'), { params: Promise.resolve({ id: '1', index: '0' }) });
  expect(writeSystemLogMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ level: 'warning', message: 'AI translation segment retry queued' }),
  );
});
```

- [ ] **Step 2: 运行生命周期定向测试，确认当前失败**

Run: `pnpm test:unit src/app/api/settings/routes.test.ts src/app/api/articles/routes.test.ts src/worker/articleTaskStatus.test.ts src/worker/aiSummaryStreamWorker.test.ts src/worker/aiDigestGenerate.test.ts`

Expected: FAIL，提示 logger 未调用或生命周期钩子不存在。

- [ ] **Step 3: 用最小实现把边界规则和生命周期节点接入统一 logger**

```ts
await writeSystemLog(pool, {
  level: 'info',
  category: 'ai_summary',
  source: 'app/api/articles/[id]/ai-summary',
  message: 'AI summary queued',
  context: { articleId, sessionId: session.id },
});
```

```ts
await runArticleTaskWithStatus({
  pool,
  articleId,
  type: 'ai_translate',
  jobId,
  logLifecycle: {
    category: 'ai_translate',
    source: 'worker/index',
    startedMessage: 'AI translation started',
    succeededMessage: 'AI translation succeeded',
    failedMessage: 'AI translation failed',
    context: { articleId, jobId, segmentIndex },
  },
  fn: async () => {
    // existing translation work
  },
});
```

```ts
if (!prev.logging.enabled && next.logging.enabled) {
  await writeSystemLog(pool, {
    level: 'info',
    category: 'settings',
    source: 'app/api/settings',
    message: 'Logging enabled',
    context: { retentionDays: next.logging.retentionDays },
  }, { forceWrite: true });
} else if (prev.logging.enabled && !next.logging.enabled) {
  await writeSystemLog(pool, {
    level: 'info',
    category: 'settings',
    source: 'app/api/settings',
    message: 'Logging disabled',
    context: { retentionDays: prev.logging.retentionDays },
  }, { forceWrite: true });
} else if (
  prev.logging.enabled &&
  next.logging.enabled &&
  prev.logging.retentionDays !== next.logging.retentionDays
) {
  await writeSystemLog(pool, {
    level: 'info',
    category: 'settings',
    source: 'app/api/settings',
    message: 'Log retention days updated',
    context: { retentionDays: next.logging.retentionDays },
  });
}
```

- [ ] **Step 4: 重新运行生命周期定向测试，确认通过**

Run: `pnpm test:unit src/app/api/settings/routes.test.ts src/app/api/articles/routes.test.ts src/worker/articleTaskStatus.test.ts src/worker/aiSummaryStreamWorker.test.ts src/worker/aiDigestGenerate.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/app/api/settings/route.ts src/app/api/settings/routes.test.ts src/app/api/articles/[id]/ai-summary/route.ts src/app/api/articles/[id]/ai-translate/route.ts src/app/api/articles/[id]/ai-translate/segments/[index]/retry/route.ts src/app/api/articles/routes.test.ts src/worker/articleTaskStatus.ts src/worker/articleTaskStatus.test.ts src/worker/aiSummaryStreamWorker.ts src/worker/aiSummaryStreamWorker.test.ts src/worker/aiDigestGenerate.ts src/worker/aiDigestGenerate.test.ts src/worker/index.ts
git commit -m "feat(logging): 接入任务生命周期日志" \
  -m $'- 接入 settings、AI summary、AI translate、AI digest 的关键生命周期日志\n- 固化 Logging enabled、Logging disabled、retentionDays 变更和分段重试规则'
```

## Chunk 5: 第三方请求日志（TDD）

### Task 5: 把所有现有第三方请求统一接入 `external_api` 日志

**Files:**
- Modify: `src/server/http/externalHttpClient.ts`
- Modify: `src/server/http/externalHttpClient.test.ts`
- Modify: `src/server/rss/fetchFeedXml.ts`
- Create: `src/server/rss/fetchFeedXml.test.ts`
- Modify: `src/server/fulltext/fetchFulltextAndStore.ts`
- Modify: `src/server/fulltext/fetchFulltextAndStore.test.ts`
- Modify: `src/server/ai/openaiClient.ts`
- Modify: `src/server/ai/openaiClient.test.ts`
- Modify: `src/server/ai/streamSummarizeText.ts`
- Modify: `src/server/ai/streamSummarizeText.test.ts`
- Modify: `src/server/ai/summarizeText.ts`
- Modify: `src/server/ai/summarizeText.test.ts`
- Modify: `src/server/ai/translateHtml.ts`
- Modify: `src/server/ai/translateHtml.test.ts`
- Modify: `src/server/ai/bilingualHtmlTranslator.ts`
- Modify: `src/server/ai/bilingualHtmlTranslator.test.ts`
- Modify: `src/server/ai/translateTitle.ts`
- Modify: `src/server/ai/translateTitle.test.ts`
- Modify: `src/server/ai/aiDigestCompose.ts`
- Modify: `src/server/ai/aiDigestCompose.test.ts`
- Modify: `src/server/ai/aiDigestRerank.ts`
- Modify: `src/server/ai/aiDigestRerank.test.ts`

- [ ] **Step 1: 先写失败测试，锁定成功仅写元信息、失败原样写 `details`**

```ts
it('writes upstream JSON error payload as raw details text', async () => {
  const responseText = '{"error":{"message":"Rate limit exceeded"}}';
  writeSystemLogMock.mockResolvedValue({ written: true });

  const res = await fetchRssXml(`${baseUrl}/error.json`, {
    timeoutMs: 1000,
    userAgent: 'test-agent',
    logging: {
      source: 'server/rss/fetchFeedXml',
      requestLabel: 'RSS fetch',
      context: { feedUrl: `${baseUrl}/error.json` },
    },
  });

  expect(res.status).toBe(429);
  expect(writeSystemLogMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      level: 'error',
      category: 'external_api',
      details: responseText,
    }),
  );
});
```

```ts
it('passes source metadata into createOpenAIClient', async () => {
  await streamSummarizeText({
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
    text: 'hello',
  });

  expect(createOpenAIClientMock).toHaveBeenCalledWith(
    expect.objectContaining({
      source: 'server/ai/streamSummarizeText',
      requestLabel: 'AI summary request',
    }),
  );
});
```

- [ ] **Step 2: 运行第三方请求定向测试，确认当前失败**

Run: `pnpm test:unit src/server/http/externalHttpClient.test.ts src/server/rss/fetchFeedXml.test.ts src/server/fulltext/fetchFulltextAndStore.test.ts src/server/ai/openaiClient.test.ts src/server/ai/streamSummarizeText.test.ts src/server/ai/summarizeText.test.ts src/server/ai/translateHtml.test.ts src/server/ai/bilingualHtmlTranslator.test.ts src/server/ai/translateTitle.test.ts src/server/ai/aiDigestCompose.test.ts src/server/ai/aiDigestRerank.test.ts`

Expected: FAIL，提示 `logging` metadata、logger 调用或 details 断言不存在。

- [ ] **Step 3: 用最小实现给现有 HTTP/OpenAI 包装器补统一外部 API 日志**

```ts
const originalCreate = client.chat.completions.create.bind(client.chat.completions);

client.chat.completions.create = async ((payload, requestOptions) => {
  const startedAt = Date.now();

  try {
    const result = await originalCreate(payload, requestOptions);
    await writeSystemLog(getPool(), {
      level: 'info',
      category: 'external_api',
      source: input.source,
      message: `${input.requestLabel} completed`,
      context: {
        url: normalizeBaseUrl(input.apiBaseUrl),
        method: 'POST',
        model: typeof payload === 'object' && payload ? payload.model : null,
        durationMs: Date.now() - startedAt,
      },
    });
    return result;
  } catch (err) {
    await writeSystemLog(getPool(), {
      level: 'error',
      category: 'external_api',
      source: input.source,
      message: `${input.requestLabel} failed`,
      details: stringifyExternalError(err),
      context: {
        url: normalizeBaseUrl(input.apiBaseUrl),
        method: 'POST',
        durationMs: Date.now() - startedAt,
      },
    });
    throw err;
  }
}) as typeof client.chat.completions.create;
```

```ts
await writeSystemLog(getPool(), {
  level: status >= 200 && status < 300 ? 'info' : 'error',
  category: 'external_api',
  source: logging.source,
  message: `${logging.requestLabel} ${status >= 200 && status < 300 ? 'completed' : 'failed'}`,
  details: status >= 200 && status < 300 ? null : rawResponseBody,
  context: {
    url: finalUrl,
    method: 'GET',
    status,
    durationMs,
    ...logging.context,
  },
});
```

- [ ] **Step 4: 重新运行第三方请求定向测试，确认通过**

Run: `pnpm test:unit src/server/http/externalHttpClient.test.ts src/server/rss/fetchFeedXml.test.ts src/server/fulltext/fetchFulltextAndStore.test.ts src/server/ai/openaiClient.test.ts src/server/ai/streamSummarizeText.test.ts src/server/ai/summarizeText.test.ts src/server/ai/translateHtml.test.ts src/server/ai/bilingualHtmlTranslator.test.ts src/server/ai/translateTitle.test.ts src/server/ai/aiDigestCompose.test.ts src/server/ai/aiDigestRerank.test.ts`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/http/externalHttpClient.ts src/server/http/externalHttpClient.test.ts src/server/rss/fetchFeedXml.ts src/server/rss/fetchFeedXml.test.ts src/server/fulltext/fetchFulltextAndStore.ts src/server/fulltext/fetchFulltextAndStore.test.ts src/server/ai/openaiClient.ts src/server/ai/openaiClient.test.ts src/server/ai/streamSummarizeText.ts src/server/ai/streamSummarizeText.test.ts src/server/ai/summarizeText.ts src/server/ai/summarizeText.test.ts src/server/ai/translateHtml.ts src/server/ai/translateHtml.test.ts src/server/ai/bilingualHtmlTranslator.ts src/server/ai/bilingualHtmlTranslator.test.ts src/server/ai/translateTitle.ts src/server/ai/translateTitle.test.ts src/server/ai/aiDigestCompose.ts src/server/ai/aiDigestCompose.test.ts src/server/ai/aiDigestRerank.ts src/server/ai/aiDigestRerank.test.ts
git commit -m "feat(logging): 接入外部 API 调用日志" \
  -m $'- 统一记录 RSS、全文抓取与 OpenAI 请求的状态、耗时和来源信息\n- 在第三方失败时原样保留 JSON 或文本响应到 details'
```

## Chunk 6: 设置中心日志面板（TDD）

### Task 6: 交付日志设置与日志查看 UI

**Files:**
- Modify: `src/lib/apiClient.ts`
- Modify: `src/lib/apiClient.test.ts`
- Modify: `src/features/settings/SettingsCenterDrawer.tsx`
- Modify: `src/features/settings/SettingsCenterModal.test.tsx`
- Create: `src/features/settings/panels/LogsSettingsPanel.tsx`
- Create: `src/features/settings/panels/LogsSettingsPanel.test.tsx`

- [ ] **Step 1: 先写失败测试，锁定新 tab、筛选和纯文本详情展示**

```tsx
it('renders logging as the fourth settings section', async () => {
  renderWithNotifications();
  fireEvent.click(screen.getByLabelText('打开设置'));

  expect(await screen.findByTestId('settings-section-tab-logging')).toBeInTheDocument();
});

it('renders details as plain text instead of HTML', async () => {
  render(
    <LogsSettingsPanel
      draft={draft}
      onChange={() => undefined}
      initialLogs={[
        {
          id: '1',
          level: 'error',
          category: 'external_api',
          message: 'AI summary request failed',
          details: '<script>alert(1)</script>{"error":{"message":"429"}}',
          source: 'aiSummaryStreamWorker',
          context: { status: 429 },
          createdAt: '2026-03-19T10:12:30.000Z',
        },
      ]}
    />,
  );

  expect(screen.getByText('<script>alert(1)</script>{"error":{"message":"429"}}')).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
});

it('refetches logs with level filter and resets the list', async () => {
  getSystemLogsMock
    .mockResolvedValueOnce({
      items: [{ id: '1', level: 'info', category: 'settings', message: 'Logging enabled', details: null, source: 'settings', context: {}, createdAt: '2026-03-19T10:00:00.000Z' }],
      nextCursor: 'cursor-1',
      hasMore: true,
    })
    .mockResolvedValueOnce({
      items: [{ id: '2', level: 'error', category: 'external_api', message: 'AI summary request failed', details: '{"error":{"message":"429"}}', source: 'aiSummaryStreamWorker', context: { status: 429 }, createdAt: '2026-03-19T10:05:00.000Z' }],
      nextCursor: null,
      hasMore: false,
    });

  render(<LogsSettingsPanel draft={draft} onChange={() => undefined} />);
  fireEvent.click(await screen.findByRole('button', { name: 'error' }));

  expect(getSystemLogsMock).toHaveBeenLastCalledWith(expect.objectContaining({ level: 'error', before: null }));
  expect(screen.queryByText('Logging enabled')).not.toBeInTheDocument();
  expect(screen.getByText('AI summary request failed')).toBeInTheDocument();
});

it('loads more logs with nextCursor and appends items', async () => {
  getSystemLogsMock
    .mockResolvedValueOnce({
      items: [{ id: '1', level: 'info', category: 'settings', message: 'Logging enabled', details: null, source: 'settings', context: {}, createdAt: '2026-03-19T10:00:00.000Z' }],
      nextCursor: 'cursor-1',
      hasMore: true,
    })
    .mockResolvedValueOnce({
      items: [{ id: '2', level: 'warning', category: 'ai_translate', message: 'AI translation segment retry queued', details: null, source: 'route', context: { segmentIndex: 1 }, createdAt: '2026-03-19T09:59:00.000Z' }],
      nextCursor: null,
      hasMore: false,
    });

  render(<LogsSettingsPanel draft={draft} onChange={() => undefined} />);
  fireEvent.click(await screen.findByRole('button', { name: '加载更多' }));

  expect(getSystemLogsMock).toHaveBeenLastCalledWith(expect.objectContaining({ before: 'cursor-1' }));
  expect(screen.getByText('Logging enabled')).toBeInTheDocument();
  expect(screen.getByText('AI translation segment retry queued')).toBeInTheDocument();
});

it('keeps the current level filter when loading more pages', async () => {
  getSystemLogsMock
    .mockResolvedValueOnce({
      items: [{ id: '1', level: 'error', category: 'external_api', message: 'first error', details: null, source: 'summary', context: {}, createdAt: '2026-03-19T10:00:00.000Z' }],
      nextCursor: 'cursor-error',
      hasMore: true,
    })
    .mockResolvedValueOnce({
      items: [{ id: '2', level: 'error', category: 'external_api', message: 'older error', details: null, source: 'summary', context: {}, createdAt: '2026-03-19T09:59:00.000Z' }],
      nextCursor: null,
      hasMore: false,
    });

  render(<LogsSettingsPanel draft={draft} onChange={() => undefined} />);
  fireEvent.click(await screen.findByRole('button', { name: 'error' }));
  fireEvent.click(await screen.findByRole('button', { name: '加载更多' }));

  expect(getSystemLogsMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ level: 'error', before: 'cursor-error' }),
  );
});
```

- [ ] **Step 2: 运行前端定向测试，确认当前失败**

Run: `pnpm test:unit src/lib/apiClient.test.ts src/features/settings/panels/LogsSettingsPanel.test.tsx src/features/settings/SettingsCenterModal.test.tsx`

Expected: FAIL，提示 `getSystemLogs`、`settings-section-tab-logging` 或日志面板不存在。

- [ ] **Step 3: 用最小实现补齐 API client、日志面板和设置抽屉整合**

```ts
export async function getSystemLogs(input: {
  level?: SystemLogLevel;
  limit?: number;
  before?: string | null;
}): Promise<{ items: SystemLogItem[]; nextCursor: string | null; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (input.level) params.set('level', input.level);
  if (input.limit) params.set('limit', String(input.limit));
  if (input.before) params.set('before', input.before);
  return requestApi(`/api/logs?${params.toString()}`);
}
```

```tsx
const loadLogs = async (input: { level: 'all' | SystemLogLevel; before: string | null; append: boolean }) => {
  const data = await getSystemLogs({
    level: input.level === 'all' ? undefined : input.level,
    before: input.before,
    limit: 50,
  });

  setItems((current) => (input.append ? [...current, ...data.items] : data.items));
  setNextCursor(data.nextCursor);
  setHasMore(data.hasMore);
};

const handleFilterChange = (level: 'all' | SystemLogLevel) => {
  setLevel(level);
  void loadLogs({ level, before: null, append: false });
};

const handleLoadMore = () => {
  if (!nextCursor) return;
  void loadLogs({ level, before: nextCursor, append: true });
};
```

```tsx
function renderLogDetails(details: string | null) {
  if (!details) return null;

  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-3 text-xs">
      {details}
    </pre>
  );
}
```

```tsx
const sectionItems: SettingsSectionItem[] = [
  { key: 'general', label: '通用', hint: '外观与阅读', icon: Palette },
  { key: 'rss', label: 'RSS', hint: '抓取与过滤', icon: Rss },
  { key: 'ai', label: 'AI', hint: '模型与接口', icon: Bot },
  { key: 'logging', label: '日志', hint: '开关与查看', icon: ScrollText },
];
```

- [ ] **Step 4: 重新运行前端定向测试，确认通过**

Run: `pnpm test:unit src/lib/apiClient.test.ts src/features/settings/panels/LogsSettingsPanel.test.tsx src/features/settings/SettingsCenterModal.test.tsx`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/apiClient.ts src/lib/apiClient.test.ts src/features/settings/SettingsCenterDrawer.tsx src/features/settings/SettingsCenterModal.test.tsx src/features/settings/panels/LogsSettingsPanel.tsx src/features/settings/panels/LogsSettingsPanel.test.tsx
git commit -m "feat(settings): 添加日志查看面板" \
  -m $'- 在设置中心新增日志一级分区和日志配置控件\n- 添加等级筛选、opaque cursor 分页和纯文本 details 展示'
```

## Final Verification

- [ ] **Step 1: 运行完整单测**

Run: `pnpm test:unit`

Expected: PASS

- [ ] **Step 2: 运行构建验证**

Run: `pnpm build`

Expected: PASS，无 TypeScript、Next.js 构建错误。

- [ ] **Step 3: 记录非自动化验证边界**

Run: `printf 'no browser automation in this task\n'`

Expected: 输出提醒即可；本轮不新增浏览器自动化测试，只保留单测和构建验证。
