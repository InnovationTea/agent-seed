---
name: agent-seed
description: Use when the user asks to distill repository evidence and owner knowledge into agent runbooks, make a repository AI-agent ready, generate or update AGENTS.md/agents.d/CLAUDE.md, prepare Codex/Claude/codeagent-cli/OpenCode to work in an existing codebase, identify common or private framework conventions during repository scans, capture project setup/build/test/debug/tooling knowledge from a knowledgeable developer, define human review checkpoints for agent self-directed development loops, recommend configured external agent plugins, install or document bundled packages or platform skills, or add newly discovered project knowledge to reusable agent guidance assets.
---

# Agent Seed

Distill repository evidence and owner knowledge into executable agent runbooks, review checkpoints, and project-local guidance that let coding agents develop in safe self-directed loops.

Default to senior-developer knowledge distillation. The normal output is `AGENTS.md` plus `agents.d/`; add platform-specific files only for platforms the owner uses, and generate or propose a project-specific skill when repeated workflows should trigger automatically.

This skill can also distribute bundled direct skills listed in `bundled-skills.json` and bundled packages listed in `bundled-packages.json`. A bundled direct skill is a simple skill directory copied into supported project-local platform paths. A bundled package may contain one or more platform-specific skills and may be configured as a default project-local install candidate. Every onboarding run for Codex, Claude Code, OpenCode, codeagent-cli (cac), or another supported agent must inspect these manifests. For integrations named by `activation_policy.recurring_install_prompt`, ask whether to install every missing applicable integration on every activation before onboarding, then run it only after user approval.

## Version And Self Update

Released packages include `VERSION.json` with the packaged skill version, repository, commit, primary release asset, and release manifest name. On every Agent Seed activation, complete this self-update preflight before onboarding conclusions in this order: read `VERSION.json` from this skill root when present, read the local `.agents/agent-seed.json` state from the target root when present, then must run `node scripts/update-agent-seed.mjs --json`. Invoking `/agent-seed` authorizes this read-only GitHub latest-release check. The only exceptions are when the owner explicitly asks to skip the update check in the current turn or the local config sets `self_update.check_on_start` to `false`.

The updater checks the GitHub latest release API for the configured repository and compares the local version with the latest tag:

```bash
node scripts/update-agent-seed.mjs --json
```

Treat the GitHub latest release check as the sole read-only network exception to the normal ask-first policy. `self_update.last_check` is historical state only: agents must not use `self_update.last_check` to skip this activation's check, including when its status is `updated`; its status, versions, and timestamp describe only the past. If the check cannot run because the owner withdraws authorization or network execution fails, do not treat Agent Seed as current or checked. When local-state writes are authorized, record an owner-declined check as `self_update.last_check.status: "deferred"` with `reason: "network-denied"`, then continue the rest of the Activation Preflight and report that update status is unknown. Keep reminding on later activations until a network-backed check succeeds, the owner disables `self_update.check_on_start`, or the owner explicitly defers the reminder again.

The updater only applies changes when `--apply` is passed:

```bash
node scripts/update-agent-seed.mjs --apply
```

Never run `--apply` without owner approval. If `VERSION.json` is missing because the skill is running from source instead of a release package, pass `--repository owner/repo` or explain that update metadata is only injected into tagged release artifacts.

When `--apply` is approved, the updater downloads `agent-seed.zip`, expands it, moves the current skill root to a temporary backup, and copies the expanded package into the original target path. This is a replacement update, not a merge: files that existed only in the old skill directory are removed. If copying the new package fails, the updater restores the backup before reporting the error.

On Windows, the current agent host may lock the installed skill directory. If an approved replacement hits that lock, the updater stages the verified package in the current user's local application-data directory, records `status: "queued"` with `reason: "windows-directory-locked"`, and starts an external helper. The update automatically completes after the agent host exits and releases the directory lock. Do not run another update command while it is queued. The helper records `updated` after it verifies the installed version; only a terminal `failed` state requires another `--apply` command.

Use `.agents/agent-seed.json` as the unified local Agent Seed config and state file. Proxy settings for the updater live under `self_update.proxy`; for example:

```json
{
  "knowledge_asset_write_mode": "ask-each-change",
  "self_update": {
    "check_on_start": true,
    "proxy": {
      "https_proxy": "http://proxy.example:8080",
      "no_proxy": "localhost,127.0.0.1"
    },
    "last_check": {
      "status": "deferred",
      "reason": "network-denied"
    }
  },
  "install_prompt_history": [
    {
      "at": "2026-07-22T08:00:00.000Z",
      "platform": "codex",
      "integration": "opencli",
      "decision": "declined",
      "reason": "Browser automation is out of scope for this project."
    }
  ]
}
```

