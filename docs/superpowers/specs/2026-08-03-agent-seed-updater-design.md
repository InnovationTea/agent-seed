# Agent Seed Updater Design

## Goal

Add a lightweight, project-local `agent-seed-updater` skill that runs once at
the start of each agent conversation. It preserves Agent Seed's existing
self-update behavior, detects updates and newly offered Agent Seed-managed
skills without invoking Agent Seed onboarding, and keeps routine startup work
separate from repository scanning and knowledge distillation.

The startup check is read-only except when the owner explicitly approves an
Agent Seed update, a managed skill installation or update, or records a
version-specific decline of a new skill offer.

## Responsibility Boundaries

`agent-seed` remains responsible for initial repository scanning, owner
interviews, knowledge distillation, onboarding asset generation, and initial
installation of project-local skills. Its existing `update-agent-seed.mjs`
implementation remains the only implementation of Agent Seed remote version
checks, downloads, replacement, rollback, proxy handling, caching, and Windows
deferred replacement.

`agent-seed-updater` owns the lightweight start-of-conversation preflight. It
orchestrates existing Agent Seed scripts and presents one concise combined
status. It does not implement version comparison, download, replacement, or
rollback itself. It does not scan the repository, interview the owner, invoke
Agent Seed onboarding, modify knowledge assets, or install lifecycle hooks.

`knowledge-updater` remains the end-of-task workflow for maintaining durable
knowledge in `AGENTS.md` and `agents.d/`. It has no startup-update duties.

## Distribution And Visibility

Add `agent-seed-updater` to `skill/bundled-skills.json` as a project-local,
multi-platform direct skill for Codex, Claude Code, codeagent-cli, and
OpenCode. It uses the same source-plus-platform-overlay packaging convention
as the other direct bundled skills and is itself tracked as managed content.

During new onboarding, Agent Seed offers installation of the updater for every
detected, requested, or owner-confirmed platform. Installation and project
instruction changes require owner approval.

After installation, Agent Seed writes one portable rule to `AGENTS.md`: invoke
the installed `agent-seed-updater` once before the first user task in each new
conversation, report actionable update state without blocking the task, and
do not invoke it again in the same conversation. Codex and OpenCode read the
rule directly. Claude Code and codeagent-cli use the existing root
`CLAUDE.md` import of `@AGENTS.md`. No host lifecycle or session hook is added.

## Sources Of Truth

The installed Agent Seed package remains the source of truth:

- `VERSION.json` identifies the installed Agent Seed release.
- `bundled-skills.json` defines direct bundled skill versions, targets,
  platform overlays, verification, and default offers.
- `bundled-packages.json` defines managed package versions, platform skills,
  installers, write roots, and verification.
- `.agents/agent-seed.json` stores machine-local Agent Seed configuration,
  self-update cache, and the installed Agent Seed root.
- `.agents/managed-skills.json` stores project-local managed installations,
  external integrations, and version-specific declined install offers.

The updater never treats a remote release manifest as installed bundled
content. Until an Agent Seed update is successfully applied, bundled checks
use the currently installed manifests.

## Agent Seed Root Resolution

Agent Seed records its installed root in the target project's ignored
`.agents/agent-seed.json` whenever it activates or installs the updater:

```json
{
  "installation": {
    "skill_root": "C:/Users/example/.codex/skills/agent-seed",
    "recorded_at": "2026-08-03T10:00:00.000Z"
  }
}
```

The path is machine-local state and must not be committed. The updater first
validates this root by checking the required version metadata, manifests, and
scripts. If it is absent or stale, the updater may use an Agent Seed path
already exposed by the active agent runtime. It must not scan personal skill
directories, plugin caches, or parent directories to discover Agent Seed. If
no valid root is available, it reports `agent-seed-unavailable` and continues
the requested task.

## Managed State Schema

Upgrade `.agents/managed-skills.json` to schema version 2:

```json
{
  "schema_version": 2,
  "managed_skills": [],
  "external_integrations": [],
  "declined_install_offers": [
    {
      "name": "ticket-lookup",
      "kind": "direct-skill",
      "platform": "codex",
      "offered_version": "v1.4.0",
      "declined_at": "2026-08-03T10:00:00.000Z"
    }
  ]
}
```

Schema version 1 remains readable. A read-only preflight normalizes v1 in
memory and does not rewrite the file. The first approved managed write or
explicit declined-offer write atomically persists schema v2.

A decline applies only to the exact managed name, kind, platform, and offered
version. The same version is suppressed on later conversations. A higher
manifest version makes the offer actionable again. An approved installation
removes the matching decline record and writes the normal managed install
record. Deferring an offer or not responding does not create a decline record.

## Managed Check States

The manager reports these states for each applicable manifest entry:

