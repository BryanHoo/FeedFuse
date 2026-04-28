---
name: trellis-finish-work
description: "Wrap up the current session: verify quality gate passed, remind user to commit, archive completed tasks, and record session progress to the developer journal. Use when done coding and ready to end the session."
---

# Finish Work

Wrap up the current session.

## Step 1: Quality Gate

`trellis-check` should have already run in Phase 3. If not, trigger it now and do not proceed until lint, type-check, tests, and spec compliance pass.

## Step 2: Remind User to Commit

If there are uncommitted changes:

> "Please review the changes and commit when ready."

Do NOT run `git commit` — the human commits after testing.

## Step 3: Record Session (after commit)

Archive finished tasks (judge by work status, not the `status` field):

```bash
python3 ./.trellis/scripts/task.py archive <task-name>
```

Append a session entry (auto-handles journal rotation, line count, index update):

```bash
python3 ./.trellis/scripts/add_session.py \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary"
```