This file may contain machine-specific proxy settings or local permission history. It is local state, not a shared onboarding asset. When creating it in a target project, ensure `.gitignore` contains `.agents/agent-seed.json`. To persist proxy settings through the updater, use `node scripts/update-agent-seed.mjs --set-https-proxy <url>` and optionally `--set-no-proxy <hosts>`. If no updater or environment proxy is configured, the updater may reuse Git's `http.proxy`/`https.proxy` settings or, on Windows, the current user's explicit system proxy settings for the GitHub release check. In an interactive terminal, if the update check fails with a proxy-like network error and no proxy is configured, the updater may ask for an HTTPS proxy URL, save it here, and retry once.

`install_prompt_history` is best-effort local audit history. On a declined recurring integration, append the activation time, platform, integration, decision, and owner-provided reason. Never interpret this history as an opt-out or skip marker. If the local state cannot be written, report that limitation and continue after capturing the reason in the current result.

## Activation Preflight

Before scanning, interviewing, generating files, or answering onboarding conclusions, complete the Activation Preflight. First, inspect `external-packages.json`, `bundled-skills.json`, and `bundled-packages.json`; agents must inspect `external-packages.json`, `bundled-skills.json`, and `bundled-packages.json` before continuing. Treat each manifest's `activation_policy.on_agent_seed_start: "must_check"` as a hard gate, including in Claude Code and other environments that may not load platform-specific prompts.

After the target root is known, perform a minimal platform-evidence scan inside that root before deciding which manifest entries apply. Identify the current agent platform from the active environment, user request, and platform evidence such as `.codex/`, `skills/`, `.claude/`, `CLAUDE.md`, `.cac/`, `.opencode/`, `opencode.json`, or `.opencode.yaml`. Treat `.cac/` as codeagent-cli (cac), a Claude-compatible layout whose project-local files mirror `.claude/` under a different directory name. Do not treat `AGENTS.md` by itself as proof that Codex project-local skills should be installed. If target-root platform evidence is absent or ambiguous, inspect current agent runtime evidence next, such as the platform that loaded this skill, visible skills, platform-specific prompt metadata, tool names, or explicit user invocation. Ask the owner before inspecting user-level agent configuration, `$CODEX_HOME`, personal/global directories, plugin caches, session history, or installed global skills; use those locations only to identify candidate platforms, not as target-project facts. If runtime or approved user-level evidence reveals multiple platform candidates, ask the owner to choose which agent platform or platforms this project should support before offering installs or generating platform-specific assets. For each configured external plugin that applies to the platform and is not already visible, offer the platform-native install action from `external-packages.json`. For each bundled direct skill or bundled package with `default_install.offer_by_default: true`, offer the configured project-local install for platforms the owner explicitly uses, repository evidence detects, runtime evidence identifies, or the owner confirms from user-level evidence. For `git-code-tracker` and OpenCLI, read each manifest's `activation_policy.recurring_install_prompt`. When a named integration applies to the selected platform and is missing, ask whether to install it on every activation before onboarding. If the owner declines, ask for a reason, record the reason, and continue onboarding; a previous decline must not suppress a future prompt. Do not prompt for an installed integration whose configured verification has passed. `git-code-tracker` remains project-local and approval-gated; OpenCLI remains networked, global, and approval-gated.

Do not continue with onboarding work until each applicable default or recommended item is accepted, declined, already available, platform-inapplicable, or explicitly deferred. Specifically, do not present the scan summary, begin owner interviews, generate files, or claim no installs are needed until this is resolved. Record the reason when an applicable install is skipped. Never run an install command, copy skill files, modify hooks, network access other than the authorized read-only self-update check, or write personal/global directories without owner approval.

Persist the target project's local Agent Seed preferences and state in `.agents/agent-seed.json`:

```json
{
  "knowledge_asset_write_mode": "ask-each-change"
}
```

Supported modes are `ask-each-change`, `agent-approve`, and `full-access`. The current user request wins over the project config, then `.agents/agent-seed.json`, then default to `ask-each-change`. Apply this mode to writes under `AGENTS.md`, `agents.d/`, `CLAUDE.md`, `.cac/`, `.opencode/`, and generated project skill guidance. If the config file is missing during onboarding, ask whether to create it with the selected mode.

Treat external agent workflow suites listed in `external-packages.json` as recommended platform plugins, not bundled packages, unless the user explicitly asks to vendor them. If a configured plugin applies to the owner's platform and is not visible in the current agent environment or project platform config, recommend installing it through the platform's normal network-backed plugin flow instead of copying its internals into the project.

