# Component Guidelines

> How React components are built in FeedFuse.

---

## Overview

Most feature components are composition layers: they read state from a store or
feature hook, derive small pieces of UI state, and render shared primitives
from `src/components/ui/`.

Keep responsibilities split:

- route entrypoints in `src/app/`
- feature composition in `src/features/`
- reusable primitives in `src/components/ui/`

Do not hide data fetching, global side effects, and styling conventions inside
random leaf components.

---

## Component Structure

A typical feature component file follows this order:

1. imports
2. local constants
3. props interface / local helper types
4. component implementation
5. small local helpers when they are only used by that component

Patterns used in the repo:

- `FeedDialog.tsx` keeps static metadata maps near the top and delegates state
  logic to `useFeedDialogForm`
- `ReaderLayout.tsx` owns layout-specific interaction state, but shared panes
  are separate components
- `ToastHost.tsx` is a thin host around `toastStore` and Radix primitives

Main feature components commonly use a default export. Shared primitives usually
use named exports.

---

## Props Conventions

- Define a dedicated `*Props` interface next to the component
- Use precise unions for mode/state props instead of loose strings
- Prefer callback props with explicit payload types
- Mark optional props explicitly and provide safe defaults in the function
  signature when useful

Examples:

- `ReaderLayoutProps` in `src/features/reader/ReaderLayout.tsx`
- `FeedDialogProps` in `src/features/feeds/FeedDialog.tsx`
- `ReaderPageProps` in `src/app/(reader)/page.tsx`

When a component needs a large, behavior-heavy API, move that behavior into a
hook or helper module instead of expanding the prop surface indefinitely.

---

## Styling Patterns

FeedFuse styles components with Tailwind utility classes, semantic theme tokens,
and a small set of shared class-name constants.

Required patterns:

- Use `cn(...)` from `src/lib/utils.ts` to merge conditional class names
- Reuse shared layout constants from `src/lib/designSystem.ts` when the same
  surface/layout class is used in multiple places
- Prefer semantic tokens such as `bg-background`, `text-success`, `border-error`
  instead of palette-specific classes
- Keep repeated visual rules in `src/components/ui/` or `src/lib/designSystem.ts`
  instead of copying long strings across features

Examples:

- `src/components/ui/button.tsx` uses `cva` for reusable variants
- `src/features/toast/ToastHost.tsx` maps tone to semantic token classes
- `src/features/reader/ReaderLayout.tsx` imports shared layout class constants

Do not introduce raw `bg-white`, `text-red-500`, `shadow-md`, or similar values
when a semantic token already exists.

---

## Accessibility

Interactive components in this repo are expected to keep accessible labels,
focus management, and semantic roles.

Observed patterns:

- `src/app/layout.tsx` includes a skip link to `#main-content`
- `src/features/feeds/FeedDialog.tsx` passes `closeLabel`, `DialogTitle`, and
  `DialogDescription`
- `src/features/toast/ToastHost.tsx` uses `role="alert"` for error toasts and
  `role="status"` for non-error toasts
- `src/features/reader/ReaderLayout.tsx` uses sheet title/description and
  keyboard-friendly controls

Always preserve:

- visible or screen-reader-accessible labels
- focus-visible styles
- correct button semantics for clickable controls
- dialog title/description when using modal primitives

---

## Common Mistakes

- Putting API calls directly into shared UI primitives instead of feature hooks,
  stores, or `apiClient`
- Copying one-off Tailwind strings instead of extracting shared class constants
- Replacing semantic tokens with raw color utilities that break light/dark theme
  contracts
- Skipping `closeLabel`, `aria-label`, or dialog descriptions on interactive
  surfaces
- Expanding one component until it owns form state, request logic, and layout
  variants that should have been split into smaller modules
