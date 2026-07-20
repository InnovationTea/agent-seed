# Knowledge Distillation

Use this reference while interviewing the knowledgeable project owner and converting tacit knowledge into reusable agent instructions.

## Contents

- Interview Loop
- Knowledge Map
- Source Labels
- Tooling And Skill Inventory
- Recommended External Plugins
- Bundled Direct Skills, Packages, And Platform Skills
- Automation Checkpoints
- High-Value Question Areas
- Distillation Style

## Interview Loop

Ask 3-8 focused questions per round. Stop only when the next agent has a clear path for setup, development, verification, debugging, and human review, or when the remaining unknowns have explicit escalation rules.

Prefer questions that produce executable answers:

- What exact command or action should the agent run?
- What working directory, inputs, files, environment variables, services, or accounts are required?
- What output, port, log line, artifact, test result, or health check proves success?
- What common failure symptom should the agent recognize?
- What recovery step is approved?
- May the agent do this autonomously, should it ask first, or must it never run this?

Do not ask all categories at once. Group related command and environment questions when it reduces back-and-forth.

## Knowledge Map

Cover these categories unless the project scope makes one irrelevant:

- **Golden path**: The shortest reliable path from fresh checkout to a useful development loop.
- **Bootstrap blockers**: Local tools, versions, credentials, services, data, network access, generated files, and machine-specific assumptions.
- **Tooling inventory**: Approved skills, recommended external plugins, bundled packages, platform skills, scripts, CLIs, code generators, validators, and internal tools agents should use instead of improvising.
- **Framework inventory**: Common, private, vendor, internally named, or preset-supported frameworks; built-in and project-local framework knowledge sources; framework-owned files; generated-code boundaries; manifests; lifecycle hooks; required SDKs; and framework-specific commands.
- **Architecture map**: Module boundaries, key entry points, data flow, ownership boundaries, and where not to make cross-cutting changes.
- **Change recipes**: Where to edit for common tasks, which files must change together, and which checks prove the change worked.
- **Debug playbooks**: Common symptoms, logs to inspect, diagnostic commands, likely causes, and recovery steps.
- **Risk invariants**: Rules that protect data, compatibility, migrations, releases, security, costs, or user-visible behavior.
- **Review heuristics**: What a senior reviewer would inspect before trusting an agent's change.
- **Escalation rules**: Situations where an agent must stop and ask a human instead of continuing.

## Source Labels

Label source when the distinction matters:

- `Repo-confirmed`: Found directly in project files.
- `Preset`: Built-in or project-local framework knowledge used as scan guidance, owner-question input, or a checklist, but not confirmed target-project fact.
- `Owner-confirmed`: Stated by the knowledgeable developer as an operational fact.
- `Preference`: Team or maintainer preference.
- `Risk judgment`: Human judgment about danger, blast radius, or review priority.
- `Observed during run`: Learned from a command result in the current environment.
- `Unknown`: Still unresolved.

Do not turn inference into fact. When repo evidence and owner answers conflict, call out the conflict and ask which rule wins.

## Tooling And Skill Inventory

Use this structure before generating files:

```markdown
## Approved Skills
- Skill:
- Use when:
- Required inputs:
- Must read before use:
- Do not use when:
- Expected output:
- Safety level:

## Project Scripts
- Script path:
- Purpose:
- Use when:
- Command:
- Inputs or arguments:
- Expected success signal:
- Common failure:
- Safety level:
```

For each approved skill, script, or internal tool, capture exact name/path, trigger task, required inputs/context, working directory or arguments, success signal, common failure recovery, inappropriate use cases, expected output, and safety level: autonomous, ask first, or never run.

Ask targeted questions when scripts or skills are implied but undocumented.

## Framework Knowledge Sources

Use this structure before generating files when built-in or project-local framework knowledge participates in the scan:

```markdown
## Framework Knowledge Sources
- Framework:
- Source: Built-in preset, project-local preset, repo evidence, owner answer, or unknown.
- Registry entry:
- Knowledge file:
- Matching evidence:
- Confirmed facts:
- Questions still needed:
- Safety level:
```

For each source, distinguish preset scan guidance from confirmed facts. A built-in or project-local preset may provide aliases, file patterns, likely questions, and safety reminders, but commands, generated-code boundaries, lifecycle semantics, and recovery steps need repository evidence or owner confirmation before they are written as facts.

## Recommended External Plugins

Capture mature cross-project agent workflow suites as recommended external plugins when they should stay installed through the platform's own network-backed plugin flow instead of being vendored into the generated assets. Use `external-packages.json` as the source of truth for known external plugin recommendations. Its `activation_policy` defines the required start-of-skill check and skip-reason behavior.

Use this structure:

```markdown
## Recommended External Plugins
- Plugin:
- Purpose:
- Use when:
- Applies to platforms:
- Detection evidence:
- Install action:
- Requires network:
- Requires user approval:
- Verification:
- Do not vendor because:
- Safety level:
```

For each matching configured plugin, copy the relevant purpose, supported platform, install action, detection evidence, verification, network requirement, approval requirement, and safety level from `external-packages.json`. Do not add a configured external plugin to `bundled-skills.json`, `bundled-packages.json`, or project-local skill folders unless the user explicitly asks to vendor it.

