---
name: agent-seed-updater
description: Use once before the first project task in each new agent conversation to check the installed Agent Seed release and its project-local managed skills without running onboarding or scanning the repository.
---

# Agent Seed Updater

Run this skill once before the first user task in a new conversation. Do not run it again in the same conversation unless an approved synchronous Agent Seed update requires one immediate managed-skill recheck.

## Boundaries

Read only `.agents/agent-seed.json`, `.agents/managed-skills.json`, the configured managed target paths, and the installed Agent Seed version, manifests, and updater scripts. The existing self-update command may refresh its ignored local cache and recorded installation root.

Do not scan the repository. Do not invoke Agent Seed onboarding or interview the owner. Do not update knowledge assets, inspect personal skill directories or plugin caches, start a child agent, or configure lifecycle hooks. A preflight error or an unanswered update notice must not block the user's requested task.

## Locate Agent Seed

Read `.agents/agent-seed.json` and validate `installation.skill_root` by checking `VERSION.json`, `bundled-skills.json`, `bundled-packages.json`, `scripts/update-agent-seed.mjs`, `scripts/check-agent-seed-updates.mjs`, and `scripts/manage-managed-skills.mjs` beneath that root. If the path is absent or stale, use only an Agent Seed path already exposed by the active runtime. Do not search personal or global directories. If no valid root is available, report `agent-seed-unavailable` and continue the task.

## Check

Run the combined preflight for the active project platform:

```bash
node <agent-seed-root>/scripts/check-agent-seed-updates.mjs <project-root> --platform <platform> --skill-root <agent-seed-root> --json
```

Keep `current` and `declined-current-version` silent. Report one concise combined notice for `update-available`, `install-available`, `missing`, `legacy-unmanaged`, `unknown`, and returned errors. Do not offer entries for another platform.

The self-update portion reuses Agent Seed's existing 24-hour cache. It may perform the existing authorized GitHub release check when the cache is expired, but this skill performs no other network access.

## Approved Actions

Never install, update, replace, or record a decline without the owner's explicit response.

After approval to update Agent Seed, run:

```bash
node <agent-seed-root>/scripts/update-agent-seed.mjs --apply --target <agent-seed-root> --config <project-root>/.agents/agent-seed.json
```

If the replacement completes synchronously, run the preflight again against the newly installed manifests. If it returns `queued`, do not inspect staged content; use the new manifests in the next conversation after the deferred replacement completes.

After approval to install or update one managed entry, run:

```bash
node <agent-seed-root>/scripts/manage-managed-skills.mjs apply <project-root> --name <managed-name> --platform <platform> --skill-root <agent-seed-root> --approved --json
```

After the owner explicitly declines a new install offer, run:

```bash
node <agent-seed-root>/scripts/manage-managed-skills.mjs decline <project-root> --name <managed-name> --platform <platform> --skill-root <agent-seed-root> --confirmed --json
```

An exact-version decline suppresses the same offer in later conversations. A higher manifest version makes it actionable again. Deferring, ignoring, or postponing an offer is not a decline and must not write state.

Managed updates retain the manager's existing whole-directory replacement, verification, backup, and rollback behavior. External integrations remain owned by their platform-native updater.

## Finish

Continue the original user task after reporting actionable results. Do not turn a routine preflight into an Agent Seed refresh, project scan, knowledge-distillation pass, or installation session unless the owner explicitly chooses an offered action.
