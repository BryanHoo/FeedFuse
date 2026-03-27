# State Management

> How state is managed in FeedFuse.

---

## Overview

FeedFuse uses a layered approach:

- local component state for transient UI interactions
- Zustand for shared application state
- persisted Zustand state for user settings
- imperative server synchronization through store actions and `apiClient`
- URL query parameters for reader selection state

There is no separate server-state library at the moment.

---

## State Categories

### Local UI State

Use `useState`, `useRef`, and component-local effects for transient interaction
details that are only needed by one component subtree.

Examples:

- resize drag state in `src/features/reader/ReaderLayout.tsx`
- image preview, scroll assist, and panel UI state in
  `src/features/articles/ArticleView.tsx`
- field interaction state in `src/features/feeds/useFeedDialogForm.ts`

### Global App State

Use `src/store/appStore.ts` for reader-wide state shared across multiple
features:

- feeds, articles, categories
- current selection
- unread/filter toggles
- snapshot loading and pagination state
- optimistic actions that update shared UI immediately

### Persisted Settings State

Use `src/store/settingsStore.ts` for user settings that survive reloads.
Important details:

- the store uses `persist(...)`
- persisted settings are separated from session-only secrets/state
- drafts are edited separately from committed persisted state

### Notification State

Use `src/features/toast/toastStore.ts` for top-level notifications. This stays
small and focused on dedupe, stack trimming, and dismissal.

### URL State

Reader selection is mirrored into the URL and restored from it in
`src/store/appStore.ts`. Keep this ownership centralized there.

---

## When to Use Global State

Promote state to Zustand when at least one of these is true:

- multiple feature areas need to read or mutate it
- the value must survive route/component boundaries
- actions need optimistic updates plus follow-up server sync
- the state participates in URL restoration or app bootstrapping

Do not promote state just because a component became large. Split the component
first and only move the state if it is truly shared.

---

## Server State

Server state is fetched manually and normalized before it reaches the UI.

Patterns in the current codebase:

- request helpers live in `src/lib/apiClient.ts`
- shared snapshots and caches live in `src/store/appStore.ts`
- settings hydration and save flows live in `src/store/settingsStore.ts`
- feature-specific request workflows can stay in hooks when they are not reused
  widely

Examples:

- `loadSnapshot` and `loadMoreSnapshot` in `appStore`
- `hydratePersistedSettings` and `saveDraft` in `settingsStore`
- `useStreamingAiSummary` for a feature-specific async session flow

---

## Common Mistakes

- Duplicating shared reader data in component-local state
- Writing directly to `localStorage` instead of going through `settingsStore`
- Persisting secrets in browser storage; keep API keys in session/backend flows
- Updating URL state outside `appStore`, which causes selection drift
- Adding a second source of truth for the same request status in multiple layers
