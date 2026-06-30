---
name: agent-onboard
description: Use when the user asks to onboard coding agents to a project, make a repository AI-agent ready, generate or update AGENTS.md/agents.d/CLAUDE.md, prepare Codex/Claude/OpenCode to work in an existing codebase, capture project setup/build/test/debug/tooling knowledge from a knowledgeable developer, install or document bundled packages or platform skills, or add newly discovered project knowledge to reusable agent onboarding assets.
---

# Agent Onboard

Onboard coding agents to a project by scanning the repository, interviewing the knowledgeable project owner, and distilling project-specific knowledge into agent-usable instructions.

Default to senior-developer knowledge distillation. The normal output is `AGENTS.md` plus `agents.d/`; add platform-specific files only for platforms the owner uses, and generate or propose a project-specific skill when repeated workflows should trigger automatically.

This skill can also distribute bundled direct skills listed in `bundled-skills.json` and bundled packages listed in `bundled-packages.json`. A bundled direct skill is a simple skill directory copied into supported project-local platform paths. A bundled package may contain one or more platform-specific skills and may be configured as a default project-local install candidate. Proactively offer default installs, but run them only after user approval.

The output files are internal engineering guides and automation runbooks, not consulting reports.

## Core Rules

- Treat the user as the knowledgeable project owner, senior developer, architect, tech lead, or operator unless they explicitly say otherwise.
- Scan before asking detailed questions.
- Separate confirmed facts, inferred details, and missing context.
- Ask targeted interview questions before generating files; use multiple rounds when major knowledge categories remain missing.
- Do not write guessed commands or conventions as facts.
- Preserve the source of knowledge: repository evidence, owner-confirmed fact, operational preference, risk judgment, observed run result, or unknown.
- Capture automation blockers as explicit breakpoints with owner-confirmed fixes or escalation rules.
- Capture approved skills, project scripts, and internal tools with trigger conditions, required inputs, success signals, and safety levels.
- Capture bundled direct skills with source path, supported platforms, target paths, trigger conditions, default-offer rules, verification, and safety rules.
- Capture bundled packages and their platform skills with version, source, install target, trigger conditions, required inputs, verification, and safety rules.
- Update existing onboarding assets when reusable project knowledge appears during later agent work.
- Distill tacit knowledge into executable instructions, recipes, playbooks, and handoff criteria, not background explanation.
- Preserve existing instruction files unless the user confirms replacement.
- Establish the target project root before scanning. Treat that root as the scan boundary and do not scan the agent-onboard skill source directory, personal/global skill directories, Codex plugin caches, or `$CODEX_HOME` unless the user explicitly names one of them as the target project.
- Do not run install, build, test, migration, deploy, or service-start commands unless the user confirms they are safe in the current environment.
- Install bundled direct skills according to `bundled-skills.json`: proactively offer configured default project-local installs, install only platforms the owner explicitly uses or the repository evidence detects, and get user approval before copying files into the target project.
- Install bundled packages according to `bundled-packages.json`: proactively offer configured default project-local installs, but get user approval before running installers that modify the target project.
- Do not install bundled direct skills or bundled platform skills from packages into personal/global Codex/Claude/OpenCode directories unless the user explicitly asks for personal/global installation.
- Do not store secrets, personal machine paths, private account identifiers, one-off incident chatter, or temporary knowledge in onboarding assets.

## Progressive Disclosure

Read only the reference file needed for the current phase:

- For interview categories, source labels, tooling inventory, bundled direct skills, bundled packages, platform skills, version pins, and automation breakpoint capture, read `references/knowledge-distillation.md`.
- For `AGENTS.md`, `agents.d/`, `CLAUDE.md`, project-specific skill structures, resource directories, bundled direct skills, bundled packages, platform skills, and default project-local installation, read `references/output-assets.md` before generating files.
- When the user adds knowledge after initial onboarding or asks to update existing instructions, read `references/update-existing-assets.md`.
- Before claiming the project is agent-ready or automation-ready, read `references/fresh-agent-dry-run.md`.

Do not duplicate reference content in generated files. Put the concise entry point in `AGENTS.md` and route detailed runbooks into focused `agents.d/` files.

## Workflow

### 0. Identify The Knowledge Holder, Goal, And Target Root

If the user invoked the skill with a project description or arguments, use that directly. Otherwise ask:

