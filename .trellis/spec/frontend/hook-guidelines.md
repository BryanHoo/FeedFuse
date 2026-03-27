# Hook Guidelines

> How hooks are used in FeedFuse.

---

## Overview

The project uses plain React hooks plus Zustand selectors. There is no React
Query or SWR layer today. Shared side effects and feature workflows are managed
with custom hooks, store actions, and `src/lib/apiClient.ts`.

Place hooks according to ownership:

- `src/hooks/` for cross-feature hooks
- `src/features/<feature>/` for feature-owned hooks

---

## Custom Hook Patterns

Use a custom hook when the logic is stateful, asynchronous, or hard to read
inline inside a component.

Common patterns in the repo:

- browser/environment synchronization:
  `src/hooks/useTheme.ts`
- form workflow hooks that expose field state and handlers:
  `src/features/feeds/useFeedDialogForm.ts`
- long-running async workflows that keep local state by entity id:
  `src/features/articles/useStreamingAiSummary.ts`
- debounced or delayed save behavior:
  `src/features/settings/useSettingsAutosave.ts`

Prefer returning an explicit object API over tuples when the hook has more than
one or two responsibilities.

---

## Data Fetching

Frontend data fetching is mostly imperative.

- Shared request helpers live in `src/lib/apiClient.ts`
- Feature hooks call `apiClient` helpers directly when the workflow is local to
  one component tree
- App-wide server data is usually fetched through Zustand actions in
  `src/store/appStore.ts` and `src/store/settingsStore.ts`

Examples:

- `ReaderApp.tsx` triggers `loadSnapshot` and settings hydration through stores
- `useFeedDialogForm.ts` validates RSS URLs via a feature service and handles API
  field errors
- `useStreamingAiSummary.ts` coordinates enqueue, polling, and SSE lifecycle for
  AI summary generation

Do not introduce ad-hoc `fetch(...)` calls in random components when an
`apiClient` helper or store action should own that request.

---

## Naming Conventions

- Every custom hook must start with `use`
- Use names that describe the workflow, not the rendering location:
  `useStreamingAiSummary`, not `useArticleViewSummaryThing`
- Keep feature hooks close to the feature they serve unless they are clearly
  reused across domains
- Export hook input/result interfaces when the API is non-trivial

Examples:

- `useTheme`
- `useFeedDialogForm`
- `useSettingsAutosave`
- `useImmersiveTranslation`

---

## Common Mistakes

- Leaving timers, `EventSource`, or DOM listeners without cleanup
- Returning unstable anonymous APIs when a stable callback or memoized value is
  needed for effects
- Moving feature-specific hooks into `src/hooks/` too early
- Duplicating request state in both a component and a hook
- Using a hook to hide unrelated concerns instead of separating them into
  smaller hooks or helpers