Treat external plugin installation as ask-first when the config marks it as requiring network access or user approval. Record verification as the configured platform-specific smoke check.

## Bundled Direct Skills, Packages, And Platform Skills

Capture bundled direct skills when a repeated workflow can be distributed as a simple skill directory without a package installer. Treat the direct skill as copy-only project-local content; install it only for platforms the owner explicitly uses or repository evidence detects.

Use this structure:

```markdown
## Bundled Direct Skills
- Skill name:
- Version:
- Source path:
- Purpose:
- Default install mode:
- Offer by default:
- Supported platforms:
- Target paths:
- Platform detection evidence:
- Overlay paths:
- Verification:
- Existing target conflict rule:
- Safety level:
```

Ask the owner which agent platforms should receive the direct skill: Codex, Claude Code, OpenCode, or another tool. If the owner does not request a platform and repository evidence does not detect it, do not install that platform's copy by default.

Capture repository-local or project-skill-local packages when a repeated workflow ships reusable platform-specific skills, scripts, commands, plugins, hooks, or assets. Treat the outer package as the versioned distribution unit; treat each nested platform skill as the agent-facing triggerable unit.

Use this structure:

```markdown
## Bundled Packages
- Package name:
- Version:
- Source repo/ref/commit:
- Package path:
- README or install guide:
- Purpose:
- Default install mode:
- Offer by default:
- Files or directories the installer writes:
- Safety level:

## Platform Skills
- Platform:
- Skill name:
- Source path inside package:
- Target path:
- Use when:
- Required inputs:
- Must read before use:
- Install command or manual copy step:
- Verification:
- Do not use when:
```

Treat `bundled-skills/<skill-name>/skill/SKILL.md` or `skills/<skill-name>/SKILL.md` as a candidate bundled direct skill when it has durable project value and can be copied into future projects. Treat `packages/<package-name>/` as a candidate bundled package when it has durable project value and can be installed or referenced by future agents. Treat `packages/**/.claude/skills/**/SKILL.md` and `packages/**/.opencode/skills/**/SKILL.md` as platform skill entries, not necessarily as package roots. Do not mark an exploratory draft, private experiment, or incomplete package or skill as installable.

When a bundled package comes from an external repository, pin its version in `bundled-packages.json` with source repo, ref or tag, immutable commit, package path, platform skill source paths, supported platforms, install command, verification command, and safety policy.

Ask the owner:

- Should this package be proactively offered as a default project-local install, kept repository-local as optional, or installed into a user's personal skill directory only on explicit request?
- Which agent platforms should see it: Codex, Claude Code, OpenCode, or another tool?
- What package README, install script, or manual copy path should a future agent use?
- Which nested platform skills are actually installed for each platform?
- How can the agent verify installation or availability per platform?
- What inputs, credentials, or project context must exist before the package or platform skill is safe to use?

When `bundled-skills.json` or `bundled-packages.json` sets `default_install.offer_by_default`, proactively ask the user whether to install it during onboarding. Treat each manifest's `activation_policy` as requiring this check before onboarding work continues. Always get approval before copying files or running an installer that modifies the target project. If installation writes outside the repository or into personal/global skill directories, require the user to explicitly request personal/global installation.

## Automation Checkpoints

Build this table before generating files:

```markdown
## Automation Checkpoints
- Environment prerequisites:
- Dependency installation:
- Configuration and secrets:
- Local services and databases:
- First run / dev server:
- Build:
- Test:
- Lint / format:
- Common failures:
- Debug workflow:
- Human review handoff:
```

For each checkpoint, record:

- Confirmed command or action.
- Expected success signal, such as a port, log line, generated artifact, passing test output, or health check.
- Required files, environment variables, local services, accounts, credentials, or data.
- Known failure symptoms and exact recovery step.
- Whether an agent may run the command autonomously, must ask first, or must never run it.

Do not collapse breakpoints into vague advice. Each captured breakpoint should help a future agent continue without rediscovering the same failure.

## High-Value Question Areas

Prioritize:

- Install, run, test, lint, format, build, and deploy commands.
- Runtime versions, package manager versions, local service startup, seed data, secrets, and offline/online requirements.
- Success signals for install, run, build, and test.
- Known failure modes and owner-approved recovery.
- Approved existing skills, bundled packages, platform skills, and project scripts, including when to use them, how to install them, and when not to use them.
- Whether tests and CI are trusted.
- High-risk modules, data flows, generated files, and migration rules.
- Directories agents should avoid or treat carefully.
- Frameworks the project depends on, especially private/vendor frameworks; what each framework owns; which files are generated; which commands and tools are safe; and which framework conventions are easy for agents to miss.
- Coding conventions not encoded in tooling.
- What "done" and "ready for human review" mean.
- Common change recipes a new agent should be able to execute.
- Senior-review heuristics and risk invariants not encoded in tests.
- Agent platforms the user works with: Codex, Claude Code, OpenCode, Gemini, or other.

## Distillation Style

Convert knowledge into agent-usable instructions:

- Prefer commands, paths, decision rules, expected signals, and "if symptom, do action" playbooks.
- Include explanation only when it prevents a likely wrong edit.
- Generalize anecdotes into durable rules or recipes.
- Exclude secrets, personal machine paths, private account names, and one-off incident logs.
