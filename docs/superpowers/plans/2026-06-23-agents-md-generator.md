# AGENTS.md Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an `agents-md-generator` skill that scans a non-AI-native repository, asks targeted project-owner questions, and generates a concise project-specific `AGENTS.md`.

**Architecture:** Implement the first version as a lightweight Codex skill under `skills/agents-md-generator/`. The skill uses a procedural `SKILL.md` workflow plus `agents/openai.yaml` UI metadata; no scripts or references are needed for v1 because repository scanning and document generation are best handled by Codex tools and judgment.

**Tech Stack:** Codex skill markdown, YAML metadata, PowerShell command examples, bundled Codex Python runtime for skill validation.

---

## File Structure

- Create: `skills/agents-md-generator/SKILL.md`
  - Defines the trigger metadata and the complete scan, question, generation, and self-review workflow.
- Create: `skills/agents-md-generator/agents/openai.yaml`
  - Provides UI-facing display name, short description, and default prompt.
- Modify: none.
- Test: validate the skill folder with `quick_validate.py` and inspect generated files with `rg`.

## Implementation Tasks

### Task 1: Initialize Skill Skeleton

**Files:**
- Create: `skills/agents-md-generator/SKILL.md`
- Create: `skills/agents-md-generator/agents/openai.yaml`

- [ ] **Step 1: Run the skill initializer**

Run:

```powershell
& 'C:\Users\shengjiajun\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'C:\Users\shengjiajun\.codex\skills\.system\skill-creator\scripts\init_skill.py' agents-md-generator --path 'D:\workspace\ai_assisted_rd\skills' --interface display_name='AGENTS.md Generator' --interface short_description='Generate project-specific AGENTS.md files from repository scans and owner answers.' --interface default_prompt='Use $agents-md-generator to scan this project and generate an AGENTS.md.'
```

Expected:

```text
Created skill: D:\workspace\ai_assisted_rd\skills\agents-md-generator
```

If the initializer reports that the target already exists, inspect the existing files and continue only if they match this plan's target skill.

- [ ] **Step 2: Inspect the generated files**

Run:

```powershell
rg --files skills/agents-md-generator
```

Expected:

```text
skills/agents-md-generator/SKILL.md
skills/agents-md-generator/agents/openai.yaml
```

- [ ] **Step 3: Commit the skeleton**

Run:

```powershell
git add skills/agents-md-generator
git commit -m "chore: scaffold agents md generator skill"
```

Expected:

```text
commit output showing message: chore: scaffold agents md generator skill
```

### Task 2: Write Skill Workflow

**Files:**
- Modify: `skills/agents-md-generator/SKILL.md`

- [ ] **Step 1: Replace `SKILL.md` with the final skill instructions**

Write this exact content to `skills/agents-md-generator/SKILL.md`:

````markdown
---
name: agents-md-generator
description: Generate or update a project-specific AGENTS.md for non-AI-native repositories. Use when the user asks to create an AGENTS.md, make a repository AI-agent ready, document agent working rules, onboard Codex or other coding agents to an existing project, or scan a project and produce agent instructions.
---

# AGENTS.md Generator

Create a concise `AGENTS.md` that tells coding agents how to work safely in the current repository.

The output is an internal engineering guide, not a consulting report.

## Core Rules

- Scan before asking questions.
- Separate confirmed facts, inferred details, and missing context.
- Ask the project owner targeted questions before generating the final file.
- Do not write guessed commands or conventions as facts.
- Keep the generated `AGENTS.md` short, direct, and repository-specific.
- Preserve any existing `AGENTS.md` unless the user confirms replacement.

## Workflow

### 1. Inspect Existing Agent Instructions

Check whether these files exist:

```powershell
rg --files -g 'AGENTS.md' -g 'CLAUDE.md' -g 'GEMINI.md'
```

If `AGENTS.md` exists, read it before doing anything else. Ask whether to update it, replace it, or create `AGENTS.generated.md`. Do not overwrite it without confirmation.

### 2. Scan Repository Evidence

Use `rg --files` first. Read files that exist from this list:

- `README*`
- `package.json`
- `pnpm-lock.yaml`
- `yarn.lock`
- `package-lock.json`
- `pyproject.toml`
- `requirements*.txt`
- `Pipfile`
- `poetry.lock`
- `pom.xml`
- `build.gradle`
- `settings.gradle`
- `go.mod`
- `Cargo.toml`
- `Makefile`
- `Dockerfile`
- `docker-compose*.yml`
- `.github/workflows/*`
- `.gitlab-ci.yml`
- `Jenkinsfile`
- linter, formatter, and test configuration files

Inspect top-level and second-level directory structure. Skip large generated or dependency folders such as `.git`, `node_modules`, `dist`, `build`, `target`, `.venv`, and `vendor`.

