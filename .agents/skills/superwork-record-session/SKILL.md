---
name: superwork-record-session
description: "Records completed work progress to .superwork/workspace/ journal files after verification and commit. Captures session summaries, commit hashes, and updates developer index files for future session context. Use when a coding session is complete, after the validated code has been committed, or to persist session knowledge for future AI sessions."
---

[!] **Prerequisite**: This skill should only be used AFTER the code has passed verification and been committed.

**Do NOT run `git commit` directly** — the scripts below handle their own commits for `.superwork/` metadata. You only need to read git history (`git log`, `git status`, `git diff`) and run the Python scripts.

---

## Record Work Progress

### Step 1: Get Context & Check Tasks

```bash
python3 ./.superwork/scripts/get_context.py --mode record
```

[!] Archive tasks whose work is **actually done** — judge by work status, not the `status` field in task.json:
- Code committed? → Archive it (don't wait for PR)
- All acceptance criteria met? → Archive it
- Don't skip archiving just because `status` still says `planning` or `in_progress`

```bash
python3 ./.superwork/scripts/task.py archive <task-name>
```

### Step 2: One-Click Add Session

```bash
# Method 1: Simple parameters
python3 ./.superwork/scripts/add_session.py \
  --title "Session Title" \
  --commit "hash1,hash2" \
  --summary "Brief summary of what was done"

# Method 2: Pass detailed content via stdin
cat << 'EOF' | python3 ./.superwork/scripts/add_session.py --stdin --title "Title" --commit "hash"
| Feature | Description |
|---------|-------------|
| New API | Added user authentication endpoint |
| Frontend | Updated login form |

**Updated Files**:
- `packages/api/modules/auth/router.ts`
- `apps/web/modules/auth/components/login-form.tsx`
EOF
```

**Auto-completes**:
- [OK] Appends session to journal-N.md
- [OK] Auto-detects line count, creates new file if >2000 lines
- [OK] Auto-detects Branch context (`--branch` override; otherwise Branch = task.json -> current git branch; missing values are omitted gracefully)
- [OK] Updates index.md (Total Sessions +1, Last Active, line stats, history)
- [OK] Auto-commits .superwork/workspace and .superwork/tasks changes

---

## Script Command Reference

| Command | Purpose |
|---------|---------|
| `python3 ./.superwork/scripts/get_context.py --mode record` | Get context for record-session |
| `python3 ./.superwork/scripts/add_session.py --title "..." --commit "..."` | **One-click add session (recommended, branch auto-complete)** |
| `python3 ./.superwork/scripts/task.py archive <name>` | Archive completed task (auto-commits) |
| `python3 ./.superwork/scripts/task.py list` | List active tasks |
