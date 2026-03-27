# Quality Guidelines

> Code quality standards for frontend development in FeedFuse.

---

## Overview

Frontend work in this repo is guarded by:

- `pnpm lint`
- `pnpm test:unit`
- source-level contract tests for tokens and shared UI expectations

The project currently uses ESLint + TypeScript + React Hooks rules. There is no
Prettier configuration in the repo, so avoid style-only churn unless it serves a
real readability purpose.

---

## Forbidden Patterns

- Raw `fetch(...)` or ad-hoc transport handling in components when
  `src/lib/apiClient.ts` should own the request
- Hard-coded palette classes like `text-red-500`, `bg-white`, `shadow-md` in
  product UI that should be using semantic theme tokens
- Persisting secrets or backend-only values into browser storage
- Skipping cleanup for listeners, timers, and streams in effects
- Large refactors that only change quote style or whitespace without improving
  behavior or readability

---

## Required Patterns

- Use semantic Tailwind tokens defined in `src/app/globals.css`
- Use `cn(...)` for conditional class names
- Reuse shared class constants from `src/lib/designSystem.ts` when the same
  visual rule appears in multiple places
- Route network requests through `src/lib/apiClient.ts` or store actions
- Keep shared state in Zustand stores and read it with selectors
- Preserve accessibility labels, focus handling, and dialog semantics

Examples:

- `src/app/theme-token-usage.contract.test.ts` protects semantic token usage
- `src/features/toast/ToastHost.tsx` uses semantic colors and a11y roles
- `src/features/feeds/FeedDialog.tsx` wires dialog semantics and focus behavior

---

## Testing Requirements

Tests are expected to stay close to the code they protect.

Current patterns:

- `*.test.tsx` for React behavior in jsdom
- `*.test.ts` for logic, stores, and request helpers
- `*.contract.test.ts` for source contracts and token/style guarantees

Vitest is split into two projects:

- `node` for server, worker, API route, and utility tests
- `jsdom` for React and browser-facing tests

Before finishing frontend work, run the relevant subset at minimum and prefer
running the full `pnpm test:unit` for cross-cutting changes.

---

## Code Review Checklist

- Does the code follow existing folder ownership instead of inventing a new
  structure?
- Are requests going through `apiClient`, store actions, or a clear feature
  service?
- Are theme tokens semantic and compatible with the contract tests?
- Are effects cleaned up correctly?
- Is shared state in the right store, with local state kept local?
- Is there a focused test covering the new behavior or regression?