### 3. Present Scan Summary

Before writing `AGENTS.md`, present a compact summary:

```markdown
## Confirmed
- Facts directly found in repository files.

## Inferred
- Likely facts based on file names, dependencies, or structure.

## Missing
- Information that could not be determined safely.

## Questions
- Questions for the project owner.
```

Keep `Inferred` conservative. If a command is not found in project files, list it as missing instead of guessing.

### 4. Ask Owner Questions

Ask 3-8 questions. Prefer fewer questions when repository evidence is strong.

Prioritize:

- Actual install, run, test, lint, format, build, and deploy commands.
- Whether tests and CI are trusted.
- High-risk modules, data flows, or workflows.
- Directories agents should avoid or treat carefully.
- Generated files and migration rules.
- Coding conventions not encoded in tooling.
- What "done" means for typical changes.

Do not ask all questions at once if the answer will be hard to provide. Group related command questions together when that reduces back-and-forth.

### 5. Generate AGENTS.md

Generate this structure:

```markdown
# AGENTS.md

## Project Snapshot
## Tech Stack
## Commands
## Repository Map
## Development Rules
## Testing and Verification
## Agent Workflow
## Risk Areas
## Do Not
## Missing Context
## Codex Notes
```

Write in short imperative prose.

Use this section guidance:

- `Project Snapshot`: State what the project does using confirmed files or owner input.
- `Tech Stack`: List languages, frameworks, runtimes, package managers, and major tools.
- `Commands`: Include only commands found in project files or confirmed by the owner.
- `Repository Map`: Describe important directories and boundaries.
- `Development Rules`: Capture project-specific style, architecture, dependency, and review rules.
- `Testing and Verification`: State exactly what agents must run before claiming completion.
- `Agent Workflow`: Tell agents to read context, make focused edits, preserve conventions, verify, and report changes.
- `Risk Areas`: List modules, files, workflows, or data paths needing extra care.
- `Do Not`: List hard constraints and forbidden actions.
- `Missing Context`: Keep unresolved questions that affect safe agent work.
- `Codex Notes`: Add Codex-specific advice while keeping the rest portable.

Use these default `Codex Notes` unless the project needs stricter guidance:

```markdown
## Codex Notes

- Use `rg` or `rg --files` before slower search commands.
- Read nearby code before editing.
- Use the repository's documented commands for verification.
- Keep changes scoped to the requested task.
- Do not reset, discard, or overwrite user changes unless explicitly asked.
- For large or risky changes, write a short plan before editing.
```

### 6. Self-Review Before Finishing

Check the generated file for:

- Inferred details written as confirmed facts.
- Commands not found in project files or owner answers.
- Generic advice that could apply to any repository.
- Missing testing or verification instructions.
- Missing risk areas.
- Contradictions between repository evidence and owner answers.
- Placeholder text such as `TODO`, `TBD`, or vague filler.

Fix issues before presenting the result.

## Edge Cases

- If the repository is too large, sample top-level structure and the most important config files first.
- If no metadata files exist, generate a minimal file with a prominent `Missing Context` section.
- If the owner cannot answer a question, keep it in `Missing Context`.
- If commands are discovered but may be unsafe or expensive, ask before running them.
- If the user only asks for a template, provide the structure without scanning or writing repository-specific facts.

## Final Response

Summarize:

- The path written.
- Whether an existing `AGENTS.md` was updated or a new file was created.
- Which facts came from owner answers if that matters.
- Any unresolved missing context.
- Verification performed, such as self-review or file inspection.
````

- [ ] **Step 2: Inspect frontmatter and trigger description**

Run:

```powershell
Get-Content -TotalCount 8 'skills/agents-md-generator/SKILL.md'
```

Expected:

```text
---
name: agents-md-generator
description: Generate or update a project-specific AGENTS.md for non-AI-native repositories. Use when the user asks to create an AGENTS.md, make a repository AI-agent ready, document agent working rules, onboard Codex or other coding agents to an existing project, or scan a project and produce agent instructions.
---
```

- [ ] **Step 3: Check for placeholder text**

Run:

```powershell
rg -n "TODO|TBD|implement later|fill in details" skills/agents-md-generator/SKILL.md
```

Expected:

```text
```

The command should exit with no matches. The shell may report a non-zero exit code because `rg` returns `1` when no matches are found.

- [ ] **Step 4: Commit the skill workflow**

Run:

```powershell
git add skills/agents-md-generator/SKILL.md
git commit -m "feat: add agents md generator workflow"
```

Expected:

```text
commit output showing message: feat: add agents md generator workflow
```

### Task 3: Write UI Metadata

**Files:**
- Modify: `skills/agents-md-generator/agents/openai.yaml`

