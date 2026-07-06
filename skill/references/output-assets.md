# Output Assets

Use this reference before generating new onboarding files.

## Contents

- Asset Selection
- AGENTS.md
- agents.d
- CLAUDE.md
- Project-Specific Skill
- Recommended External Plugin Installation
- Bundled Direct Skill Installation
- Bundled Package Installation

## Asset Selection

Always generate or update `AGENTS.md` unless the user explicitly asks for another file only.

Generate `agents.d/` by default for knowledge distillation. Skip it only when the project is small and the owner explicitly wants everything in a concise `AGENTS.md`.

Generate platform-specific files only for platforms the owner uses or explicitly requests, such as `CLAUDE.md`, `GEMINI.md`, or `.opencode/`. If platforms are unknown, ask before generating platform-specific files.

Generate or propose a project-specific skill when repeated workflows should trigger automatically, when the project will be onboarded repeatedly, or when distilled knowledge should be reused across future agents and checkouts.

## Knowledge Asset Write Mode

Resolve the write mode before creating or editing `AGENTS.md`, `agents.d/`, `CLAUDE.md`, `.opencode/`, generated project skills, or `.agents/agent-seed.json`.

Persist the target project's mode in `.agents/agent-seed.json`:

```json
{
  "knowledge_asset_write_mode": "ask-each-change"
}
```

Supported values:

- `ask-each-change`: Ask before each knowledge asset file creation or edit. State the target file, reason, and intended change.
- `agent-approve`: After the owner confirms the onboarding/update scope, create and edit in-scope knowledge assets autonomously. Still ask before conflicts, deletes, broad rewrites, install commands, hook changes, external network access, or personal/global directory writes.
- `full-access`: Create, update, and reorganize knowledge assets directly inside the target project, then report the diff and verification. Still ask before secrets, production actions, destructive changes, install commands, hook changes, external network access, or personal/global directory writes.

The current user request wins over the project config. If the user does not specify a mode, read `.agents/agent-seed.json`. If the config is missing, default to `ask-each-change` and ask whether to create `.agents/agent-seed.json` with the selected mode.

Recommend external platform plugins when a mature cross-project tool should be installed through Codex, Claude Code, OpenCode, or another platform's normal network-backed plugin flow instead of being bundled into the generated project assets.

If `bundled-skills.json` exists in this skill, inspect it before proposing bundled direct skills. Use it as the source of truth for direct skill source paths, supported platforms, target paths, overlays, default-offer rules, verification, and safety policy.

If `bundled-packages.json` exists in this skill, inspect it before proposing bundled packages or platform skills. Use it as the source of truth for vendored package versions, source commits, package paths, nested platform skill paths, install commands, and safety policy. Resolve `<package-dir>` from the configured package path before showing or running an installer.

## AGENTS.md

`AGENTS.md` is the portable, platform-agnostic entry point. Both OpenAI Codex and OpenCode CLI read this file as project rules.

Use this structure:

```markdown
# AGENTS.md

## Project Snapshot
## Tech Stack
## Commands
## Environment Setup
## Automation Runbook
## Approved Skills And Tools
## agents.d Index
## Repository Map
## Development Rules
## Testing and Verification
## Debugging Playbook
## Change Recipes
## Agent Workflow
## Human Review Handoff
## Risk Areas
## Do Not
## Missing Context
```

Write in short imperative prose.

Section guidance:

- `Project Snapshot`: State what the project does using confirmed files, owner input, and the project description from Step 0.
- `Tech Stack`: List languages, frameworks, runtimes, package managers, and major tools.
- `Commands`: Include only commands found in project files or confirmed by the owner.
- `Environment Setup`: List prerequisites, runtime versions, package manager setup, local services, required files, and environment variables. Do not include secret values.
- `Automation Runbook`: Provide the shortest confirmed path from fresh checkout to running, building, and testing. Include expected success signals.
- `Approved Skills And Tools`: List approved skill invocations, recommended external plugins, project scripts, and internal tools, or point to `agents.d/tooling.md`.
- `agents.d Index`: Link to split-out knowledge files when generated. Omit this section when no `agents.d/` files are generated.
- `Repository Map`: Describe important directories and boundaries.
- `Development Rules`: Capture project-specific style, architecture, dependency, and review rules.
- `Testing and Verification`: State exactly what agents must run before claiming completion.
- `Debugging Playbook`: Capture common failure symptoms, diagnostic commands, logs to inspect, and owner-confirmed recovery steps.
- `Change Recipes`: List common change workflows and the files/checks they involve, or point to `agents.d/change-recipes.md`.
- `Agent Workflow`: Tell agents to read context, make focused edits, preserve conventions, verify, and report changes.
- `Human Review Handoff`: State what evidence the agent must provide before human review, including commands run, outputs observed, skipped checks, and remaining risks.
- `Risk Areas`: List modules, files, workflows, or data paths needing extra care.
- `Do Not`: List hard constraints and forbidden actions.
- `Missing Context`: Keep unresolved questions that affect safe agent work.

