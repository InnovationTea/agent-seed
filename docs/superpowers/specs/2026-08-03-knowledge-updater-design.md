# Knowledge Updater Design

## Goal

Decouple incremental knowledge-asset maintenance from the heavyweight
`agent-seed` onboarding workflow. Distribute a lightweight project-local
`knowledge-updater` skill that runs in the main agent session after each task
is complete and immediately before the final response.

The updater uses only knowledge established during the current conversation
and existing project knowledge assets. It does not scan the repository,
interview the owner, start a child agent, or depend on a platform SessionEnd
hook.

## Scope

- Add `knowledge-updater` as an Agent Seed bundled direct skill.
- Support Codex, Claude Code, codeagent-cli, and OpenCode project-local skill
  paths.
- Make Agent Seed offer the skill during initial onboarding and, after an
  approved install, add a concise task-completion rule to `AGENTS.md`.
- Let the updater maintain both `AGENTS.md` and focused `agents.d/` runbooks.
- Automatically make minimal knowledge-only edits without per-change
  confirmation.
- Require every final response to contain one short knowledge-asset status.
- Remove the current SessionEnd script, hook documentation, configuration,
  tests, and candidate-summary design.
- Detect legacy SessionEnd hook references and report an approval-gated
  migration action instead of silently editing harness configuration.

## Non-Goals

- Do not replace Agent Seed's initial repository scan and owner interview.
- Do not guarantee execution through a platform lifecycle event. The trigger
  is a project instruction followed by the main agent before its final
  response.
- Do not scan source code, Git history, session-history directories, or
  external locations during a routine knowledge update.
- Do not start a second agent or invoke Agent Seed from the updater.
- Do not update source code, tests, dependencies, platform settings, hooks,
  external integrations, or personal/global skill directories.
- Do not persist secrets, personal data, private account identifiers,
  machine-specific paths, raw chat transcripts, temporary debugging chatter,
  or unsupported inferences.

## Architecture

`agent-seed` remains responsible for initial knowledge distillation and
distribution. `knowledge-updater` owns incremental maintenance after normal
tasks.

```text
agent-seed onboarding
  -> offer project-local knowledge-updater install
  -> install after owner approval
  -> add concise task-completion rule to AGENTS.md

normal task
  -> main agent completes and verifies requested work
  -> invoke knowledge-updater before final response
  -> inspect current-conversation knowledge and existing assets
  -> apply a minimal knowledge-only update when warranted
  -> append one knowledge-asset status to the final response
```

The task-completion rule is the stable trigger contract. It must state that
the main agent invokes `knowledge-updater` after completing the user's task
and before producing its final response. It must also require the final
response to contain the updater's status. The skill is not selected through
topic matching alone; the installed project instruction makes it a recurring
completion step.

This is intentionally a soft trigger enforced by agent instructions rather
than a platform hook. A host that does not follow project instructions cannot
be made reliable without reintroducing platform-specific lifecycle coupling.

## Distribution And Installation

The skill source lives at:

```text
skill/bundled-skills/knowledge-updater/skill/
```

`skill/bundled-skills.json` registers it as a multi-platform direct skill with
the established project-local targets:

| Platform | Target |
| --- | --- |
| Codex | `skills/knowledge-updater` |
| Claude Code | `.claude/skills/knowledge-updater` |
| codeagent-cli | `.cac/skills/knowledge-updater` |
| OpenCode | `.opencode/skills/knowledge-updater` |

The Codex artifact includes the normal `agents/openai.yaml` overlay. Agent
Seed offers installation by default only for detected, requested, or
owner-confirmed platforms. The copy remains approval-gated because it changes
the target repository. Existing-target conflict handling follows the current
bundled direct-skill policy.

After installation, Agent Seed adds or updates a concise portable rule in
`AGENTS.md`. The rule references the installed skill instead of embedding the
full classification workflow. Agent Seed does not add platform SessionEnd
configuration.