> Briefly describe what this project does, which areas or workflows you know best, and what a new agent or developer should be able to do after this onboarding.

Determine the target project root before scanning:

- If the user provides a project path, use that path as the target root.
- If the current working directory is the project to onboard, use the current working directory as the target root.
- If the current working directory is this `agent-onboard` skill, another skill source directory, `$CODEX_HOME`, or a Codex plugin/cache directory, do not scan it as the target project. Ask for the target project path.
- Keep all repository scans, instruction-file checks, and evidence reads inside the target root unless the user explicitly asks to inspect an external dependency, installed skill, or package source.

Ask early which workflows should become agent-runnable, which parts usually require a familiar human, which skills/scripts/tools agents should use, whether any bundled packages or platform skills should be created or installed, which agent platforms matter, and whether to generate a reusable project skill now or only propose its shape.

### 1. Inspect Existing Agent Instructions

Check whether instruction files already exist:

```bash
rg --files <target-project-root> -g 'AGENTS.md' -g 'CLAUDE.md' -g 'GEMINI.md' -g '.opencode/*'
```

If any instruction file exists, read it before doing anything else. Ask whether to update it, replace it, or create a draft alongside it. Do not overwrite without confirmation.

If the user is adding new knowledge to existing onboarding assets, prefer a minimal update over regeneration and read `references/update-existing-assets.md`.

### 2. Scan Repository Evidence

Use `rg --files <target-project-root>` first. Use `rg --files --hidden <target-project-root>` when inspecting bundled packages that keep platform assets under hidden directories such as `.claude/` or `.opencode/`. Inspect top-level and second-level structure inside the target root, skipping large generated or dependency folders such as `.git`, `node_modules`, `dist`, `build`, `target`, `.venv`, and `vendor`.

Do not broaden scans above the target root. If a discovered file references an external skill, package, or dependency outside the target root, record that reference and ask before inspecting the external location.

Read existing files from this evidence set when present:

- Project docs: `README*`, docs indexes, architecture docs.
- Language/package metadata: `package.json`, lockfiles, `pyproject.toml`, `requirements*.txt`, `Pipfile`, `poetry.lock`, `pom.xml`, Gradle files, `go.mod`, `Cargo.toml`.
- Build and runtime config: `Makefile`, `justfile`, `Taskfile.yml`, `Dockerfile`, `docker-compose*.yml`.
- CI/CD: `.github/workflows/*`, `.gitlab-ci.yml`, `Jenkinsfile`.
- Agent/tool config: `.opencode.yaml`, `.opencode/`, `.claude/settings.json`.
- Automation folders: `scripts/**`, `tools/**`, `bin/**`, `tasks/**`.
- Project-bundled packages and skills: `bundled-skills.json`, `bundled-skills/**/SKILL.md`, `bundled-skills/**/agents/openai.yaml`, `bundled-packages.json`, `packages/**/SKILL.md`, `packages/**/skills/**/SKILL.md`, `packages/**/.claude/skills/**/SKILL.md`, `packages/**/.opencode/skills/**/SKILL.md`, `skills/*/SKILL.md`, `skills/**/agents/openai.yaml`, and directly related `scripts/`, `references/`, or `assets/`.
- Linter, formatter, type-checker, and test configuration.

Use the project description and knowledge-holder role from Step 0 to decide which files need deeper reading.

### 3. Present A Scan Summary

Before generating files, present a compact summary:

```markdown
## Confirmed
- Facts directly found in repository files.

## Inferred
- Likely facts based on filenames, dependencies, or structure.

## Missing
- Information that could not be determined safely.

## Knowledge To Distill
- Tacit project knowledge that likely needs owner confirmation.

## Questions
- Questions for the project owner.
```

Keep `Inferred` conservative. If a command is not found in project files, list it as missing instead of guessing.

### 4. Set The Distillation Scope

Default to knowledge distillation, not a template fill-in.

Normal scope:

- `AGENTS.md` as the concise portable entry point.
- `agents.d/` as the default home for split runbooks, maps, recipes, playbooks, risks, and handoff rules.
- Platform-specific files such as `CLAUDE.md`, `GEMINI.md`, or `.opencode/` only when the owner uses or requests those agents.
- A project-specific skill recommendation, and the skill itself when repeated workflows should be shared across future agents or checkouts.
- Bundled direct skills when simple reusable workflows should be copied into project-local Codex, Claude Code, or OpenCode skill directories.
- Bundled packages or bundled platform skills when reusable sub-workflows should be distributed with the onboarding package.

