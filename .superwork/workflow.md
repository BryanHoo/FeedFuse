# Development Workflow

> Based on [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

---

## Table of Contents

1. [Quick Start (Do This First)](#quick-start-do-this-first)
2. [Workflow Overview](#workflow-overview)
3. [Session Start Process](#session-start-process)
4. [Development Process](#development-process)
5. [Session End](#session-end)
6. [File Descriptions](#file-descriptions)
7. [Best Practices](#best-practices)

---

## Quick Start (Do This First)

### Step 0: Initialize Developer Identity (First Time Only)

> **Multi-developer support**: Each developer/Agent needs to initialize their identity first

```bash
# Check if already initialized
python3 ./.superwork/scripts/get_developer.py

# If not initialized, run:
python3 ./.superwork/scripts/init_developer.py <your-name>
# Example: python3 ./.superwork/scripts/init_developer.py claude-agent
```

This creates:
- `.superwork/.developer` - Your identity file (gitignored, not committed)
- `.superwork/workspace/<your-name>/` - Your personal workspace directory

**Naming suggestions**:
- Human developers: Use your name, e.g., `john-doe`
- Claude Code: `claude-agent` or `claude-<task>`
- Codex: `codex-agent` or `codex-<task>`

### Step 1: Understand Current Context

```bash
# Get full context in one command
python3 ./.superwork/scripts/get_context.py

# Or check manually:
python3 ./.superwork/scripts/get_developer.py      # Your identity
python3 ./.superwork/scripts/task.py list          # Active tasks
git status && git log --oneline -10              # Git state
```

### Step 2: Read Project Guidelines [MANDATORY]

**CRITICAL**: Read guidelines before writing any code:

```bash
# Discover available packages and spec layers
python3 ./.superwork/scripts/get_context.py --mode packages

# Read the spec index for each relevant module
cat .superwork/spec/<package>/<layer>/index.md

# Always read shared guides
cat .superwork/spec/guides/index.md
```

**Why this matters?**
- Understand which spec layers apply to your task
- Know coding standards for the packages you'll modify
- Learn the overall code quality requirements

### Step 3: Before Coding - Read Specific Guidelines (Required)

Based on your task, read the **detailed** guideline files listed in each spec index's **Pre-Development Checklist**:

```bash
# The index points to specific files — read those, not just the index
cat .superwork/spec/<package>/<layer>/error-handling.md
cat .superwork/spec/<package>/<layer>/conventions.md
# etc. — based on what the Pre-Development Checklist lists
```

---

## Workflow Overview

### Core Principles

1. **Read Before Write** - Understand context before starting
2. **Follow Standards** - [!] **MUST read `.superwork/spec/` guidelines before coding**
3. **Incremental Development** - Complete one task at a time
4. **Record Promptly** - Update tracking files immediately after completion
5. **Document Limits** - [!] **Max 2000 lines per journal document**

### File System

```
.superwork/
|-- .developer           # Developer identity (gitignored)
|-- scripts/
|   |-- __init__.py          # Python package init
|   |-- common/              # Shared utilities (Python)
|   |   |-- __init__.py
|   |   |-- paths.py         # Path utilities
|   |   |-- developer.py     # Developer management
|   |   +-- git_context.py   # Git context implementation
|   |-- multi_agent/         # Multi-agent pipeline scripts
|   |   |-- __init__.py
|   |   |-- start.py         # Start worktree agent
|   |   |-- status.py        # Monitor agent status
|   |   |-- create_pr.py     # Create PR
|   |   +-- cleanup.py       # Cleanup worktree
|   |-- init_developer.py    # Initialize developer identity
|   |-- get_developer.py     # Get current developer name
|   |-- task.py              # Manage tasks
|   |-- get_context.py       # Get session context
|   +-- add_session.py       # One-click session recording
|-- workspace/           # Developer workspaces
|   |-- index.md         # Workspace index + Session template
|   +-- {developer}/     # Per-developer directories
|       |-- index.md     # Personal index (with @@@auto markers)
|       +-- journal-N.md # Journal files (sequential numbering)
|-- tasks/               # Task tracking
|   +-- {MM}-{DD}-{name}/
|       +-- task.json
|-- spec/                # [!] MUST READ before coding
|   |-- frontend/        # Frontend guidelines (if applicable)
|   |   |-- index.md               # Start here - guidelines index
|   |   +-- *.md                   # Topic-specific docs
|   |-- backend/         # Backend guidelines (if applicable)
|   |   |-- index.md               # Start here - guidelines index
|   |   +-- *.md                   # Topic-specific docs
|   +-- guides/          # Thinking guides
|       |-- index.md                      # Guides index
|       |-- cross-layer-thinking-guide.md # Pre-implementation checklist
|       +-- *.md                          # Other guides
+-- workflow.md             # This document
```

---

## Session Start Process

### Step 1: Get Session Context

Use the unified context script:

```bash
# Get all context in one command
python3 ./.superwork/scripts/get_context.py

# Or get JSON format
python3 ./.superwork/scripts/get_context.py --json
```

### Step 2: Read Development Guidelines [!] REQUIRED

**[!] CRITICAL: MUST read guidelines before writing any code**

Based on what you'll develop, read the corresponding guidelines:

```bash
# Discover available packages and spec layers
python3 ./.superwork/scripts/get_context.py --mode packages

# Read spec indexes for relevant modules
cat .superwork/spec/<package>/<layer>/index.md

# For cross-layer features
cat .superwork/spec/guides/cross-layer-thinking-guide.md
```

### Step 3: Select Task to Develop

Use the task management script:

```bash
# List active tasks
python3 ./.superwork/scripts/task.py list

# Create new task (creates directory with task.json)
python3 ./.superwork/scripts/task.py create "<title>" --slug <task-name>
```

---

## Development Process

### Task Development Flow

```
1. Create or select task
   --> python3 ./.superwork/scripts/task.py create "<title>" --slug <name> or list

2. Write code according to guidelines
   --> Read .superwork/spec/ docs relevant to your task
   --> For cross-layer: read .superwork/spec/guides/

3. Self-test
   --> Run project's lint/test commands (see spec docs)
   --> Manual feature testing

4. Commit code
   --> git add <files>
   --> git commit -m "type(scope): description"
       Format: feat/fix/docs/refactor/test/chore

5. Record session (one command)
   --> python3 ./.superwork/scripts/add_session.py --title "Title" --commit "hash"
```

### Recommended Lightweight Workflow Entry Points

Keep the existing Superwork task model and layer these lightweight Codex skills or Claude commands on top:

```text
Codex small change:
  $superwork-before-dev -> $superwork-tdd-core -> $superwork-check -> /superwork:finish-work

Claude small change:
  /superwork:before-dev -> /superwork:tdd-core -> /superwork:check -> /superwork:finish-work

Codex non-trivial feature or behavior change:
  $superwork-brainstorm (if needed) -> $superwork-spec-plan -> $superwork-execute-plan -> /superwork:finish-work

Claude non-trivial feature or behavior change:
  /superwork:brainstorm (if needed) -> /superwork:spec-plan -> /superwork:execute-plan -> /superwork:finish-work

Codex bug or regression:
  $superwork-debug-root-cause -> $superwork-tdd-core -> $superwork-check -> $superwork-break-loop -> /superwork:finish-work

Claude bug or regression:
  /superwork:debug-root-cause -> /superwork:tdd-core -> /superwork:check -> /superwork:break-loop -> /superwork:finish-work
```

Guidance:
- Prefer updating the existing task `prd.md` instead of creating separate design docs for every task.
- Use `$superwork-spec-plan` when the work needs clear scope, sequencing, or verification before coding.
- Use `$superwork-execute-plan` to keep implementation aligned with the plan and verification steps.
- Use `$superwork-debug-root-cause` before fixing bugs so root-cause analysis happens before code changes.
- The same flow applies to Claude via `/superwork:spec-plan`, `/superwork:execute-plan`, `/superwork:tdd-core`, and `/superwork:debug-root-cause`.

### Code Quality Checklist

**Must pass before commit**:
- [OK] Lint checks pass (project-specific command)
- [OK] Type checks pass (if applicable)
- [OK] Manual feature testing passes

**Project-specific checks**:
- See `.superwork/spec/<package>/<layer>/quality-guidelines.md` for package-specific checks

---

## Session End

### One-Click Session Recording

After code is committed, use:

```bash
python3 ./.superwork/scripts/add_session.py \
  --title "Session Title" \
  --commit "abc1234" \
  --summary "Brief summary"
```

This automatically:
1. Detects current journal file
2. Creates new file if 2000-line limit exceeded
3. Appends session content
4. Updates index.md (sessions count, history table)

### Pre-end Checklist

Use `/superwork:finish-work` command to run through:
1. [OK] All code committed, commit message follows convention
2. [OK] Session recorded via `add_session.py`
3. [OK] No lint/test errors
4. [OK] Working directory clean (or WIP noted)
5. [OK] Spec docs updated if needed

---

## File Descriptions

### 1. workspace/ - Developer Workspaces

**Purpose**: Record each AI Agent session's work content

**Structure** (Multi-developer support):
```
workspace/
|-- index.md              # Main index (Active Developers table)
+-- {developer}/          # Per-developer directory
    |-- index.md          # Personal index (with @@@auto markers)
    +-- journal-N.md      # Journal files (sequential: 1, 2, 3...)
```

**When to update**:
- [OK] End of each session
- [OK] Complete important task
- [OK] Fix important bug

### 2. spec/ - Development Guidelines

**Purpose**: Documented standards for consistent development

**Structure** (Multi-doc format):
```
spec/
|-- frontend/           # Frontend docs (if applicable)
|   |-- index.md        # Start here
|   +-- *.md            # Topic-specific docs
|-- backend/            # Backend docs (if applicable)
|   |-- index.md        # Start here
|   +-- *.md            # Topic-specific docs
+-- guides/             # Thinking guides
    |-- index.md        # Start here
    +-- *.md            # Guide-specific docs
```

**When to update**:
- [OK] New pattern discovered
- [OK] Bug fixed that reveals missing guidance
- [OK] New convention established

### 3. Tasks - Task Tracking

Each task is a directory containing `task.json`:

```
tasks/
|-- 01-21-my-task/
|   +-- task.json
+-- archive/
    +-- 2026-01/
        +-- 01-15-old-task/
            +-- task.json
```

**Commands**:
```bash
python3 ./.superwork/scripts/task.py create "<title>" [--slug <name>]   # Create task directory
python3 ./.superwork/scripts/task.py archive <name>  # Archive to archive/{year-month}/
python3 ./.superwork/scripts/task.py list            # List active tasks
python3 ./.superwork/scripts/task.py list-archive    # List archived tasks
```

---

## Best Practices

### [OK] DO - Should Do

1. **Before session start**:
   - Run `python3 ./.superwork/scripts/get_context.py` for full context
   - [!] **MUST read** relevant `.superwork/spec/` docs

2. **During development**:
   - [!] **Follow** `.superwork/spec/` guidelines
   - Use `$superwork-tdd-core` for behavior changes whenever a failing automated check can be written first
   - Use `$superwork-spec-plan` for multi-file or cross-layer changes before coding
   - Use `$superwork-debug-root-cause` before fixing regressions or flaky failures
   - For cross-layer features, use `/superwork:check-cross-layer`
   - Develop only one task at a time
   - Run lint and tests frequently

3. **After development complete**:
   - Use `/superwork:finish-work` for completion checklist
   - After fix bug, use `/superwork:break-loop` for deep analysis
   - Commit after testing passes
   - Use `add_session.py` to record progress

### [X] DON'T - Should Not Do

1. [!] **Don't** skip reading `.superwork/spec/` guidelines
2. [!] **Don't** let journal single file exceed 2000 lines
3. **Don't** develop multiple unrelated tasks simultaneously
4. **Don't** commit code with lint/test errors
5. **Don't** forget to update spec docs after learning something
6. [!] **Don't** execute `git commit` before verification passes

---

## Quick Reference

### Must-read Before Development

| Task Type | Must-read Document |
|-----------|-------------------|
| Frontend work | `frontend/index.md` → relevant docs |
| Backend work | `backend/index.md` → relevant docs |
| Cross-Layer Feature | `guides/cross-layer-thinking-guide.md` |

### Commit Convention

```bash
git commit -m "type(scope): description"
```

**Type**: feat, fix, docs, refactor, test, chore
**Scope**: Module name (e.g., auth, api, ui)

### Common Commands

```bash
# Session management
python3 ./.superwork/scripts/get_context.py    # Get full context
python3 ./.superwork/scripts/add_session.py    # Record session

# Task management
python3 ./.superwork/scripts/task.py list      # List tasks
python3 ./.superwork/scripts/task.py create "<title>" # Create task

# Slash commands
/superwork:finish-work          # Pre-commit checklist
/superwork:break-loop           # Post-debug analysis
/superwork:check-cross-layer    # Cross-layer verification
/superwork:spec-plan            # Write lightweight spec + execution plan
/superwork:execute-plan         # Implement the approved plan
/superwork:tdd-core             # Run Red-Green-Refactor
/superwork:debug-root-cause     # Investigate before fixing

# Codex skills
$superwork-before-dev                     # Read relevant project guidelines
$superwork-spec-plan                      # Write lightweight spec + execution plan
$superwork-execute-plan                   # Implement the approved plan
$superwork-tdd-core                       # Run Red-Green-Refactor
$superwork-debug-root-cause               # Investigate before fixing
```

---

## Summary

Following this workflow ensures:
- [OK] Continuity across multiple sessions
- [OK] Consistent code quality
- [OK] Trackable progress
- [OK] Knowledge accumulation in spec docs
- [OK] Transparent team collaboration

**Core Philosophy**: Read before write, follow standards, record promptly, capture learnings