When Superpowers is visible in the current agent environment, use it as the default SDD workflow suite for agent-runnable development loops. Require `superpowers:brainstorming` for feature or behavior design, `superpowers:writing-plans` for implementation planning, `superpowers:subagent-driven-development` or `superpowers:executing-plans` for plan execution, `superpowers:test-driven-development` for feature and bugfix implementation, `superpowers:systematic-debugging` for bugs or unexpected behavior, `superpowers:verification-before-completion` before completion claims, and `superpowers:requesting-code-review` or `superpowers:receiving-code-review` around review handoffs. If Superpowers is not visible but applies to the owner's platform, recommend installing it from `external-packages.json` and proceed only with owner approval. If the owner declines or the platform cannot load it, document the same SDD stages as expected workflow guidance without claiming the skills are available.

The output files are internal engineering guides and automation runbooks, not consulting reports.

## Core Rules

- Treat the user as the knowledgeable project owner, senior developer, architect, tech lead, or operator unless they explicitly say otherwise.
- Scan before asking detailed questions.
- Separate confirmed facts, inferred details, and missing context.
- Ask targeted interview questions before generating files; use multiple rounds when major knowledge categories remain missing.
- Do not write guessed commands or conventions as facts.
- Preserve the source of knowledge: repository evidence, owner-confirmed fact, operational preference, risk judgment, observed run result, or unknown.
- Treat built-in and project-local framework knowledge as scan guidance and interview prompts, not as confirmed target-project facts.
- Label framework knowledge sources explicitly: `Preset`, `Repo-confirmed`, `Owner-confirmed`, `Inferred`, or `Unknown`.
- Capture automation blockers as explicit breakpoints with owner-confirmed fixes or escalation rules.
- Capture approved skills, recommended external plugins, project scripts, and internal tools with trigger conditions, required inputs, success signals, and safety levels.
- Capture bundled direct skills with source path, supported platforms, target paths, trigger conditions, default-offer rules, verification, and safety rules.
- Capture bundled packages and their platform skills with version, source, install target, trigger conditions, required inputs, verification, and safety rules.
- Update existing onboarding assets when reusable project knowledge appears during later agent work.
- Distill tacit knowledge into executable instructions, recipes, playbooks, and handoff criteria, not background explanation.
- Preserve existing instruction files unless the user confirms replacement.
- Resolve `knowledge_asset_write_mode` before writing onboarding assets. In `ask-each-change`, ask before each file creation or edit. In `agent-approve`, write within the confirmed onboarding/update scope but ask before conflicts, deletes, broad rewrites, installs, hooks, external network use, or personal/global directory writes. In `full-access`, write onboarding assets directly and report diffs, but still ask before secrets, production actions, destructive changes, installs, hooks, external network use, or personal/global directory writes.
- Establish the target project root before scanning. Treat that root as the scan boundary and do not scan the agent-seed skill source directory, personal/global skill directories, Codex plugin caches, or `$CODEX_HOME` as repository evidence unless the user explicitly names one of them as the target project. When target-root evidence cannot identify the platform, ask before a narrow user-level fallback scan and confirm any platform inferred from that scan with the owner.
- Complete Activation Preflight before scan summaries, owner interviews, generated guidance, or claims that no installs are needed; the preflight may include the minimal target-root platform-evidence scan described above.
- Do not run install, build, test, migration, deploy, or service-start commands unless the user confirms they are safe in the current environment.
- Install bundled direct skills according to `bundled-skills.json`: proactively offer configured default project-local installs, install only platforms the owner explicitly uses or the repository evidence detects, and get user approval before copying files into the target project.
- Install bundled packages according to `bundled-packages.json`: proactively offer configured default project-local installs, but get user approval before running installers that modify the target project.
- Do not install bundled direct skills or bundled platform skills from packages into personal/global Codex/Claude/codeagent-cli/OpenCode directories unless the user explicitly asks for personal/global installation.
- Do not store secrets, personal machine paths, private account identifiers, one-off incident chatter, or temporary knowledge in onboarding assets.

## Progressive Disclosure

Read only the reference file needed for the current phase:

- For interview categories, source labels, tooling inventory, recommended external plugins, bundled direct skills, bundled packages, platform skills, version pins, and automation breakpoint capture, read `references/knowledge-distillation.md`; when external plugins are relevant, also inspect `external-packages.json`.
- For uncommon, private, vendor, internally named, or preset-supported frameworks, or when the user mentions a framework the model may not know well, read `references/framework-fingerprints.md`. If `framework-knowledge.json` contains a matching framework entry or the target project provides project-local framework knowledge, load only the matching framework knowledge files before interviewing the owner.
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
- If the current working directory is this `agent-seed` skill, another skill source directory, `$CODEX_HOME`, or a Codex plugin/cache directory, do not scan it as the target project. Ask for the target project path.
- Keep all repository scans, instruction-file checks, and evidence reads inside the target root unless the user explicitly asks to inspect an external dependency, installed skill, or package source.

