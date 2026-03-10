# 页面重新可见时同步订阅源快照 Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 让 reader 页面在浏览器标签页从后台切回前台时，静默同步当前视图的最新 snapshot，并将自动同步频率限制为每 5 分钟最多一次。

**Architecture:** 继续以 `ReaderApp` 作为 reader 的生命周期入口，在现有首屏 `loadSnapshot` 逻辑之外新增 `document.visibilitychange` 监听。自动同步只复用 `loadSnapshot` 路径，不触发 `refreshFeed` 或 `refreshAllFeeds`，并通过组件内时间戳做 5 分钟冷却控制。

**Tech Stack:** React 19、Next.js 16、Zustand、Vitest、Testing Library、pnpm

---

## 已知上下文

- 设计文档：`docs/plans/2026-03-09-reader-visible-snapshot-refresh-design.md`
- reader 生命周期入口：`src/app/(reader)/ReaderApp.tsx`
- snapshot store 动作：`src/store/appStore.ts`
- 现有 reader 测试：`src/app/(reader)/ReaderApp.test.tsx`
- 手动刷新入口：`src/features/articles/ArticleList.tsx`

截至 2026-03-09，仓库中没有 `docs/summaries/` 目录，因此本计划没有可链接的历史总结文档。

## 实施守则

- 遵循 `@workflow-test-driven-development`：先写失败测试，再写最小实现。
- 遵循 `@workflow-verification-before-completion`：只有在跑过文中验证命令后才能宣称完成。
- 保持 YAGNI：只做标签页重新可见时的 snapshot 同步，不做自动抓取、轮询或用户配置项。
- 保持提交粒度小，每个任务完成后单独提交，提交信息使用简体中文 Conventional Commits。

### Task 1: 为页面重新可见时的静默同步建立测试并实现监听

**Files:**

- Modify: `src/app/(reader)/ReaderApp.test.tsx`
- Modify: `src/app/(reader)/ReaderApp.tsx`
- Reference: `src/store/appStore.ts`
- Reference: `src/features/articles/ArticleList.tsx`

**Step 1: Write the failing test**

在 `src/app/(reader)/ReaderApp.test.tsx` 中增加一个可控的 `document.visibilityState` 测试夹具，并写出“隐藏后重新可见会追加一次 snapshot 请求，但不会调用手动刷新接口”的失败用例。

建议先在测试文件顶部加入一个可变的可见性状态：

```tsx
let documentVisibilityState: DocumentVisibilityState = 'visible';

function installVisibilityStateGetter() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => documentVisibilityState,
  });
}
```

然后在 `beforeEach` 中重置状态并安装 getter：

```tsx
beforeEach(() => {
  documentVisibilityState = 'visible';
  installVisibilityStateGetter();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/reader/snapshot') && method === 'GET') {
        snapshotRequests += 1;
        return jsonResponse({
          ok: true,
          data: { categories: [], feeds: [], articles: { items: [], nextCursor: null } },
        });
      }

      if (url.includes('/api/feeds/refresh') || url.includes('/refresh')) {
        refreshRequests += 1;
      }

      // 保留 settings 接口 mock
    }),
  );
});
```

新增测试：

```tsx
it('reloads reader snapshot when the page becomes visible again', async () => {
  await act(async () => {
    render(<ReaderApp />);
  });

  expect(snapshotRequests).toBe(1);
  expect(refreshRequests).toBe(0);

  documentVisibilityState = 'hidden';
  fireEvent(document, new Event('visibilitychange'));

  documentVisibilityState = 'visible';
  fireEvent(document, new Event('visibilitychange'));

  await waitFor(() => {
    expect(snapshotRequests).toBe(2);
  });
  expect(refreshRequests).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run 'src/app/(reader)/ReaderApp.test.tsx'
```

Expected:

- FAIL，新增测试会停在 `expect(snapshotRequests).toBe(2)`，因为当前 `ReaderApp` 还没有监听 `visibilitychange`。

**Step 3: Write minimal implementation**

在 `src/app/(reader)/ReaderApp.tsx` 中新增一个自动同步常量和页面可见性监听 effect，先实现基础能力，不在这一任务里加入 5 分钟冷却。

示例实现：

```tsx
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      return;
    }

    const { selectedView: currentView, loadSnapshot: reloadSnapshot } = useAppStore.getState();
    void reloadSnapshot({ view: currentView });
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}, []);
```