## Input Boundary

For each task-completion check, the updater may use only:

- Facts, decisions, commands, results, and owner preferences established in
  the current conversation.
- Existing `AGENTS.md` content.
- Existing files directly under `agents.d/` that are relevant to a candidate
  update.

It must not broaden its evidence collection to repository source, metadata,
Git history, generated output, session transcript files, browser state, user
directories, or the network. If current-conversation evidence is insufficient
to state a durable future-facing rule, the result is `no-change`.

The updater runs in the main session and therefore does not need transcript
paths, child-process CLI selection, timeout handling, or recursive-session
markers.

## Knowledge Selection

A candidate is eligible only when it is durable, project-specific, reusable by
a future agent, and established by one of these sources:

- `Owner-confirmed`: the owner stated or approved the rule.
- `Observed during run`: the current task directly demonstrated the command,
  symptom, behavior, or recovery step.
- `Repo-confirmed`: repository evidence already read for the main task
  established the fact. The updater may reuse that fact from current context
  but may not reopen repository files to rediscover it.
- `Preference` or `Risk judgment`: the owner established a lasting workflow
  preference or safety boundary.

Exclude:

- One-off task details and temporary debugging attempts.
- Conclusions that remain inferred, uncertain, or context-dependent.
- Generic engineering advice that is not specific to the project.
- Existing knowledge expressed with different wording.
- Any sensitive or personal information.

The updater converts accepted knowledge into future-facing instructions,
commands with success signals, symptom-to-recovery playbooks, change recipes,
or escalation rules. It never appends raw conversation text.

## Classification And Writes

Use `AGENTS.md` for concise entry rules, important cross-cutting constraints,
and links. Put detailed material in the established `agents.d/` homes:

| Knowledge | Destination |
| --- | --- |
| Bootstrap and prerequisites | `agents.d/bootstrap.md` |
| Approved tools, scripts, and skills | `agents.d/tooling.md` |
| Run, build, test, and lint loops | `agents.d/development-loop.md` |
| Boundaries, entry points, and data flow | `agents.d/architecture-map.md` |
| Symptoms, diagnosis, and recovery | `agents.d/debug-playbook.md` |
| Repeated changes and required checks | `agents.d/change-recipes.md` |
| Review evidence and done criteria | `agents.d/review-handoff.md` |
| Invariants, hazards, and escalation | `agents.d/risk-areas.md` |

Before writing, compare the candidate with the relevant existing content.
Preserve headings, tone, source labels, and file organization. Make the
smallest coherent edit. When creating a new `agents.d/` file, add a concise
link to the existing `AGENTS.md` index. Keep detailed knowledge in one place
and do not duplicate it in the entry point.

The approved recurring workflow authorizes these bounded edits directly; it
does not require confirmation for each update. This authorization applies only
to `AGENTS.md` and `agents.d/`. It does not extend to deleting knowledge,
broadly rewriting assets, resolving contradictions, installing tools, changing
hooks or platform configuration, accessing the network, or editing personal
directories.

## Conflict Handling

When a current-conversation candidate contradicts an existing knowledge
asset, the updater must not silently choose a winner or modify either rule. It
returns a conflict status naming the affected file. The already completed main
task is not blocked, and the owner can resolve the rule in a later turn.

Apparent wording differences that express the same rule are treated as
duplicates and produce no change. A contradiction that could affect setup,
tests, data, security, releases, or review is always treated as a conflict.

## Status Contract

Every final response in a project with the completion rule includes exactly
one concise knowledge-asset status. Supported forms are:

```text
Knowledge assets: updated (AGENTS.md, agents.d/debug-playbook.md)
Knowledge assets: no new reusable knowledge
Knowledge assets: not initialized
Knowledge assets: conflict, not updated (agents.d/development-loop.md)
Knowledge assets: update failed (<concise reason>)
```

Generated project guidance may use the user's working language, including the
Chinese equivalents:

