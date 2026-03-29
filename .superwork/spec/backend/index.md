# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

These docs capture the backend conventions already used in FeedFuse. They are
based on the current App Router handlers, `src/server` modules, queue contracts,
and worker processes.

Use these files as implementation references before editing backend code.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module ownership and backend layout | Filled |
| [API Guidelines](./api-guidelines.md) | App Router route patterns, validation, response envelopes | Filled |
| [Auth Guidelines](./auth-guidelines.md) | Single-user password auth, session cookie, auth contract | Filled |
| [Service Guidelines](./service-guidelines.md) | Service-layer orchestration and transaction rules | Filled |
| [Data Access Guidelines](./data-access-guidelines.md) | Repository SQL mapping and persistence boundaries | Filled |
| [Async Jobs Guidelines](./async-jobs-guidelines.md) | Queue contracts, worker registration, job patterns | Filled |
| [Type Safety](./type-safety.md) | Runtime validation and backend typing conventions | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Tests, forbidden patterns, review checklist | Filled |

---

## Pre-Development Checklist

Always read these files first for any backend behavior change:

1. [Directory Structure](./directory-structure.md)
2. [API Guidelines](./api-guidelines.md)
3. [Auth Guidelines](./auth-guidelines.md)
4. [Type Safety](./type-safety.md)
5. [Quality Guidelines](./quality-guidelines.md)

Then read the area-specific guide that matches your task:

- service orchestration or transactions:
  [Service Guidelines](./service-guidelines.md)
- SQL or persistence work:
  [Data Access Guidelines](./data-access-guidelines.md)
- queue, scheduler, or worker changes:
  [Async Jobs Guidelines](./async-jobs-guidelines.md)

If the change spans route, service, repository, and worker boundaries, read all
relevant guides and also review
[Cross-Layer Thinking Guide](../guides/cross-layer-thinking-guide.md).

---

## Scope Notes

These guidelines describe the current backend architecture:

- HTTP entrypoints in `src/app/api`
- backend implementation in `src/server`
- asynchronous job execution in `src/worker`
- PostgreSQL access through repositories in `src/server/repositories`
- request/env validation with Zod

---

**Language**: All documentation in this directory should remain in English.