- `current`: the recorded installation exists and its version is equal to or
  newer than the installed manifest version.
- `update-available`: the recorded installation exists and its version is
  older than the installed manifest version.
- `missing`: an installation record exists but its configured target does not.
- `legacy-unmanaged`: the configured target exists without a usable managed
  record.
- `install-available`: a default-offer manifest entry has no record, no target,
  and no matching current-version decline.
- `declined-current-version`: a default-offer entry has no record or target and
  has a matching version-specific decline. This state remains available in
  JSON diagnostics but is not presented as an actionable prompt.

Entries that are not default install offers and have neither a record nor a
target remain omitted. Installed entries removed from a later Agent Seed
manifest are not automatically deleted; managed uninstall and orphan cleanup
are outside this design.

The existing approved `apply` path handles both `install-available` and
`update-available`: it stages content, verifies it, replaces or creates the
target, records the manifest version, and rolls back on failure. Add a manager
command for recording an explicit version-specific decline so the skill never
edits managed state ad hoc.

## Conversation Startup Flow

Before the first user task, the installed updater performs these steps once:

1. Resolve and validate the installed Agent Seed root.
2. Run the existing `update-agent-seed.mjs --json` command. Its existing
   `check_interval_hours` cache determines whether a network request is needed.
3. Report an available Agent Seed update, but never apply it automatically.
4. Run `manage-managed-skills.mjs check` for the active project and platform
   using the currently installed manifests.
5. Present one concise combined notification containing only actionable Agent
   Seed, update, missing, legacy, and new-install states.
6. Continue the user's requested task even when the preflight reports an error
   or the owner does not act on a notification.

When there are no actionable results, the updater remains quiet. An owner may
approve one or more actions in a follow-up. Each install or update remains a
separate explicit approval boundary.

If an Agent Seed update is approved and completes synchronously, the updater
runs the managed check again against the newly installed manifests. If Windows
returns `queued` because the skill directory is locked, it does not inspect
the staged package; the next conversation checks the new manifests after the
deferred replacement completes.

Updating `agent-seed-updater` itself replaces its managed project directory,
but the current conversation may continue using already loaded instructions.
The next conversation uses the updated skill.

## Existing Project Migration

Existing projects may contain the old `AGENTS.md` instruction that directly
runs `manage-managed-skills.mjs`. After Agent Seed is updated to a release that
contains this design, the enhanced manager reports `agent-seed-updater` as
`install-available` through that existing preflight.

After owner approval, Agent Seed installs the updater and replaces only the
obsolete direct-manager preflight rule with the new updater invocation rule.
It preserves unrelated project instructions. The migration does not invoke
Agent Seed onboarding, scan the repository, repeat owner interviews, or run
knowledge distillation.

## Error Handling

- A failed Agent Seed remote check is reported as unknown. The local managed
  check still runs when a valid Agent Seed root is available.
- Missing or invalid manifests prevent managed actions. The updater reports the
  exact invalid file and does not modify project content or state.
- Invalid managed state prevents managed actions. It is never silently reset.
- A v1 state file is read compatibly and migrated only on an authorized write.
- Existing managed replacement, staging, verification, backup, and rollback
  semantics remain unchanged.
- Startup does not calculate content hashes. Approving an update continues to
  mean whole-directory replacement of the managed target.
- All preflight errors are non-blocking for the user's main task.

## Verification

Node tests cover:

- a new default-offer manifest entry producing `install-available`;
- an exact-version decline producing `declined-current-version` without a user
  prompt;
- a higher manifest version making a declined offer actionable again;
- an approved install clearing its decline and recording the managed version;
- schema v1 read-only checks leaving the file unchanged;
- the first approved write atomically migrating state from v1 to v2;
- self-update failure still allowing a local managed check;
- synchronous Agent Seed update followed by a managed recheck;
- Windows `queued` state deferring the new-manifest check;
- installation and self-update failures preserving prior files and state;
- new-project instruction generation and old-project preflight migration;
- Codex, Claude Code, codeagent-cli, and OpenCode updater artifacts and
  instruction visibility in release outputs.

Existing self-update tests remain authoritative for cache behavior, proxy
resolution, approval boundaries, release verification, replacement, rollback,
and Windows deferred update behavior. The updater must reuse those paths
rather than duplicate them.

## Non-Goals

- Automatically applying Agent Seed, skill, package, or external plugin
  updates.
- Re-running Agent Seed onboarding or knowledge distillation at conversation
  startup.
- Scanning the repository or personal/global agent directories during startup.
- Installing lifecycle hooks.
- Hashing managed directories or merging local changes into a managed update.
- Automatically uninstalling entries removed from Agent Seed manifests.
- Replacing platform-native ownership of external plugins.