```text
知识资产：已更新（AGENTS.md、agents.d/debug-playbook.md）
知识资产：无新增
知识资产：未初始化
知识资产：存在冲突，未更新（agents.d/development-loop.md）
知识资产：更新失败（<简短原因>）
```

`updated` names only files actually changed. `no new reusable knowledge`
means the check ran successfully but produced no file changes. The updater
does not claim `updated` merely because its workflow completed.

## Missing And Failed States

- If `AGENTS.md` is absent, return `not initialized`. Do not create onboarding
  assets and do not invoke Agent Seed automatically.
- If `agents.d/` is absent, a concise rule may be added to an existing suitable
  `AGENTS.md` section. Detailed eligible knowledge may create the standard
  focused `agents.d/` file and add its index link.
- If no eligible knowledge exists, return `no new reusable knowledge` without
  touching files.
- If a conflict exists, return `conflict, not updated` and name the affected
  asset without making a speculative edit.
- If a file is read-only or an edit fails, preserve the main task result and
  return `update failed` with a concise non-sensitive reason.
- If the skill is referenced but unavailable, the main agent reports an
  update failure or not-initialized state; it must not start Agent Seed or
  install the skill automatically.

## SessionEnd Removal And Migration

Remove the obsolete SessionEnd implementation:

- `skill/scripts/session-end-knowledge-update.mjs`
- `skill/references/session-end-hooks.md`
- `tools/session-end-knowledge-update.test.mjs`
- SessionEnd sections and links in `skill/SKILL.md`, `README.md`, `.gitignore`,
  release tests, and release/check commands
- `session_end_knowledge_update`, `AGENT_SEED_SESSION_END_CHILD`, and
  `.agents/session-summaries/` as supported concepts

An upgraded Agent Seed may encounter a target project whose
`.claude/settings.json` or `.cac/settings.json` still references
`session-end-knowledge-update.mjs`. During onboarding or migration inspection,
report the exact legacy reference and offer to remove it. Removing it requires
owner approval because hook settings are harness configuration. Never delete
or rewrite the hook silently, and do not scan personal/global settings unless
the owner explicitly authorizes that scope.

The new updater does not consume old candidate summaries. Existing local
`.agents/session-summaries/` files are left untouched and may be archived or
removed separately by the owner.

## Testing

Release and contract tests cover:

- `knowledge-updater` registration and project-local paths for all four
  supported platforms.
- The Codex overlay and generated direct-skill artifacts.
- Default installation offer, approval requirement, detected/requested
  platform gating, and existing-target behavior.
- The task-completion trigger and mandatory final-response status contract.
- The strict input boundary: current conversation plus `AGENTS.md` and
  relevant `agents.d/` only.
- Classification, source labels, de-duplication, minimal edits, and
  `AGENTS.md` index maintenance.
- Exclusion of secrets, personal data, temporary process details, raw chat,
  and unsupported inference.
- `updated`, `no-change`, `not-initialized`, `conflict`, and `failed` outcomes.
- Absence of the SessionEnd script and hook reference from release artifacts.
- Absence of SessionEnd installation or recommendation from Agent Seed.
- Legacy-hook migration being reported and approval-gated rather than applied
  silently.

Tests are contract tests over the delivered skill and manifests. They do not
need to start a real agent host or emulate a platform lifecycle event because
the design intentionally has no lifecycle hook.

## Success Criteria

- Normal task completion performs no repository scan, owner interview,
  transcript-file read, network action, or child-agent launch for knowledge
  maintenance.
- Every final response after installation contains one accurate knowledge
  asset status.
- Only durable, project-specific, current-conversation knowledge produces an
  edit.
- Eligible knowledge is placed in `AGENTS.md` and `agents.d/` with a minimal,
  non-duplicative change.
- Conflicts and failures never hide or invalidate the completed main task.
- Released Agent Seed packages contain the new direct skill and no longer
  contain or recommend the SessionEnd implementation.
