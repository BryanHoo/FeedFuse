# 阅读器三栏可拖拽宽度 Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 为阅读器桌面三栏增加左栏与中栏的拖拽改宽能力，并持久化用户宽度偏好，同时保持右栏自适应与现有 `sidebarCollapsed` 语义不变。

**Architecture:** 保留 `ReaderLayout` 现有 `flex` 三栏结构，引入共享的分栏尺寸常量与 clamp 逻辑，并把持久化宽度存入 `persistedSettings.general`。拖拽过程只更新 `ReaderLayout` 局部状态，`pointerup` 后再通过 `settingsStore` 专用更新入口落盘，避免把高频位移写进全局 store。

**Tech Stack:** Next.js 16、React 19、TypeScript、Zustand、Vitest、Testing Library、浏览器 `pointer` 事件、Tailwind CSS

---

**Relevant Learnings:**

- 设计文档：[`docs/plans/2026-03-06-reader-resizable-three-column-layout-design.md`](./2026-03-06-reader-resizable-three-column-layout-design.md)
- 相关总结：[`docs/summaries/2026-03-06-middle-column-image-loading.md`](../summaries/2026-03-06-middle-column-image-loading.md)
  - 拖拽属于高频交互，不能为了手感把宽度变化持续写进全局 store，避免中栏列表发生无意义重渲染。
  - 任何改动都要把 `ArticleList` 的稳定性放在首位，优先收敛更新范围。
- 现有行为契约：`src/app/(reader)/ReaderApp.test.tsx:71`
  - `sidebarCollapsed` 的持久化值当前不会直接同步回 `appStore`，本次实现不能顺手改变这条历史边界。

**Relevant Skills:** `@workflow-executing-plans`, `@workflow-test-driven-development`, `@vitest`

### Task 1: 扩展持久化栏宽配置与归一化规则

**Files:**

- Create: `src/features/reader/readerLayoutSizing.ts`
- Modify: `src/types/index.ts:55`
- Modify: `src/features/settings/settingsSchema.ts:8`
- Test: `src/features/settings/settingsSchema.test.ts`

**Step 1: Write the failing test**

在 `src/features/settings/settingsSchema.test.ts` 先增加一个只覆盖新字段默认值和 clamp 规则的用例：

```ts
import {
  READER_LEFT_PANE_DEFAULT_WIDTH,
  READER_LEFT_PANE_MAX_WIDTH,
  READER_MIDDLE_PANE_DEFAULT_WIDTH,
  READER_MIDDLE_PANE_MIN_WIDTH,
} from '../reader/readerLayoutSizing';

it('adds reader pane width defaults and clamps persisted values', () => {
  const defaults = normalizePersistedSettings({});

  expect(defaults.general.leftPaneWidth).toBe(READER_LEFT_PANE_DEFAULT_WIDTH);
  expect(defaults.general.middlePaneWidth).toBe(READER_MIDDLE_PANE_DEFAULT_WIDTH);

  const normalized = normalizePersistedSettings({
    general: {
      leftPaneWidth: 9999,
      middlePaneWidth: 100,
    },
  });

  expect(normalized.general.leftPaneWidth).toBe(READER_LEFT_PANE_MAX_WIDTH);
  expect(normalized.general.middlePaneWidth).toBe(READER_MIDDLE_PANE_MIN_WIDTH);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/settings/settingsSchema.test.ts -t "adds reader pane width defaults and clamps persisted values"`

Expected: FAIL，提示 `leftPaneWidth` / `middlePaneWidth` 不存在，或断言收到 `undefined`。

**Step 3: Write minimal implementation**

1. 在 `src/features/reader/readerLayoutSizing.ts` 新建共享常量与纯函数：

