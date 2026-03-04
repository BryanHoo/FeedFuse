# 文章异步任务状态持久化与轮询重构

**Date:** 2026-03-04  
**Status:** resolved  
**Area:** article async tasks / worker / ArticleView  
**Related:** branch `codex/async-tasks-refactor`
**Follow-up:** `docs/summaries/2026-03-04-immersive-translation.md`

## Symptom

- `fulltext` / `ai_summary` / `ai_translate` 执行期间，前端依赖对 `GET /api/articles/:id` 的 1Hz 轮询来判断完成，payload 大、开销高。
- 任务失败原因不稳定（刷新/切换文章后容易丢失），用户难以理解为何失败/如何重试。
- worker 某些分支会 `continue`，导致 job 看似“成功完成”但没有产出（前端只能靠超时兜底）。

## Impact

- 前端在任务执行期间产生不必要的高频“大接口”请求。
- 任务失败反馈弱，用户需要重复尝试或猜测原因。
- worker “成功但无产出” 会让 UI 状态不一致，降低可预期性。

## Root Cause

- 缺少对文章异步任务的**持久化状态模型**：队列入队、执行、失败、错误码/错误信息都没有统一存储与对外接口。
- 前端只能通过反复刷新文章详情判断产物字段是否出现，无法准确区分 `queued/running/failed`。

## Fix

- 引入 `article_tasks` 持久化表（按 `article_id + type` 唯一）存储 `queued/running/succeeded/failed` + `attempts` + `errorCode/errorMessage`。
- 新增 `GET /api/articles/:id/tasks` 轻量状态接口：无记录时返回 `idle`（前端固定 shape，避免 join）。
- enqueue routes 在入队成功时写入 `queued`（含 `jobId`）。
- worker 执行阶段统一写入 `running/succeeded/failed`，并通过 `src/server/tasks/errorMapping.ts` 将错误映射为稳定 `errorCode/errorMessage`。
- 前端 `ArticleView` 改为轮询 `getArticleTasks`（小 payload + backoff + `AbortController` 可取消），仅在 `succeeded` 时 `refreshArticle` 一次；失败时展示持久化错误并提供“重试”。

Files:
- `src/server/db/migrations/0013_article_tasks.sql`
- `src/server/repositories/articleTasksRepo.ts`
- `src/server/tasks/errorMapping.ts`
- `src/app/api/articles/[id]/tasks/route.ts`
- `src/worker/articleTaskStatus.ts`
- `src/worker/index.ts`
- `src/lib/apiClient.ts`
- `src/lib/polling.ts`
- `src/features/articles/ArticleView.tsx`

## Verification (Evidence)

- Run: `pnpm run test:unit`
  - Result: `79 passed | 1 skipped` test files, `276 passed | 4 skipped` tests

## Prevention / Follow-ups

- API contract tests 覆盖 `/api/articles/:id/tasks` 的 shape（含 `idle` fallback）。
- UI 单测覆盖：任务 `failed` 时展示 `errorMessage` 并可“重试”。
- 若后续新增更多文章级异步任务，优先复用 `article_tasks` + `/tasks` + `pollWithBackoff` 模式。

## Notes

- `/tasks` 接口无记录即 `idle`，用于简化前端状态机与“首次请求”逻辑。
- 轮询使用 backoff（`pollWithBackoff`），并通过 `AbortSignal` 避免切换文章后 setState 泄漏。
