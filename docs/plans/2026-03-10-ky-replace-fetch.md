# 使用 ky 替换浏览器侧 fetch Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 将浏览器侧对内部 `/api/**` 的请求从直接 `fetch` 迁移到统一的 `ky` client，并统一 envelope 解析与错误映射；RSS 校验仍返回 `RssValidationResult`（不抛异常、不全局 notify）。

**Architecture:** 在 `src/lib/apiClient.ts` 内创建私有 ky instance，所有内部 API 调用继续通过 `requestApi<T>()`（私有）完成；新增导出 `validateRssUrl` 并将 `src/features/feeds/services/rssValidationService.ts` 退化为 re-export，避免散落的请求配置与错误处理。

**Tech Stack:** `next`, `typescript`, `vitest`, `ky`, Fetch API

---

## 前置阅读 / 相关经验

- 已检查 `docs/summaries/`：当前仅有与流式摘要 hook 重置相关的总结（`docs/summaries/2026-03-09-streaming-summary-hook-reset.md`），与本次网络层迁移无直接关联，因此不在本计划中引用为约束。

## 约束与范围

- **仅**迁移浏览器侧内部 `/api/**` 调用：
  - `src/lib/apiClient.ts` 中的 `requestApi<T>()`
  - `src/features/feeds/services/rssValidationService.ts`（迁移后不再直接用 `fetch`）
- **不**触碰服务端 / Route Handler 对外部站点的 `fetch`（RSS/XML、全文、图片代理等）。
- 默认不做 retry（`retry: 0`），避免 POST/PATCH/DELETE 重复提交。
- 默认 `throwHttpErrors: false`，由 `requestApi` 统一处理 HTTP 非 2xx + envelope 映射。

---

### Task 1: 创建隔离 worktree（若尚未创建）

**Files:**

- None

**Step 1: Create worktree**

Run: `git worktree add .worktrees/ky-replace-fetch -b codex/ky-replace-fetch`

Expected: 输出包含 `Preparing worktree`，并切到新分支。

**Step 2: Commit**

Skip（此任务只做环境准备，不提交）。

---

### Task 2: 为 ky 迁移准备更稳健的测试断言工具

> 目的：ky 可能通过 `fetch(Request)` 形式调用全局 `fetch`，导致现有 `toHaveBeenCalledWith(expect.stringContaining(...), expect.objectContaining(...))` 断言不稳定。本任务先让测试可以从 `Request` 中提取 `url/method`，为后续迁移铺路。

**Files:**

- Modify: `src/lib/apiClient.test.ts`

**Step 1: Write the failing test (or tighten an existing one to prove helper works)**

在 `src/lib/apiClient.test.ts` 顶部（imports 之后）新增两个 helper，并把现有的 1 条请求断言改成基于 helper 的断言（先让它在当前 `fetch(string, init)` 形态下也能跑通）。

```ts
function getFetchCallUrl(input: unknown): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

function getFetchCallMethod(call: unknown[]): string | undefined {
  const [input, init] = call;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method;
  if (init && typeof init === 'object' && 'method' in init) {
    const method = (init as { method?: unknown }).method;
    return typeof method === 'string' ? method : undefined;
  }
  return undefined;
}
```

将例如 `refreshAllFeeds` 的断言改为：

```ts
const firstCall = fetchMock.mock.calls[0] ?? [];
expect(getFetchCallUrl(firstCall[0])).toContain('/api/feeds/refresh');
expect(getFetchCallMethod(firstCall)).toBe('POST');
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/apiClient.test.ts`

Expected: **FAIL**（如果你先写 helper 但还没改断言，请在此步把断言改动一起提交为“先失败后修复”的驱动点；如果改完后已 PASS，则把该任务调整为“确保 helper 不引入回归”并继续下一步）。

**Step 3: Write minimal implementation**