```ts
export const READER_LEFT_PANE_MIN_WIDTH = 200;
export const READER_LEFT_PANE_MAX_WIDTH = 420;
export const READER_LEFT_PANE_DEFAULT_WIDTH = 240;
export const READER_MIDDLE_PANE_MIN_WIDTH = 320;
export const READER_MIDDLE_PANE_MAX_WIDTH = 640;
export const READER_MIDDLE_PANE_DEFAULT_WIDTH = 400;
export const READER_RIGHT_PANE_MIN_WIDTH = 480;
export const READER_RESIZE_DESKTOP_MIN_WIDTH = 1024;

export function normalizeReaderPaneWidth(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}
```

2. 在 `src/types/index.ts` 的 `GeneralSettings` 增加：

```ts
leftPaneWidth: number;
middlePaneWidth: number;
```

3. 在 `src/features/settings/settingsSchema.ts`：
   - 给 `defaultGeneralSettings` 增加默认宽度
   - 引入 `normalizeReaderPaneWidth`
   - 在 `normalizeGeneralSettings` 中读取并 clamp 新字段

```ts
leftPaneWidth: normalizeReaderPaneWidth(
  generalInput.leftPaneWidth,
  defaultGeneralSettings.leftPaneWidth,
  READER_LEFT_PANE_MIN_WIDTH,
  READER_LEFT_PANE_MAX_WIDTH,
),
middlePaneWidth: normalizeReaderPaneWidth(
  generalInput.middlePaneWidth,
  defaultGeneralSettings.middlePaneWidth,
  READER_MIDDLE_PANE_MIN_WIDTH,
  READER_MIDDLE_PANE_MAX_WIDTH,
),
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/settings/settingsSchema.test.ts -t "adds reader pane width defaults and clamps persisted values"`

Expected: PASS。

**Step 5: Commit**

```bash
git add src/features/reader/readerLayoutSizing.ts src/types/index.ts src/features/settings/settingsSchema.ts src/features/settings/settingsSchema.test.ts
git commit -m "✨ feat(settings): 增加阅读器栏宽持久化配置" -m "- 添加左栏与中栏宽度默认值和边界常量
- 归一化持久化栏宽并复用共享 clamp 规则"
```

### Task 2: 让阅读器读取持久化栏宽并渲染分割线骨架

**Files:**

- Create: `src/features/reader/ResizeHandle.tsx`
- Modify: `src/features/reader/ReaderLayout.tsx:1`
- Test: `src/features/reader/ReaderLayout.test.tsx`

**Step 1: Write the failing test**

在 `src/features/reader/ReaderLayout.test.tsx` 增加一个聚焦“读取宽度 + 左栏收起恢复 + 分割线可见”的用例：

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';

