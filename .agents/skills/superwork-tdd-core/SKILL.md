---
name: superwork-tdd-core
description: "Apply a minimal Red-Green-Refactor workflow before writing production code. Use for feature work, bug fixes, refactors that change behavior, or any task where a failing automated check can be written before implementation."
---

# TDD Core

Apply the highest-value part of TDD without adding ceremony: prove the behavior with a failing test, make it pass with the smallest change, then refactor safely.

## Iron Law

Do not write production code for a behavior change until you have a failing test or equivalent automated check that demonstrates the missing behavior.

## Exceptions

Ask before skipping TDD for:

- pure documentation edits
- mechanical configuration changes
- generated code
- throwaway experiments

If you skip, state the reason explicitly and keep the change narrow.

## The Loop

### 1. Red

Write the smallest test that proves the intended behavior.

Requirements:

- one behavior per test when possible
- names that describe user-visible behavior
- prefer real data flow over heavy mocking

### 2. Verify Red

Run the narrowest command that proves the test fails for the expected reason.

Bad failure:

- syntax error
- setup error
- unrelated assertion

Good failure:

- behavior missing
- wrong output
- incorrect contract

### 3. Green

Write the smallest production change that makes the failing test pass.

Do not add extra features, cleanup, or abstractions during green.

### 4. Verify Green

Re-run the same targeted check and confirm it passes.

If adjacent tests are cheap and relevant, run them too.

### 5. Refactor

Only after green:

- remove duplication
- improve naming
- extract helpers
- simplify structure

Keep the suite green while refactoring.

## Test Quality Bar

Prefer tests that:

- describe behavior, not implementation trivia
- exercise realistic inputs and outputs
- make regressions obvious
- stay local to one responsibility

Avoid tests that only prove mocks were called unless the boundary itself is the behavior.

## Integration

- Use `$superwork-spec-plan` to decide what behaviors need tests.
- Use `$superwork-execute-plan` to sequence TDD across a larger task.
- Use `$superwork-debug-root-cause` first when the task begins with a failing bug.

## Output

For each TDD cycle, report:

1. the failing test or check you added
2. the minimal production change made
3. the verification command that passed
