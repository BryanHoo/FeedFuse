---
name: trellis-tdd
description: "Enforces test-driven development for behavior-changing work. Defines the next smallest behavior slice, writes a failing test first, verifies the expected failure, then limits implementation to the minimum code needed to go green before refactoring. Use when implementing a feature, fixing a bug, changing behavior, or adding a regression test before code changes."
---

Use this skill when the task changes behavior and you want to work test-first.

## Trigger Check

Use `trellis-tdd` when at least one of these is true:

- You are about to implement a new feature
- You are fixing a bug
- You are refactoring behavior-critical code
- You need a regression test before changing production code

Skip this skill for pure documentation, wording, or config-only changes unless the config change needs executable coverage.

## Source of Truth

Read project testing guidance before writing tests:

```bash
python3 ./.trellis/scripts/get_context.py --mode packages
```

If the affected package has a `unit-test` spec layer, read its `index.md` and the referenced testing guides first.

For the implementation side, also read the relevant package/layer specs you are about to change.

## Iron Rule

Do not write production code for the current behavior slice until you have:

1. written a failing test for that slice
2. run it
3. confirmed it fails for the expected reason

If production code for the slice already exists, do not keep extending it blindly. Re-anchor on the failing test first.

## Workflow

### 1. Define the smallest behavior slice

State the next observable behavior in one sentence.

Good:
- "reject empty email"
- "retry failed operation up to 3 times"

Bad:
- "implement validation system"
- "finish retry helper"

### 2. RED — write one failing test

Write one focused test for that slice.

Requirements:
- clear test name
- one behavior only
- prefer real code paths
- avoid mocks unless isolation is truly necessary

Run the narrowest possible test command and inspect the result.

The test must fail because the behavior is missing or wrong, not because of typos, setup errors, or broken mocks.

If the test passes immediately, the slice is wrong or the test is not proving anything. Tighten it and rerun.

### 3. GREEN — write the minimum code

Implement only enough production code to make the failing test pass.

Do not:
- add unrelated features
- generalize early
- refactor unrelated areas
- add optional knobs "for later"

### 4. Verify GREEN

Run the same targeted test again.

Then run any adjacent tests needed to confirm the change did not break nearby behavior.

If the test still fails, fix the production code first. Do not relax the test unless the requirement itself was wrong.

### 5. REFACTOR

Only after green:
- remove duplication
- improve names
- extract helpers

Keep tests green while refactoring.

### 6. Repeat

Take the next smallest behavior slice and run the same cycle again.

## Anti-Patterns to Reject

- Writing code first and planning to "add tests after"
- Keeping prewritten production code as "reference" for the same slice
- Testing mock behavior instead of real behavior
- Adding test-only production APIs
- Using large mocks before understanding the dependency chain

If you hit one of these, stop and reset to the last clean failing-test boundary.

## Output Format

```markdown
## TDD Gate
- Scope: ...
- Smallest next behavior slice: ...
- Why TDD applies: ...

## RED Plan
- Test file: ...
- Test case: ...
- Expected failing reason: ...

## GREEN Boundary
- Minimum production change allowed: ...
- Explicitly out of scope for this slice: ...

## Verification
- Targeted test command: ...
- Follow-up checks after green: ...
```
