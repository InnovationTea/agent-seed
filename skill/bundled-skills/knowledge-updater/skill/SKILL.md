---
name: knowledge-updater
description: Use after completing every project task and before the final response to preserve durable knowledge from the current conversation in AGENTS.md and agents.d/ and report the knowledge-asset status.
---

# Knowledge Updater

Maintain project knowledge assets as a lightweight completion step. Run after the main task and its verification are complete, immediately before the final response.

## Inputs

Use only facts, decisions, commands, results, and owner preferences established in the current conversation, plus the existing `AGENTS.md` and directly relevant files under `agents.d/`.

Do not scan or search the repository, Git history, session files, external directories, browser state, or the network. Do not invoke Agent Seed or start a child agent. Repository facts already established by the main task may be reused from current context without reopening their source files.

## Eligible Knowledge

Preserve knowledge only when it is durable, project-specific, reusable by a future agent, and supported as `Owner-confirmed`, `Observed during run`, `Repo-confirmed`, `Preference`, or `Risk judgment`.

Exclude secrets, personal data, private account identifiers, machine-specific paths, raw conversation text, one-off task details, temporary debugging attempts, generic advice, duplicate guidance, and unsupported inference. If current evidence is insufficient, make no change.

Convert accepted knowledge into future-facing instructions, commands with success signals, symptom-to-recovery playbooks, change recipes, or escalation rules.

## Classification

- Keep concise entry rules, cross-cutting constraints, and links in `AGENTS.md`.
- Put bootstrap knowledge in `agents.d/bootstrap.md`.
- Put approved tools, scripts, and skills in `agents.d/tooling.md`.
- Put run, build, test, and lint loops in `agents.d/development-loop.md`.
- Put boundaries, entry points, and data flow in `agents.d/architecture-map.md`.
- Put symptoms, diagnosis, and recovery in `agents.d/debug-playbook.md`.
- Put repeated changes and required checks in `agents.d/change-recipes.md`.
- Put review evidence and done criteria in `agents.d/review-handoff.md`.
- Put invariants, hazards, and escalation rules in `agents.d/risk-areas.md`.

Read only the relevant existing assets before editing. Preserve their headings, tone, source labels, and organization. Make the smallest coherent edit and avoid duplication. When a new `agents.d/` file is required, add a concise link to the existing `AGENTS.md` index.

## Write Boundary

The installed completion rule authorizes minimal edits to `AGENTS.md` and `agents.d/` without per-change confirmation. It does not authorize deleting knowledge, broad rewrites, conflict resolution, source or test edits, installs, hook or platform changes, network access, external integrations, or personal/global directory writes.

If candidate knowledge contradicts existing guidance, do not choose a winner and do not edit either rule. Report the conflict so the owner can resolve it later. Treat equivalent wording as a duplicate.

This skill does not start initial knowledge distillation, full repository scans,
or owner interviews, and it does not mark `knowledge_distillation` complete.
The absence of `agents.d/` is valid; create one standard focused file only when
the current task produces detailed eligible knowledge, then link it from
`AGENTS.md`.

## Status

Return exactly one status for the main agent to append to its final response:

```text
Knowledge assets: updated (AGENTS.md, agents.d/debug-playbook.md)
Knowledge assets: no new reusable knowledge
Knowledge assets: not initialized
Knowledge assets: conflict, not updated (agents.d/development-loop.md)
Knowledge assets: update failed (<concise reason>)
```

Use `updated` only when files actually changed and name only those files. If `AGENTS.md` is absent, return `not initialized`; do not create onboarding assets or invoke Agent Seed. If `agents.d/` is absent, concise knowledge may update `AGENTS.md`, while detailed eligible knowledge may create one standard focused file and add its index link. A conflict or write failure must not invalidate the completed main task.

The final response may translate the status into the user's working language, but it must preserve the same outcome and file list.