实现如上 helper，并把至少一条相关断言迁移为 helper 形式（保证能覆盖 string 与 Request 两种形态）。

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/apiClient.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/apiClient.test.ts
git commit -m "test(网络): 提升 apiClient 请求断言兼容性" -m "- 添加 Request/url/method 断言 helper\n- 更新少量断言避免依赖 fetch 调用形态"
```

---

### Task 3: 引入 ky 依赖

**Files:**

- Modify: `package.json`

**Step 1: Write the failing test**

Skip（依赖引入不需要测试驱动）。

**Step 2: Install**

Run: `pnpm add ky`

Expected: `dependencies` 增加 `ky`，安装成功。

**Step 3: Run unit tests (smoke)**

Run: `pnpm vitest run src/lib/apiClient.test.ts`

Expected: PASS（此时实现尚未改动）。

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(网络): 添加 ky 依赖" -m "- 添加 ky 作为浏览器侧内部 API client"
```

---

### Task 4: 迁移 `requestApi<T>()` 从 fetch 到 ky（保持 envelope contract）

**Files:**

- Modify: `src/lib/apiClient.ts`
- Test: `src/lib/apiClient.test.ts`

**Step 1: Write the failing test**

在 `src/lib/apiClient.test.ts` 新增一条覆盖“非 JSON / 非 envelope”响应的测试（当前实现会抛 `Error`；迁移后我们希望抛 `ApiError(code='invalid_response')`，更便于 UI 统一处理）。

示例（根据项目现有测试结构放到合适位置）：

```ts
it('throws ApiError invalid_response when response is not an envelope', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response('not json', { status: 200, headers: { 'content-type': 'text/plain' } });
  });
  vi.stubGlobal('fetch', fetchMock);

  const { ApiError, refreshAllFeeds } = await import('./apiClient');

  await expect(refreshAllFeeds()).rejects.toBeInstanceOf(ApiError);
  await expect(refreshAllFeeds()).rejects.toMatchObject({ code: 'invalid_response' });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/apiClient.test.ts`

Expected: FAIL（`code` 不匹配或抛错类型不是 `ApiError`）。

**Step 3: Write minimal implementation**

在 `src/lib/apiClient.ts`：

1) 引入 ky 并创建私有 instance：

```ts
import ky from 'ky';
```

```ts
const api = ky.create({
  timeout: 15_000,
  retry: 0,
  throwHttpErrors: false,
});
```

2) 扩展 `ApiError` 以支持调试字段（不破坏现有构造调用）：

```ts
export class ApiError extends Error {
  status?: number;
  cause?: unknown;

  constructor(
    message: string,
    public code: string,
    public fields?: Record<string, string>,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message);
    this.status = options?.status;
    this.cause = options?.cause;
  }
}
```

3) 将 `requestApi<T>()` 迁移为使用 ky（注意保留 `accept` header 合并逻辑）：

```ts
async function requestApi<T>(path: string, init?: RequestInit, options?: RequestApiOptions & { timeoutMs?: number }): Promise<T> {
  let res: Response;

  try {
    res = await api(toAbsoluteUrl(path), {
      ...(init as never),
      timeout: options?.timeoutMs ?? 15_000,
      headers: {
        ...(init?.headers ?? {}),
        accept: 'application/json',
      },
    });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const message = isTimeout ? '请求超时，请稍后重试' : '网络异常，请检查网络后重试';
    const code = isTimeout ? 'timeout' : 'network_error';
    if (options?.notifyOnError !== false) notifyApiError(options?.notifyMessage ?? message);
    throw new ApiError(options?.notifyMessage ?? message, code, undefined, { cause: err });
  }

  const json: unknown = await res.json().catch(() => null);
  if (!isRecord(json) || typeof json.ok !== 'boolean') {
    if (options?.notifyOnError !== false) notifyApiError(options?.notifyMessage ?? '暂时无法完成请求，请稍后重试');
    throw new ApiError('服务返回了无效数据，请稍后重试', 'invalid_response', undefined, { status: res.status });
  }

  const envelope = json as ApiEnvelope<T>;
  if (envelope.ok) return envelope.data;

  const payload = envelope.error;
  const message = options?.notifyMessage ?? payload?.message ?? '暂时无法完成请求，请稍后重试';
  if (options?.notifyOnError !== false) notifyApiError(message);

  throw new ApiError(
    payload?.message ?? '暂时无法完成请求，请稍后重试',
    payload?.code ?? 'unknown_error',
    payload?.fields,
    { status: res.status },
  );
}
```

