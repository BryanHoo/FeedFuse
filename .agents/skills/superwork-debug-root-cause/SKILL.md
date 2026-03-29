---
name: superwork-debug-root-cause
description: "Systematically investigate bugs, test failures, build breaks, and unexpected behavior before proposing fixes. Use when something is broken, flaky, regressing, or behaving inconsistently and you need to reproduce it, gather evidence, trace the root cause, then fix it safely."
---

# Debug Root Cause

Debug by evidence, not by guesswork.

This skill keeps the strongest parts of systematic debugging while fitting the existing Superwork workflow.

## Iron Law

Do not propose or implement a fix until you have investigated the root cause.

## Step 1: Reproduce Clearly

Capture:

- the exact failing command, request, or user action
- the observed output or error
- whether the issue is deterministic, flaky, or environment-specific

If you cannot reproduce it, gather more evidence before changing code.

## Step 2: Read The Evidence

Before touching code:

1. Read the full error message.
2. Read the full stack trace.
3. Note file paths, line numbers, config keys, payload values, and timestamps if relevant.
4. Check recent changes that could explain the break.

Prefer direct evidence over intuition.

## Step 3: Trace The Failure Path

Find where the bad value, state, or assumption enters the system.

For multi-layer problems:

- inspect each boundary
- log or observe inputs and outputs at each step
- compare working and failing paths

The goal is to identify where the behavior first becomes wrong, not where the crash finally appears.

## Step 4: Form One Hypothesis

State one clear hypothesis:

> I think `<root cause>` is causing `<symptom>` because `<evidence>`.

Test one hypothesis at a time. Do not stack speculative fixes.

## Step 5: Lock The Failure With A Test

Once the root cause is understood:

1. Add the smallest failing automated check that reproduces the bug.
2. Use `$superwork-tdd-core` to turn that failure green.

If no automated test is possible, use the narrowest reproducible script or command and document it explicitly.

## Step 6: Apply The Minimal Fix

Fix the source of the problem, not the downstream symptom.

Avoid:

- unrelated cleanup
- bundled refactors
- speculative hardening not supported by evidence

## Step 7: Verify And Expand

After the fix:

1. Re-run the failing scenario.
2. Re-run the new regression test.
3. Run nearby checks that could reveal collateral damage.
4. If the bug taught a reusable lesson, use `$superwork-break-loop`.

## Escalation Rules

Stop and step back when:

- two fix attempts failed and the evidence no longer supports the current mental model
- the problem spans contracts or architecture, not one local bug
- the system behavior differs across layers and you have not yet isolated the failing boundary

At that point, return to investigation instead of trying "one more quick fix."

## Output

Report:

1. reproduction steps
2. root-cause hypothesis and evidence
3. the regression test or reproducible check
4. the minimal fix applied
5. the verification that now passes