Do not include platform-specific visible sections in `AGENTS.md`. If the owner works with Codex, Codex-specific tips may be added as an HTML comment at the end:

```markdown
<!-- Codex: prefer rg over find; read nearby code before editing; keep changes scoped -->
```

## agents.d

Generate `agents.d/` as the default home for detailed distilled knowledge. Keep each file focused and directly actionable.

Recommended structure:

```text
agents.d/
  bootstrap.md
  tooling.md
  development-loop.md
  architecture-map.md
  debug-playbook.md
  change-recipes.md
  review-handoff.md
  risk-areas.md
```

File guidance:

- `bootstrap.md`: Fresh checkout, prerequisites, environment files, local services, seed data, and success signals.
- `tooling.md`: Approved skills, recommended external plugins, scripts, CLIs, code generators, validators, safety levels, inputs, outputs, and failure recovery.
- `development-loop.md`: Daily run/build/test/lint commands, fast checks, slow checks, and when each is required.
- `architecture-map.md`: Entry points, module boundaries, data flow, generated code, and files that change together.
- `debug-playbook.md`: Symptom -> diagnosis -> recovery tables with logs and commands.
- `change-recipes.md`: Common tasks, likely files, required tests, and review notes.
- `review-handoff.md`: What the agent must report before human review and what evidence to include.
- `risk-areas.md`: Dangerous workflows, invariants, migration rules, security/cost/data risks, and escalation triggers.

In `AGENTS.md`, point agents to the relevant `agents.d/` file instead of duplicating detailed content.

## CLAUDE.md

Generate a concise `CLAUDE.md` only when Claude Code is used or requested.

Target 80-120 lines maximum with this structure:

```markdown
# CLAUDE.md

## Project Overview
## Tech Stack
## Critical Commands
## Code Style & Conventions
## Workflow Preferences
## Architecture Notes
```

Guidance:

- `Project Overview`: 2-3 sentences on what the project does and its purpose, drawn from Step 0 and confirmed evidence.
- `Tech Stack`: Concise list of languages, frameworks, and key tools with versions when known.
- `Critical Commands`: Exact commands for install, build, test, lint, and format. One command per line. Only confirmed commands.
- `Code Style & Conventions`: Naming conventions, file organization, import ordering, and formatting rules not already enforced by tooling.
- `Workflow Preferences`: Branch strategy, commit message format, PR process, and review expectations when project-specific.
- `Architecture Notes`: Key decisions, module boundaries, and data flow patterns that help safe changes.

If the project is too large for 80-120 lines, use imports such as `@AGENTS.md` or `@docs/architecture.md`. Keep the file focused on Claude Code needs. Do not include generic best practices, personality instructions, or duplicated content already available through `AGENTS.md`.

## Project-Specific Skill

Generate or propose a project-specific skill when repeated workflows should trigger automatically.

The project skill should:

- Live in the location the user wants for installation or sharing. If unspecified, propose repository-local `skills/<project>-onboard/`.
- Include concise trigger metadata for working in this exact project.
- Point agents to `AGENTS.md` and `agents.d/` for stable rules instead of duplicating all content.
- Reserve official skill resource directories when useful: `scripts/` for executable helpers, `references/` for load-on-demand docs, and `assets/` for templates or resources used in outputs.
- Use an additional `packages/` directory for versioned bundled packages that may contain multiple platform skills, scripts, commands, plugins, hooks, or assets.
- Use an additional `skills/` directory only for direct repository-local skills whose folder is itself the skill root.
- Use an additional `bundled-skills/` directory only for copy-only direct skills shipped inside the onboarding skill. Keep `packages/` for installer-backed or version-pinned distribution units.
- Track direct bundled skills in `bundled-skills.json`; enumerate source paths, supported platforms, target paths, overlays, default-offer rules, verification, and safety policy.
- Track external bundled package versions in `bundled-packages.json`; pin tags to immutable commits and enumerate nested platform skills.
- If the owner explicitly wants reserved empty directories, create them only in the generated project skill package and use the repository's existing placeholder convention, such as `.gitkeep`, when empty directories must be tracked.
- Include only durable setup, run, build, test, debug, change, review, and handoff procedures.
- Avoid secrets, personal machine paths, one-off troubleshooting logs, and broad AI behavior advice.
- Include `agents/openai.yaml` when creating a Codex-discoverable skill.

Use this structure when the project skill needs reusable resources, bundled direct skills, or bundled packages:

```text
<project>-onboard/
  SKILL.md
  agents/
    openai.yaml
  scripts/
  references/
  assets/
  bundled-skills/
    <skill>/
      skill/
        SKILL.md
      overlays/
        codex/
          agents/
            openai.yaml
  packages/
    <package>/
      README.md
      .claude/skills/<skill>/SKILL.md
      .opencode/skills/<skill>/SKILL.md
```