> 注：这里使用了 `...(init as never)` 来避免 TypeScript 因 `RequestInit` 与 ky `Options` 类型不完全一致而报错；若 ESLint/TS 报警，可在实现时改为显式挑选字段（`method/body/credentials/cache/redirect/referrer/referrerPolicy/integrity/keepalive/mode/signal` 等），以减少类型断言。

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/apiClient.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/apiClient.ts src/lib/apiClient.test.ts
git commit -m "refactor(网络): 使用 ky 实现 requestApi" -m "- 迁移内部 /api 请求到底层 ky client\n- 统一网络/超时/非法响应错误映射\n- 更新 apiClient 单测覆盖 invalid_response"
```

---

### Task 5: 将 `validateRssUrl` 迁移到 `src/lib/apiClient.ts` 并复用 ky

**Files:**

- Modify: `src/lib/apiClient.ts`
- Modify: `src/features/feeds/services/rssValidationService.ts`
- Test: `src/features/feeds/services/rssValidationService.test.ts`

**Step 1: Write the failing test**

在 `src/features/feeds/services/rssValidationService.test.ts` 增加一条断言：校验请求不触发全局 notify（避免表单校验弹 toast）。

需要先在测试中 stub notifier，例如：

```ts
import { setApiErrorNotifier, clearApiErrorNotifier } from '@/lib/apiErrorNotifier';

it('does not notify on validation failures', async () => {
  const notifier = vi.fn();
  setApiErrorNotifier(notifier);

  // 让请求返回一个 valid=false
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
    ok: true,
    data: { valid: false, reason: 'unauthorized', message: '源站需要授权访问' },
  }), { status: 200, headers: { 'content-type': 'application/json' } }));

  await validateRssUrl('https://example.com/401.xml');
  expect(notifier).not.toHaveBeenCalled();

  clearApiErrorNotifier();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/features/feeds/services/rssValidationService.test.ts`

Expected: FAIL（迁移前后都应确保不 notify；如果当前实现已不 notify，则此测试应直接 PASS，并作为回归保护继续后续步骤）。

**Step 3: Write minimal implementation**

1) 在 `src/lib/apiClient.ts` 新增导出类型与函数：

- `export type RssValidationErrorCode = ...`
- `export interface RssValidationResult = ...`
- `export async function validateRssUrl(url: string): Promise<RssValidationResult>`

实现逻辑基本迁移自 `src/features/feeds/services/rssValidationService.ts`，但将 `fetch(...)` 改为：

```ts
const res = await api(endpoint.toString(), {
  method: 'GET',
  headers: { accept: 'application/json' },
  timeout: 12_000,
});
```

并在 `catch` 中用 `err.name === 'TimeoutError' || err.name === 'AbortError'` 映射为 `timeout`。

2) 将 `src/features/feeds/services/rssValidationService.ts` 退化为 re-export（保持现有 import 路径不变）：

```ts
export type { RssValidationErrorCode, RssValidationResult } from '@/lib/apiClient';
export { validateRssUrl } from '@/lib/apiClient';
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/features/feeds/services/rssValidationService.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/apiClient.ts src/features/feeds/services/rssValidationService.ts src/features/feeds/services/rssValidationService.test.ts
git commit -m "refactor(订阅源): 归并 RSS 校验到 apiClient" -m "- 迁移 validateRssUrl 以复用 ky client 配置\n- 保持 services 路径为 re-export 兼容调用方\n- 增加不触发 notify 的回归测试"
```

---

### Task 6: 全量回归（聚焦网络层相关测试）

**Files:**

- None（只运行验证命令）

**Step 1: Run targeted tests**

Run:

- `pnpm vitest run src/lib/apiClient.test.ts src/features/feeds/services/rssValidationService.test.ts src/features/feeds/AddFeedDialog.test.tsx`

Expected: PASS

**Step 2: Run full unit tests (optional, if time allows)**

Run: `pnpm test:unit`

Expected: PASS

**Step 3: Commit**

Skip（本任务只验证）。

