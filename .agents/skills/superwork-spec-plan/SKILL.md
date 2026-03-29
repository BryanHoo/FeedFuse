---
name: superwork-spec-plan
description: "Create a lightweight implementation-ready spec and plan before non-trivial code changes. Use when work spans multiple files, changes behavior, touches contracts or cross-layer flows, needs sequencing, or follows a brainstorm session that has converged on requirements."
---

# Spec Plan

Turn a clear request or approved brainstorm result into a lightweight spec and execution plan that fits the existing Superwork task flow.

## Core Principles

- Prefer updating the current task `prd.md` instead of creating a separate design document.
- Keep the artifact short. The goal is implementation clarity, not ceremony.
- Define behavior, scope, and verification before touching code.
- Reuse existing `.superwork/spec/` guidance and repository patterns instead of inventing a parallel process.

## When To Skip

Skip this skill only when the change is truly trivial:

- one obvious file
- no behavior or contract change
- no meaningful sequencing needed

If you skip, say so explicitly and go straight to `$superwork-before-dev` and `$superwork-tdd-core`.

## Step 1: Gather Inputs

Before writing the plan:

1. Read the current task `prd.md` if it exists.
2. Read the relevant `.superwork/spec/` indexes and the specific guideline files they point to.
3. Inspect the code paths that will likely change.
4. If requirements are still unstable, return to `$superwork-brainstorm` instead of forcing a plan.

## Step 2: Write The Lightweight Spec

Prefer adding or refining these sections inside the existing `prd.md`:

```markdown
## Goal

<one paragraph on what changes and why>

## In Scope

- ...

## Out of Scope

- ...

## Constraints

- ...

## Acceptance Criteria

- [ ] ...
- [ ] ...

## Risks / Edge Cases

- ...
```

Rules:

- Make acceptance criteria observable and testable.
- State cross-layer contracts explicitly when relevant: command names, payload fields, config keys, return shapes.
- Keep out-of-scope items explicit to prevent scope drift.

## Step 3: Write The Execution Plan

Add a compact implementation plan to the same `prd.md`:

```markdown
## Implementation Plan

1. Add or update the failing test for <behavior>.
2. Implement the minimal production change in <file/module>.
3. Verify the targeted test passes.
4. Repeat for the next behavior.
5. Run final quality checks and cross-layer verification if needed.

## File Plan

- Modify: `path/to/file`
- Modify: `path/to/test`
- Optional: `path/to/spec-doc`
```

Plan requirements:

- Order steps so each one leaves the codebase in a verifiable state.
- Mention the likely files or modules to touch.
- Include the first verification point before the first implementation step.
- Prefer a small number of meaningful steps over exhaustive micro-steps.

## Step 4: Define Verification Up Front

Every plan must end with explicit verification:

```markdown
## Verification

- Targeted test: `pnpm test -- <target>`
- Package checks: `pnpm lint`
- Package checks: `pnpm typecheck`
- Optional cross-layer/manual check: <what to verify>
```

Choose the narrowest commands that prove the change first, then broaden as needed.

## Handoff

After the spec and plan are in place:

- Use `$superwork-execute-plan` to implement the plan.
- Use `$superwork-tdd-core` inside each behavior-changing step.
- If this is a bug, start with `$superwork-debug-root-cause` before planning or coding.

## Output

Report:

1. What changed in `prd.md`
2. The final scope boundary
3. The planned implementation order
4. The verification commands that will be used