Ask early which workflows should become agent-runnable, which parts usually require a familiar human, which skills/scripts/tools agents should use, whether any external plugins should be recommended, whether any bundled packages or platform skills should be created or installed, which agent platforms matter, whether to generate a reusable project skill now or only propose its shape, and which `knowledge_asset_write_mode` to use when `.agents/agent-seed.json` is absent.

### 1. Inspect Existing Agent Instructions

Check whether instruction files already exist:

```bash
rg --files <target-project-root> -g 'AGENTS.md' -g 'CLAUDE.md' -g 'GEMINI.md' -g '.cac/*' -g '.opencode/*' -g 'opencode.json' -g '.opencode.yaml' -g '.agents/agent-seed.json'
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
- Agent/tool config: `.agents/agent-seed.json`, `opencode.json`, `.opencode.yaml`, `.opencode/`, `.claude/settings.json`, `.cac/settings.json`.
- Automation folders: `scripts/**`, `tools/**`, `bin/**`, `tasks/**`.
- Project-bundled packages and skills: `bundled-skills.json`, `bundled-skills/**/SKILL.md`, `bundled-skills/**/agents/openai.yaml`, `bundled-packages.json`, `packages/**/SKILL.md`, `packages/**/skills/**/SKILL.md`, `packages/**/.claude/skills/**/SKILL.md`, `packages/**/.cac/skills/**/SKILL.md`, `packages/**/.opencode/skills/**/SKILL.md`, `skills/*/SKILL.md`, `skills/**/agents/openai.yaml`, and directly related `scripts/`, `references/`, or `assets/`.
- Linter, formatter, type-checker, and test configuration.

Use the project description and knowledge-holder role from Step 0 to decide which files need deeper reading.

Run a framework fingerprint pass before presenting the scan summary:

- Identify framework candidates from dependency names, build plugins, package managers, manifest files, generated directories, source file extensions, decorators, annotations, route/config files, and CLI wrappers.
- Inspect `framework-knowledge.json` before framework fingerprinting and merge matching aliases, fingerprint terms, and knowledge paths with owner-mentioned names.
- Check project-local framework knowledge candidates from the matching registry entry, staying inside the target root.
- Load matching built-in or project-local framework knowledge only after a name, alias, fingerprint, or owner mention makes it relevant.
- Search for owner-mentioned or vendor/private framework names case-insensitively, including aliases and translated names when provided.
- Keep the target root boundary: do not inspect installed SDKs, personal/global skill directories, plugin caches, or external framework sources unless the user explicitly asks.
- If a framework candidate is not well-known from repository evidence, classify it as `Inferred` or `Unknown` and ask targeted owner questions instead of mapping it onto a familiar framework.
- If repository files show framework-specific generators, build tools, DSLs, manifests, or lifecycle hooks, capture them as tooling, architecture, change recipes, and debug breakpoints.
- Keep preset framework knowledge out of `Confirmed`; use it for `Preset`, `Missing`, owner questions, and targeted scan terms.

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
- Recommended external plugins when a mature platform plugin should be installed through the owner's normal network-backed plugin flow instead of vendored into the generated assets.
- Bundled direct skills when simple reusable workflows should be copied into project-local Codex, Claude Code, codeagent-cli, or OpenCode skill directories.
- Bundled packages or bundled platform skills when reusable sub-workflows should be distributed with the onboarding package.

Use a lightweight `AGENTS.md`-only flow only when the user explicitly asks for a small instruction file or template and does not want a knowledge-distillation session.

### 5. Distill Project Knowledge

Read `references/knowledge-distillation.md`.

Interview in rounds. Ask 3-8 questions per round. Prefer fewer questions when repository evidence is strong, but continue when answers reveal missing bootstrap, architecture, change, debug, review, tooling, or risk knowledge.

Prioritize executable answers: exact commands, required inputs, expected success signals, known failure symptoms, owner-approved recovery steps, when agents may act autonomously, and when they must stop for human input.

### 6. Generate Or Update Agent Knowledge Assets

For new onboarding assets, read `references/output-assets.md`.

Always generate or update `AGENTS.md` unless the user explicitly asks for another file only. Generate `agents.d/` by default for distilled knowledge. Generate platform-specific files only for requested or owner-used platforms. Before creating or editing any of these assets, apply the resolved `knowledge_asset_write_mode` from the current request or `.agents/agent-seed.json`.

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
- Recommended external plugins documented as vendored assets or automatic installs instead of ask-first network-backed platform installs.
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
