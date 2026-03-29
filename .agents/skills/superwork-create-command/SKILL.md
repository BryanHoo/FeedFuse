---
name: superwork-create-command
description: "Scaffolds a new skill file with proper naming conventions and structure. Analyzes requirements to determine skill type and generates appropriate content. Use when adding a new developer workflow skill, creating a custom skill, or extending the Superwork skill set."
---

# Create New Skill

Create a new Codex skill in `.agents/skills/superwork-<skill-name>/SKILL.md` based on user requirements.

## Usage

```bash
$superwork-create-command <skill-name> <description>
```

**Example**:
```bash
$superwork-create-command review-pr Check PR code changes against project guidelines
```

## Execution Steps

### 1. Parse Input

Extract from user input:
- **Skill name suffix**: Use kebab-case without the project prefix (e.g., `review-pr`)
- **Description**: What the skill should accomplish

### 2. Analyze Requirements

Determine skill type based on description:
- **Initialization**: Read docs, establish context
- **Pre-development**: Read guidelines, check dependencies
- **Code check**: Validate code quality and guideline compliance
- **Recording**: Record progress, questions, structure changes
- **Generation**: Generate docs or code templates

### 3. Generate Skill Content

Minimum `SKILL.md` structure:

```markdown
---
name: superwork-<skill-name>
description: "<description>"
---

# <Skill Title>

<Instructions for when and how to use this skill>
```

### 4. Create Files

Create:
- `.agents/skills/superwork-<skill-name>/SKILL.md`

### 5. Confirm Creation

Output result:

```text
[OK] Created Skill: superwork-<skill-name>

File path:
- .agents/skills/superwork-<skill-name>/SKILL.md

Usage:
- Trigger directly with $superwork-<skill-name>
- Or open /skills and select it

Description:
<description>
```

## Skill Content Guidelines

### [OK] Good skill content

1. **Clear and concise**: Immediately understandable
2. **Executable**: AI can follow steps directly
3. **Well-scoped**: Clear boundaries of what to do and not do
4. **Has output**: Specifies expected output format (if needed)

### [X] Avoid

1. **Too vague**: e.g., "optimize code"
2. **Too complex**: Single skill should not exceed 100 lines
3. **Duplicate functionality**: Check if similar skill exists first

## Naming Conventions

| Skill Type | Suffix Pattern | Example Result |
|------------|----------------|----------------|
| Session Start | `start` | `superwork-start` |
| Pre-development | `before-...` | `superwork-before-dev` |
| Check | `check-...` | `superwork-check` |
| Record | `record-...` | `superwork-record-session` |
| Generate | `generate-...` | `superwork-generate-api-doc` |
| Update | `update-...` | `superwork-update-changelog` |
| Other | Verb-first | `superwork-review-code`, `superwork-sync-data` |