Use `scripts/`, `references/`, and `assets/` according to the official skill resource convention. Treat `packages/` and direct `skills/` as additional distribution directories, not required official resource directories.

Use this `SKILL.md` structure:

```markdown
---
name: <project>-onboard
description: Use when working in <project>, especially for setup, running, building, testing, debugging, or preparing changes for review.
---

# <Project> Onboard

## Read First
## Bootstrap
## Approved Skills And Tools
## Development Loop
## Change Recipes
## Debugging
## Verification
## Handoff
## Escalate To Human
## Bundled Direct Skills
## Bundled Packages
```

## Recommended External Plugin Installation

External plugin recommendations are guidance, not bundled assets. Do not add them to `bundled-skills.json` or `bundled-packages.json` unless the owner explicitly changes the requirement to vendoring.

Use `recommended-external-plugins.json` as the source of truth for known external plugin recommendations. For each configured plugin that matches the owner's platform and is not already available, copy the relevant configured fields into the generated guidance instead of writing plugin-specific prose by hand.

When recommending external plugins in `AGENTS.md`, `agents.d/tooling.md`, or a generated project skill, include:

- Plugin name and purpose.
- Platforms it applies to.
- How to detect whether it is already available.
- The platform-native install action.
- Whether installation requires network access and user approval.
- Verification after installation.
- A clear note that the plugin is recommended externally and is not vendored into `bundled-skills.json`, `bundled-packages.json`, or project-local skill folders.

Use the configured `install_action`, `detection_evidence`, `verification`, and `default_recommendation` fields for platform-native instructions. Do not run an install action automatically when the config marks it as requiring network access or user approval.

## Bundled Direct Skill Installation

When generating a project-specific skill that contains copy-only bundled skills, include installation guidance either in the project skill's `SKILL.md` or in `references/bundled-skills.md`.

For each bundled direct skill, document:

- Skill name, version, purpose, source path, and supported platforms.
- Default install mode, whether to offer by default, and whether user approval is required.
- Platform target paths, overlay paths, and detection evidence for Codex, Claude Code, OpenCode, or other supported tools.
- Exact copy behavior: copy the `source_path` directory into each selected platform target path, then apply the platform overlay if one is configured.
- Existing target behavior: stop and ask the user whether to skip, replace, or manually merge when the target path already exists.
- Verification step after install for each selected platform.
- Safety level: autonomous, ask first, or never install automatically.

Install direct bundled skills only for platforms the owner explicitly uses or repository evidence detects. Detection evidence includes owner answers and platform-specific project files such as `.codex`, `skills/`, `AGENTS.md`, `.claude`, `CLAUDE.md`, `.opencode`, or `.opencode.yaml`. Do not create platform directories for unknown or unused platforms by default.

When `bundled-skills.json` marks `default_install.offer_by_default`, proactively offer to copy the direct skill into the selected project-local platform paths during onboarding. Run the copy only after user approval because it modifies the target project. Do not install bundled direct skills into personal/global skill directories unless the user explicitly asks for personal/global installation.

## Bundled Package Installation

When generating a project-specific skill that contains bundled packages, include installation guidance either in the project skill's `SKILL.md` or in `references/bundled-packages.md`.

For each bundled package, document:

- Package name, package path, and package README or install guide.
- Version, source repository, tag/ref, and pinned commit when externally sourced.
- What workflow should trigger the package or its nested platform skills.
- Whether it is required, recommended, or optional.
- Supported platforms and nested platform skill names/source paths.
- Project-local install destination.
- Exact package installation step or manual copy instruction.
- Files or directories the installer may write.
- Verification step after install for each platform skill.
- Safety level: autonomous, ask first, or never install automatically.

When `bundled-packages.json` marks `default_install.offer_by_default` for a project-local package install, proactively offer to run the project-local installer during onboarding. Run it only after user approval because it may modify the target project. Do not install bundled platform skills into personal/global skill directories unless the user explicitly asks for personal/global installation.

If the platform supports direct repository-local skill loading, document that path instead of copying files.

The bundled `git-code-tracker` entry is pinned to `v1.0.1` / `e1cc62d9fb3f82e2f13ca276be94ce5fcdaf6aa9`. The package root is `packages/git-code-tracker`; the actual platform skills are `.opencode/skills/ai-code-tracker` and `.claude/skills/ai-code-tracker` inside that package. Prefer its README and `node <package-dir>/install-to-project.js <target-project>` over duplicating manual install details. Its installer is project-local and may write `.opencode/skills/ai-code-tracker`, `.claude/skills/ai-code-tracker`, commands, plugins, hooks, `.ai-tracking`, `.gitignore`, and `AGENTS.md`.