it('renders persisted pane widths and restores left pane width after re-expanding sidebar', () => {
  resetSettingsStore();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

  useSettingsStore.setState((state) => ({
    ...state,
    persistedSettings: {
      ...state.persistedSettings,
      general: {
        ...state.persistedSettings.general,
        leftPaneWidth: 280,
        middlePaneWidth: 460,
      },
    },
  }));

  renderWithNotifications();

  expect(screen.getByTestId('reader-feed-pane')).toHaveStyle({ width: '280px' });
  expect(screen.getByTestId('reader-article-pane')).toHaveStyle({ width: '460px' });
  expect(screen.getAllByRole('separator')).toHaveLength(2);

  act(() => {
    useAppStore.setState({ sidebarCollapsed: true });
  });
  expect(screen.getByTestId('reader-feed-pane')).toHaveStyle({ width: '0px' });

  act(() => {
    useAppStore.setState({ sidebarCollapsed: false });
  });
  expect(screen.getByTestId('reader-feed-pane')).toHaveStyle({ width: '280px' });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/reader/ReaderLayout.test.tsx -t "renders persisted pane widths and restores left pane width after re-expanding sidebar"`

Expected: FAIL，因为当前 `ReaderLayout` 仍使用固定 `w-60` / `w-[25rem]`，也没有 `separator`。

**Step 3: Write minimal implementation**

1. 新建 `src/features/reader/ResizeHandle.tsx`，先只承担展示和无障碍语义：

```tsx
interface ResizeHandleProps {
  testId: string;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
}

export default function ResizeHandle({ testId, onPointerDown }: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      data-testid={testId}
      onPointerDown={onPointerDown}
      className="relative w-2 shrink-0 cursor-col-resize before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border"
    />
  );
}
```

2. 在 `src/features/reader/ReaderLayout.tsx`：
   - 从 `useSettingsStore` 读取 `persistedSettings.general.leftPaneWidth` 与 `middlePaneWidth`
   - 给左右两个固定栏位加 `data-testid`
   - 用内联 `style={{ width: ... }}` 替换固定 Tailwind 宽度
   - 在桌面宽度下插入两个 `ResizeHandle`

```tsx
const general = useSettingsStore((state) => state.persistedSettings.general);
const leftPaneWidth = sidebarCollapsed ? 0 : general.leftPaneWidth;
const middlePaneWidth = general.middlePaneWidth;
const isDesktop = typeof window !== 'undefined' && window.innerWidth >= READER_RESIZE_DESKTOP_MIN_WIDTH;

<div data-testid="reader-feed-pane" style={{ width: `${leftPaneWidth}px` }} ...>
  <FeedList />
</div>
{isDesktop ? <ResizeHandle testId="reader-resize-handle-left" /> : null}
<div data-testid="reader-article-pane" style={{ width: `${middlePaneWidth}px` }} ...>
  <ArticleList key={selectedView} />
</div>
{isDesktop ? <ResizeHandle testId="reader-resize-handle-middle" /> : null}
```

先不要加拖拽逻辑，只让测试覆盖新的宽度来源与左栏恢复行为。

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/reader/ReaderLayout.test.tsx -t "renders persisted pane widths and restores left pane width after re-expanding sidebar"`

Expected: PASS。

**Step 5: Commit**

```bash
git add src/features/reader/ResizeHandle.tsx src/features/reader/ReaderLayout.tsx src/features/reader/ReaderLayout.test.tsx
git commit -m "✨ feat(reader): 让阅读器读取持久化栏宽" -m "- 渲染左栏与中栏的持久化宽度
- 添加桌面分割线骨架并保留左栏收起恢复行为"
```

### Task 3: 支持拖拽调整左栏宽度并在结束后持久化

**Files:**

- Modify: `src/store/settingsStore.ts:40`
- Modify: `src/features/reader/ReaderLayout.tsx:11`
- Test: `src/features/reader/ReaderLayout.test.tsx`

**Step 1: Write the failing test**

在 `src/features/reader/ReaderLayout.test.tsx` 增加左栏拖拽用例：

```tsx
it('persists left pane width after dragging the left separator', () => {
  resetSettingsStore();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

  renderWithNotifications();

  fireEvent.pointerDown(screen.getByTestId('reader-resize-handle-left'), { clientX: 240 });
  fireEvent.pointerMove(window, { clientX: 320 });
  fireEvent.pointerUp(window, { clientX: 320 });

  expect(screen.getByTestId('reader-feed-pane')).toHaveStyle({ width: '320px' });
  expect(useSettingsStore.getState().persistedSettings.general.leftPaneWidth).toBe(320);
  expect(document.body.style.cursor).toBe('');
  expect(document.body.style.userSelect).toBe('');
});
```

如果你想顺手锁住边界，可在同一用例里再补一次极小拖拽：

```tsx
fireEvent.pointerDown(screen.getByTestId('reader-resize-handle-left'), { clientX: 320 });
fireEvent.pointerMove(window, { clientX: 20 });
fireEvent.pointerUp(window, { clientX: 20 });
expect(useSettingsStore.getState().persistedSettings.general.leftPaneWidth).toBe(200);
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/reader/ReaderLayout.test.tsx -t "persists left pane width after dragging the left separator"`

Expected: FAIL，因为 `ResizeHandle` 还没有拖拽行为，也没有写回持久化设置。

**Step 3: Write minimal implementation**

1. 在 `src/store/settingsStore.ts` 添加专用更新入口，不要把 `updateSettings` 扩大成承载阅读器局部偏好的一般接口：

```ts
updateReaderLayoutSettings: (partial: Pick<GeneralSettings, 'leftPaneWidth' | 'middlePaneWidth'>) => void;
...
updateReaderLayoutSettings: (partial) =>
  set((state) => ({
    persistedSettings: {
      ...state.persistedSettings,
      general: {
        ...state.persistedSettings.general,
        ...partial,
      },
    },
  })),
```

2. 在 `ReaderLayout` 增加左栏拖拽状态：

```tsx
type ResizeTarget = 'left' | 'middle';

const updateReaderLayoutSettings = useSettingsStore((state) => state.updateReaderLayoutSettings);
const [liveLeftPaneWidth, setLiveLeftPaneWidth] = useState(general.leftPaneWidth);
const [liveMiddlePaneWidth, setLiveMiddlePaneWidth] = useState(general.middlePaneWidth);
const dragStateRef = useRef<
  | {
      target: ResizeTarget;
      startX: number;
      startLeftPaneWidth: number;
      startMiddlePaneWidth: number;
    }
  | null
>(null);
```

3. 先只实现左栏拖拽：

```tsx
const stopDragging = () => {
  dragStateRef.current = null;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', handlePointerUp);
};

const handlePointerMove = (event: PointerEvent) => {
  const dragState = dragStateRef.current;
  if (!dragState || dragState.target !== 'left') return;

  const nextWidth = normalizeReaderPaneWidth(
    dragState.startLeftPaneWidth + (event.clientX - dragState.startX),
    dragState.startLeftPaneWidth,
    READER_LEFT_PANE_MIN_WIDTH,
    READER_LEFT_PANE_MAX_WIDTH,
  );

  setLiveLeftPaneWidth(nextWidth);
};

const handlePointerUp = () => {
  if (dragStateRef.current?.target === 'left') {
    updateReaderLayoutSettings({ leftPaneWidth: liveLeftPaneWidth });
  }
  stopDragging();
};

const startLeftResize: React.PointerEventHandler<HTMLDivElement> = (event) => {
  dragStateRef.current = {
    target: 'left',
    startX: event.clientX,
    startLeftPaneWidth: liveLeftPaneWidth,
    startMiddlePaneWidth: liveMiddlePaneWidth,
  };
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp, { once: true });
};
```

4. 把左侧 `ResizeHandle` 接上 `onPointerDown={startLeftResize}`，并让左栏渲染宽度优先使用 `liveLeftPaneWidth`。

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/reader/ReaderLayout.test.tsx -t "persists left pane width after dragging the left separator"`

Expected: PASS，左栏宽度更新并在 `pointerup` 后写回 `persistedSettings.general.leftPaneWidth`。

**Step 5: Commit**

```bash
git add src/store/settingsStore.ts src/features/reader/ReaderLayout.tsx src/features/reader/ReaderLayout.test.tsx
git commit -m "✨ feat(reader): 支持拖拽调整左栏宽度" -m "- 添加左栏分割线拖拽与本地实时宽度更新
- 在拖拽结束后持久化左栏宽度并清理全局指针状态"
```

### Task 4: 支持拖拽调整中栏宽度并保护右栏最小阅读宽度

**Files:**

- Modify: `src/features/reader/ReaderLayout.tsx:11`
- Modify: `src/features/reader/ReaderLayout.test.tsx:38`
- Test: `src/app/(reader)/ReaderApp.test.tsx`

**Step 1: Write the failing test**

在 `src/features/reader/ReaderLayout.test.tsx` 增加中栏拖拽和桌面阈值回归：

```tsx
it('clamps middle pane drag to preserve right pane minimum width', () => {
  resetSettingsStore();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

  renderWithNotifications();
  const layout = screen.getByTestId('reader-layout-root');
  Object.defineProperty(layout, 'clientWidth', { configurable: true, value: 1100 });

  fireEvent.pointerDown(screen.getByTestId('reader-resize-handle-middle'), { clientX: 640 });
  fireEvent.pointerMove(window, { clientX: 900 });
  fireEvent.pointerUp(window, { clientX: 900 });

  expect(screen.getByTestId('reader-article-pane')).toHaveStyle({ width: '380px' });
  expect(useSettingsStore.getState().persistedSettings.general.middlePaneWidth).toBe(380);
});

it('does not render resize handles below desktop breakpoint', () => {
  resetSettingsStore();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 768 });

  renderWithNotifications();

  expect(screen.queryByTestId('reader-resize-handle-left')).not.toBeInTheDocument();
  expect(screen.queryByTestId('reader-resize-handle-middle')).not.toBeInTheDocument();
});
```

这里 `380` 的计算依据是：`1100 - 240(left default) - 480(right min) = 380`。

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/reader/ReaderLayout.test.tsx -t "clamps middle pane drag to preserve right pane minimum width|does not render resize handles below desktop breakpoint"`

