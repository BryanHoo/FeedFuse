---
name: superwork-execute-plan
description: "Implement an approved spec or task plan in small verified steps while staying aligned with existing Superwork task tracking. Use when a task `prd.md` already contains clear scope and an execution plan, especially for non-trivial feature work or multi-file behavior changes."
---

# Execute Plan

Implement a prepared plan without drifting from scope, skipping verification, or bundling unrelated changes.

## Core Principles

- Treat the plan in `prd.md` as the source of truth.
- Read repository guidance first with `$superwork-before-dev`.
- Use `$superwork-tdd-core` for each behavior change.
- Verify every meaningful step before moving on.
- Update the plan if reality changes; do not silently diverge from it.

## Step 1: Review The Plan Critically

Before coding:

1. Read the current task `prd.md`.
2. Confirm the goal, scope, files, and verification steps are clear.
3. If the plan is missing key details, update it or ask one blocking question before implementation.

Do not start coding against a vague plan.

## Step 2: Prepare The Development Context

Run the normal Superwork preparation flow:

1. Use `$superwork-before-dev`.
2. Read the relevant `.superwork/spec/` docs referenced by the indexes.
3. Re-check the files and patterns named in the plan.

If the plan and the codebase disagree, fix the plan first.

## Step 3: Execute In Small Verified Steps

For each planned behavior:

1. Write or update the failing test.
2. Confirm the failure is real and relevant.
3. Implement the smallest production change that makes the test pass.
4. Run the targeted verification for that step.
5. Refactor only after green.

Do not batch multiple unrelated steps into one large edit unless the plan explicitly requires it.

## Step 4: Keep The Plan Honest

If you discover new work while implementing:

- Update `prd.md` if the work is in scope and necessary.
- Mark newly discovered out-of-scope work explicitly instead of sneaking it in.
- If the change becomes architectural or ambiguous, pause and return to `$superwork-spec-plan` or `$superwork-brainstorm`.

## Step 5: Final Verification

After the planned steps are complete:

1. Run the targeted tests listed in the plan.
2. Run broader package checks such as `pnpm lint` and `pnpm typecheck` when applicable.
3. Use `$superwork-check` for a guideline pass.
4. Use `$superwork-check-cross-layer` when the change spans multiple layers or contracts.
5. Use `$superwork-finish-work` before handing off for commit.

If the task was a bug fix with reusable lessons, follow with `$superwork-break-loop`.

## Stop Conditions

Stop and ask for clarification when:

- the plan conflicts with repository reality
- verification fails repeatedly without a clear cause
- the next step would require a scope change not reflected in `prd.md`
- you are tempted to skip the failing-test step

## Output

Report:

1. Which planned steps were completed
2. Any plan adjustments made during implementation
3. What verification passed
4. Any remaining risks or follow-ups