Use a lightweight `AGENTS.md`-only flow only when the user explicitly asks for a small instruction file or template and does not want a knowledge-distillation session.

### 5. Distill Project Knowledge

Read `references/knowledge-distillation.md`.

Interview in rounds. Ask 3-8 questions per round. Prefer fewer questions when repository evidence is strong, but continue when answers reveal missing bootstrap, architecture, change, debug, review, tooling, or risk knowledge.

Prioritize executable answers: exact commands, required inputs, expected success signals, known failure symptoms, owner-approved recovery steps, when agents may act autonomously, and when they must stop for human input.

### 6. Generate Or Update Agent Knowledge Assets

For new onboarding assets, read `references/output-assets.md`.

Always generate or update `AGENTS.md` unless the user explicitly asks for another file only. Generate `agents.d/` by default for distilled knowledge. Generate platform-specific files only for requested or owner-used platforms.

For later knowledge additions, read `references/update-existing-assets.md`, classify the new knowledge into the right file, and use the smallest coherent edit.

### 7. Validate With A Fresh-Agent Dry Run

Read `references/fresh-agent-dry-run.md`.

Before finishing, simulate how a fresh agent would use the generated or updated assets. Walk through bootstrap, approved tool selection, run/build/test, debug, at least one representative change path when applicable, and human-review handoff.

Do not claim the assets are automation-ready unless each known failure has a clear next action or an explicit escalation rule.

### 8. Self-Review Before Finishing

Check generated or updated files for:

- Inferred details written as confirmed facts.
- Commands not found in project files or owner answers.
- Generic advice that could apply to any repository.
- Setup, run, build, or test steps without expected success signals.
- Debugging advice that names symptoms but not next actions.
- Unclear automation permissions: autonomous, ask first, or never run.
- Missing source labels where repo evidence and owner judgment differ.
- Tacit knowledge left as explanation instead of executable instructions.
- Approved skills or scripts without trigger conditions, inputs, expected output, and safety level.
- Bundled direct skills without platform target paths, default-offer rules, existing-target conflict handling, verification, or detected/requested platform gating.
- Manual workflow prose that should point to an approved script or tool.
- `AGENTS.md` becoming too long when content belongs in `agents.d/`.
- Missing testing, verification, human-review handoff, change recipes, tooling inventory, or risk areas.
- New knowledge appended as chat transcript instead of distilled instructions.
- Duplicated or contradictory guidance across `AGENTS.md`, `agents.d/`, platform files, or a project skill.
- Placeholder text such as `TODO`, `TBD`, or vague filler.

Fix issues before presenting the result.

## Edge Cases

- If the repository is too large, sample top-level structure and the most important config files first.
- If no metadata files exist, generate minimal files with prominent `Missing Context` sections.
- If the owner cannot answer a question, keep it in `Missing Context`.
- If commands are discovered but may be unsafe, destructive, expensive, or slow, ask before running them.
- If automation commands cannot be run in the current environment, record them as confirmed instructions only when the owner confirms them, and note they were not executed.
- If a breakpoint requires secrets, credentials, private accounts, VPNs, hardware, paid services, or production access, document the requirement and safe escalation path without exposing the secret or attempting access.
- If the owner gives broad background context, convert it into rules, recipes, playbooks, or escalation triggers before writing files.
- If new knowledge is temporary, personal, secret-bearing, or not reusable by future agents, do not write it into onboarding assets; summarize why and ask whether a safe generalized rule exists.
- If the user only asks for a template, provide the structure without scanning or writing repository-specific facts.
- If the user only wants one specific file, generate only that file.
- If a platform file already exists and is well-maintained, offer to update it rather than replacing it.

## Final Response

Summarize:

- Files generated or updated and their paths.
- Whether existing files were updated or new files were created.
- Where owner-confirmed knowledge, newly supplied knowledge, and unresolved missing context were placed.
- Verification performed, including self-review and fresh-agent dry run results.
- Platforms covered by the generated files.
- Whether knowledge distillation, automation runbooks, breakpoints, `agents.d/`, and a project-specific skill were generated, updated, proposed, or intentionally skipped.
