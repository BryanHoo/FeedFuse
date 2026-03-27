# Type Safety

> Type safety patterns used by the FeedFuse frontend.

---

## Overview

The codebase uses TypeScript end to end. Shared domain types live in one place,
feature-local inputs stay close to the owning module, and runtime validation is
done with a mix of small normalization helpers and Zod at API boundaries.

Document reality:

- shared UI/domain types: `src/types/index.ts`
- feature-local types: colocated next to the feature
- runtime guards in browser code: small helper functions such as `isRecord`
- boundary validation: Zod in route/server entrypoints

---

## Type Organization

Use `src/types/index.ts` for cross-cutting domain models that are reused across
stores, UI, and API mapping. Examples include:

- `Feed`
- `Article`
- `PersistedSettings`
- `ViewType`

Keep feature-specific shapes local when they are not broadly reused. Examples:

- `src/features/feeds/feedDialog.types.ts`
- interfaces exported from `useStreamingAiSummary.ts`
- local prop interfaces inside components such as `FeedDialogProps`

Prefer the smallest ownership scope that still avoids duplication.

---

## Validation

Browser-facing code usually normalizes unknown input with small helpers instead
of pulling Zod into every form or utility.

Examples:

- `src/features/settings/settingsSchema.ts` uses helpers like `isRecord`,
  `readEnum`, and `normalizeKeywordList`
- `src/features/settings/validateSettingsDraft.ts` validates settings drafts with
  focused helper functions
- `src/lib/utils.ts` provides `isRecord` and `parseEventPayload`

At request boundaries, the project uses Zod:

- `src/app/api/feeds/route.ts`
- `src/app/api/categories/route.ts`
- `src/app/api/reader/snapshot/route.ts`
- `src/server/env.ts`

This split is intentional: lightweight helpers inside the app, schema libraries
at transport and environment boundaries.

---

## Common Patterns

- Use string unions for finite UI state:
  `ValidationState`, `ToastTone`, `ViewType`
- Use explicit interfaces for hook input/output APIs
- Use typed error classes such as `ApiError` instead of throwing raw objects
- Normalize nullable/optional values before storing them in state
- Export reusable DTO/result types from `apiClient` when multiple consumers need
  them

Examples:

- `ApiError` and `ApiErrorPayload` in `src/lib/apiClient.ts`
- `ToastItem` in `src/features/toast/toastStore.ts`
- `SettingsDraft` and `SaveDraftResult` in `src/store/settingsStore.ts`

---

## Forbidden Patterns

- `any` unless there is a very strong reason and the code comment explains it
- broad `as` assertions where a type guard or normalization helper would work
- storing raw `unknown` payloads in app state without validation or narrowing
- duplicating large shared interfaces inside feature files instead of importing
  them from `src/types`
- treating transport payloads as trusted before envelope validation