实现时保留现有首屏 `loadSnapshot({ view: selectedView })` effect，不要把两条路径合并成一条条件复杂的 effect。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run 'src/app/(reader)/ReaderApp.test.tsx'
```

Expected:

- PASS，新增“页面重新可见时同步 snapshot”测试通过。
- 现有 `ReaderApp` 测试全部继续通过。

**Step 5: Commit**

```bash
git add src/app/'(reader)'/ReaderApp.tsx src/app/'(reader)'/ReaderApp.test.tsx
git commit -m "feat(reader): 添加页面可见时静默同步快照" -m "- 添加标签页重新可见时重新拉取当前 snapshot 的监听\n- 保持手动刷新与订阅抓取接口语义不变\n- 补充 ReaderApp 对应行为测试"
```

### Task 2: 为自动同步加入 5 分钟间隔控制并补足节流测试

**Files:**

- Modify: `src/app/(reader)/ReaderApp.test.tsx`
- Modify: `src/app/(reader)/ReaderApp.tsx`

**Step 1: Write the failing test**

在 `src/app/(reader)/ReaderApp.test.tsx` 中新增 fake timers 场景，验证 5 分钟内重复切回页面不会再次拉取，超过 5 分钟后才允许再次同步。

建议测试：

```tsx
it('limits automatic visible refreshes to once every five minutes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-09T10:00:00.000Z'));

  await act(async () => {
    render(<ReaderApp />);
  });

  expect(snapshotRequests).toBe(1);

  documentVisibilityState = 'hidden';
  fireEvent(document, new Event('visibilitychange'));
  documentVisibilityState = 'visible';
  fireEvent(document, new Event('visibilitychange'));

  await waitFor(() => {
    expect(snapshotRequests).toBe(2);
  });

  documentVisibilityState = 'hidden';
  fireEvent(document, new Event('visibilitychange'));
  documentVisibilityState = 'visible';
  fireEvent(document, new Event('visibilitychange'));

  expect(snapshotRequests).toBe(2);

  await act(async () => {
    vi.advanceTimersByTime(5 * 60 * 1000);
  });

  documentVisibilityState = 'hidden';
  fireEvent(document, new Event('visibilitychange'));
  documentVisibilityState = 'visible';
  fireEvent(document, new Event('visibilitychange'));

  await waitFor(() => {
    expect(snapshotRequests).toBe(3);
  });
});
```

同时在 `afterEach` 中补充 `vi.useRealTimers()`，避免影响其它测试：

```tsx
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run 'src/app/(reader)/ReaderApp.test.tsx'
```

Expected:

- FAIL，新增测试会显示第二次切回页面时 `snapshotRequests` 已经变成 `3`，说明当前实现缺少 5 分钟节流。

**Step 3: Write minimal implementation**

在 `src/app/(reader)/ReaderApp.tsx` 中加入自动同步冷却时间常量和 `useRef` 时间戳：

```tsx
const AUTO_SNAPSHOT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const lastAutoSnapshotAtRef = useRef<number | null>(null);
```

更新 `visibilitychange` 监听逻辑：

```tsx
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      return;
    }

    const now = Date.now();
    if (
      lastAutoSnapshotAtRef.current !== null &&
      now - lastAutoSnapshotAtRef.current < AUTO_SNAPSHOT_REFRESH_INTERVAL_MS
    ) {
      return;
    }

    lastAutoSnapshotAtRef.current = now;
    const { selectedView: currentView, loadSnapshot: reloadSnapshot } = useAppStore.getState();
    void reloadSnapshot({ view: currentView });
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}, []);
```

注意：

- 不要在首屏 `loadSnapshot` effect 中写入 `lastAutoSnapshotAtRef`，否则会把首次进入页面也错误纳入 5 分钟冷却。
- 冷却只限制自动可见性同步，不限制用户切换视图后的正常 snapshot 加载。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run 'src/app/(reader)/ReaderApp.test.tsx'
```

Expected:

- PASS，5 分钟内重复切回页面不会重复请求。
- 超过 5 分钟后再次切回页面会重新拉取 snapshot。
- 现有 `ReaderApp` 测试继续通过。

**Step 5: Commit**

```bash
git add src/app/'(reader)'/ReaderApp.tsx src/app/'(reader)'/ReaderApp.test.tsx
git commit -m "fix(reader): 限制页面可见时同步快照频率" -m "- 添加页面重新可见时自动同步的五分钟冷却时间\n- 保持首次加载、切换视图与手动刷新行为不受影响\n- 补充可见性节流与时间推进测试"
```

### Task 3: 运行针对性验证并做收尾检查

**Files:**

- Verify: `src/app/(reader)/ReaderApp.tsx`
- Verify: `src/app/(reader)/ReaderApp.test.tsx`
- Reference: `docs/plans/2026-03-09-reader-visible-snapshot-refresh-design.md`

**Step 1: Run the focused test file**

Run:

```bash
pnpm vitest run 'src/app/(reader)/ReaderApp.test.tsx'
```

Expected:

- PASS，包含新增的可见性自动同步与五分钟冷却测试。

**Step 2: Run the related unit slice if the focused file passes**

Run:

```bash
pnpm vitest run 'src/app/(reader)/ReaderApp.test.tsx' 'src/store/appStore.test.ts' 'src/features/articles/ArticleList.test.tsx'
```

Expected:

- PASS，确认 `ReaderApp` 自动同步没有影响现有 snapshot store 与手动刷新语义。

**Step 3: Review the final diff**

Run:

```bash
git diff --stat HEAD~2..HEAD
git diff -- src/app/'(reader)'/ReaderApp.tsx src/app/'(reader)'/ReaderApp.test.tsx
```

Expected:

- 只包含 `ReaderApp` 监听逻辑与测试改动。
- 不出现 `refreshFeed`、`refreshAllFeeds` 自动调用。

**Step 4: Commit if verification changes were needed**

如果在验证阶段没有额外代码改动，则跳过此步。  
如果为修复测试或清理细节产生了小改动，再提交一次：

```bash
git add src/app/'(reader)'/ReaderApp.tsx src/app/'(reader)'/ReaderApp.test.tsx
git commit -m "test(reader): 完善页面可见时同步快照验证" -m "- 校验自动同步不会影响手动刷新语义\n- 收紧 ReaderApp 相关测试夹具与断言\n- 确认五分钟冷却行为稳定"
```