Expected: FAIL，因为当前中栏拖拽还没接线，也没有右栏最小宽度保护和桌面阈值判断。

**Step 3: Write minimal implementation**

1. 给最外层容器加 `data-testid="reader-layout-root"` 与 `ref`，用于读取容器宽度：

```tsx
const layoutRef = useRef<HTMLDivElement | null>(null);
...
<div ref={layoutRef} data-testid="reader-layout-root" className="relative flex h-screen ...">
```

2. 在 `ReaderLayout` 中补上桌面阈值监听：

```tsx
const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= READER_RESIZE_DESKTOP_MIN_WIDTH);

useEffect(() => {
  const handleResize = () => setIsDesktop(window.innerWidth >= READER_RESIZE_DESKTOP_MIN_WIDTH);
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

3. 在 `handlePointerMove` 中补上中栏分支：

```tsx
if (dragState.target === 'middle') {
  const layoutWidth = layoutRef.current?.clientWidth ?? 0;
  const effectiveLeftPaneWidth = sidebarCollapsed ? 0 : liveLeftPaneWidth;
  const maxMiddlePaneWidth = Math.min(
    READER_MIDDLE_PANE_MAX_WIDTH,
    Math.max(
      READER_MIDDLE_PANE_MIN_WIDTH,
      layoutWidth - effectiveLeftPaneWidth - READER_RIGHT_PANE_MIN_WIDTH,
    ),
  );

  const nextWidth = normalizeReaderPaneWidth(
    dragState.startMiddlePaneWidth + (event.clientX - dragState.startX),
    dragState.startMiddlePaneWidth,
    READER_MIDDLE_PANE_MIN_WIDTH,
    maxMiddlePaneWidth,
  );

  setLiveMiddlePaneWidth(nextWidth);
}
```

4. 在 `handlePointerUp` 里补上中栏持久化：

```tsx
if (dragStateRef.current?.target === 'middle') {
  updateReaderLayoutSettings({ middlePaneWidth: liveMiddlePaneWidth });
}
```

5. 让中栏分割线在桌面模式下接入 `onPointerDown`，窄屏时不渲染任何可交互 handle。

**Step 4: Run tests to verify they pass**

Run: `pnpm run test:unit -- src/features/reader/ReaderLayout.test.tsx`

Expected: PASS，包含左栏与中栏拖拽、桌面阈值和现有 reader 交互回归。

再跑一条历史边界测试，确认没有误改 `sidebarCollapsed` 语义：

Run: `pnpm run test:unit -- 'src/app/(reader)/ReaderApp.test.tsx' -t "does not apply removed sidebarCollapsed setting from persisted settings"`

Expected: PASS。

**Step 5: Commit**

```bash
git add src/features/reader/ReaderLayout.tsx src/features/reader/ReaderLayout.test.tsx src/app/'(reader)'/ReaderApp.test.tsx
git commit -m "✨ feat(reader): 支持拖拽调整中栏宽度" -m "- 添加中栏分割线拖拽与右栏最小阅读宽度保护
- 仅在桌面端启用拖拽并保留 sidebarCollapsed 历史语义"
```