- [ ] **Step 1: Replace `openai.yaml` with final UI metadata**

Write this exact content to `skills/agents-md-generator/agents/openai.yaml`:

```yaml
interface:
  display_name: "AGENTS.md Generator"
  short_description: "Scan a repository and generate a project-specific AGENTS.md."
  default_prompt: "Use $agents-md-generator to scan this project and generate an AGENTS.md."
```

- [ ] **Step 2: Inspect YAML**

Run:

```powershell
Get-Content -Raw 'skills/agents-md-generator/agents/openai.yaml'
```

Expected:

```yaml
interface:
  display_name: "AGENTS.md Generator"
  short_description: "Scan a repository and generate a project-specific AGENTS.md."
  default_prompt: "Use $agents-md-generator to scan this project and generate an AGENTS.md."
```

- [ ] **Step 3: Commit UI metadata**

Run:

```powershell
git add skills/agents-md-generator/agents/openai.yaml
git commit -m "chore: add agents md generator metadata"
```

Expected:

```text
commit output showing message: chore: add agents md generator metadata
```

### Task 4: Validate Skill

**Files:**
- Test: `skills/agents-md-generator/SKILL.md`
- Test: `skills/agents-md-generator/agents/openai.yaml`

- [ ] **Step 1: Run skill validation**

Run:

```powershell
& 'C:\Users\shengjiajun\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'C:\Users\shengjiajun\.codex\skills\.system\skill-creator\scripts\quick_validate.py' 'D:\workspace\ai_assisted_rd\skills\agents-md-generator'
```

Expected:

```text
Validation passed
```

If the exact success text differs, accept an exit code of `0` with no validation errors.

- [ ] **Step 2: Verify required files exist**

Run:

```powershell
rg --files skills/agents-md-generator
```

Expected:

```text
skills/agents-md-generator/SKILL.md
skills/agents-md-generator/agents/openai.yaml
```

- [ ] **Step 3: Verify no unintended resource directories were created**

Run:

```powershell
Get-ChildItem -Force 'skills/agents-md-generator'
```

Expected entries:

```text
agents
SKILL.md
```

- [ ] **Step 4: Verify git status**

Run:

```powershell
git status --short
```

Expected:

```text
```

There should be no uncommitted changes after the task commits above.

### Task 5: Forward-Test the Skill on This Repository

**Files:**
- Read: `skills/agents-md-generator/SKILL.md`
- Test artifact: generated draft should not be committed unless the user asks to keep it.

- [ ] **Step 1: Use the skill instructions manually on the current repository**

Run:

```powershell
rg --files
```

Expected repository evidence:

```text
skills/gitpush/SKILL.md
skills/gitpush/agents/openai.yaml
docs/superpowers/specs/2026-06-23-agents-md-generator-design.md
docs/superpowers/plans/2026-06-23-agents-md-generator.md
skills/agents-md-generator/SKILL.md
skills/agents-md-generator/agents/openai.yaml
```

- [ ] **Step 2: Produce a scan summary from evidence**

Expected summary:

```markdown
## Confirmed
- This repository stores Codex skills under `skills/`.
- Existing skills use `SKILL.md` plus `agents/openai.yaml`.
- There is a `gitpush` skill and an `agents-md-generator` skill.
- Superpowers design and plan documents live under `docs/superpowers/`.

## Inferred
- The repository is a personal AI-assisted R&D workspace for Codex skills and related process docs.

## Missing
- There are no project-level install, build, lint, or test commands.
- There is no project-level AGENTS.md yet.

## Questions
- Should this repository get its own AGENTS.md now, or should the generated sample be discarded after validation?
- Are there any local conventions for skill review beyond `quick_validate.py`?
```

- [ ] **Step 3: Confirm the skill would ask questions instead of writing guessed facts**

Verify the scan summary keeps commands under `Missing` and does not invent test or build commands.

- [ ] **Step 4: Commit any validation adjustments**

If forward-testing reveals wording gaps in `SKILL.md`, patch the skill, rerun Task 4 validation, then commit:

```powershell
git add skills/agents-md-generator/SKILL.md skills/agents-md-generator/agents/openai.yaml
git commit -m "fix: refine agents md generator instructions"
```

Expected:

```text
commit output showing message: fix: refine agents md generator instructions
```

If no changes are needed, do not create an empty commit.

## Plan Self-Review Result

- The plan creates only the skill files required for v1.
- The plan follows the approved design: scan, summarize, ask owner questions, generate, self-review.
- The generated `AGENTS.md` structure includes the portable body and `Codex Notes`.
- Existing `AGENTS.md` handling is explicit and non-destructive.
- Commands use the available bundled Python runtime instead of assuming `python` is on PATH.
- Validation uses `quick_validate.py`.
- No implementation step relies on an unresolved placeholder.
