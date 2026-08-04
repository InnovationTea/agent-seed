# Agent Seed Shared Config And Local State Split Design

**Date:** 2026-08-04

## Problem

`.agents/agent-seed.json` currently combines project policy with machine-local
state. The file is ignored by Git because it may contain proxy configuration,
an installed user-scope path, update-check cache data, and personal install
history. Ignoring the whole file also prevents the repository from sharing the
team's Agent Seed compatibility baseline and knowledge-asset write policy.

The installed Agent Seed package's `VERSION.json` remains the source of truth
for the version installed on one machine. A project's shared configuration must
separately state the minimum Agent Seed version that the team supports.

`.agents/managed-skills.json` has a different scope: it is the shared desired
state for Agent Seed-managed project skills and packages. It does not identify
the installed Agent Seed package version.

## Goals

- Commit Agent Seed team policy and its minimum compatible Agent Seed version.
- Keep proxy settings, installation paths, update cache, and personal audit
  history out of Git.
- Never downgrade a newer installed Agent Seed to the project's baseline.
- Let an owner explicitly raise the shared baseline after using a newer Agent
  Seed, producing a normal repository change for review and commit.
- Migrate existing ignored unified files without losing fields or exposing
  machine-local data.
- Make the new Agent Seed release read legacy configuration. Older Agent Seed
  releases are not required to understand the split format.

## Non-Goals

- Automatically committing a baseline update.
- Automatically changing the shared baseline during startup.
- Downgrading Agent Seed.
- Treating update-check cache fields as a team-approved version baseline.
- Using install history as desired managed-skill state.

## File Ownership

### Shared Agent Seed Config

`.agents/agent-seed.json` is committed and contains only team-owned policy:

```json
{
  "schema_version": 2,
  "minimum_agent_seed_version": "v0.3.8",
  "knowledge_asset_write_mode": "full-access",
  "self_update": {
    "check_on_start": true
  }
}
```

The version shown above is illustrative. During migration, the initial baseline
is the running split-capable package's `VERSION.json.version`. This prevents the
project from claiming compatibility with an older release that still writes
local state into the shared path.

Shared fields are:

- `schema_version`
- `minimum_agent_seed_version`
- `knowledge_asset_write_mode`
- `self_update.check_on_start`
- `self_update.check_interval_hours`, when explicitly configured
- `self_update.update_mode`, when explicitly configured

### Local Agent Seed State

`.agents/agent-seed.local.json` is ignored by Git and contains only
machine/operator-owned state:

```json
{
  "schema_version": 1,
  "installation": {
    "skill_root": "C:/Users/example/.codex/skills/agent-seed",
    "recorded_at": "2026-08-04T02:23:36.241Z"
  },
  "self_update": {
    "proxy": {
      "https_proxy": "http://proxy.example:8080"
    },
    "last_check": {
      "status": "updated",
      "reason": "applied",
      "current_version": "v0.3.7",
      "latest_version": "v0.3.7",
      "checked_at": "2026-08-04T02:23:36.241Z"
    }
  },
  "install_prompt_history": []
}
```

Local fields are:

- `installation`
- `self_update.proxy`
- `self_update.last_check`
- `install_prompt_history`
- `managed_skills.external_integrations` machine-local actual observations
- unclassified legacy fields preserved during migration

## Effective Configuration

Configuration is assembled by field ownership, not by an unrestricted object
merge. This prevents local state from overriding team policy and prevents
shared policy from being copied into the local state file.

Policy precedence is:

```text
explicit current user request -> shared Agent Seed config -> built-in default
```

Local state supplies only its owned fields. Local content must not override
`minimum_agent_seed_version`, `knowledge_asset_write_mode`, or shared
self-update policy.

All state writers read and write only `.agents/agent-seed.local.json`:

- proxy configuration writer
- installation-root writer
- network-denied writer
- update-check result writer
- install-prompt history writer

Policy and migration writers are the only code allowed to write
`.agents/agent-seed.json`.

## Version Semantics

`minimum_agent_seed_version` is a compatibility baseline, not an exact pin.

| Installed version | Shared baseline | Result |
| --- | --- | --- |
| Lower | Any valid baseline | Report incompatible and offer an approved update |
| Equal | Same version | Continue normally |
| Higher | Older baseline | Continue without downgrade and offer a baseline refresh |
| Unknown or invalid | Any value | Report version state as unknown and do not edit shared config |

An approved Agent Seed update and an approved baseline refresh are separate
actions. A remote release newer than the shared baseline may be reported, but
startup checks never change the baseline. When the owner approves a refresh,
only `minimum_agent_seed_version` changes. The owner reviews and commits that
repository change through the normal Git workflow.

If an installed version is below the baseline, the updater may install the
baseline or a newer release with owner approval. If the installed result is
newer than the baseline, it follows the higher-version flow and offers a
separate baseline refresh.

An available release below the shared minimum may be reported but must not be
applied. Missing or invalid installed/baseline evidence is `unknown`, never
`current`.

## Managed Skills Relationship

`.agents/managed-skills.json` is committed and describes the team's desired
managed project skills, packages, and selected external integrations, including
their expected versions and target platforms. Managed target directories use
`.agent-seed-managed.json` as installed-version evidence. External integration
availability and actual versions remain in `.agents/agent-seed.local.json`.
An installed Agent Seed that cannot supply a shared entry or desired version
reports `baseline-unavailable`. Apply operations never install below either the
shared desired version or a verified newer target marker. Installing or
recording a higher version advances the shared desired value, which the owner
reviews and commits; lower observed versions never reduce it.
`baseline-unavailable` takes precedence over `missing` when the installed Agent
Seed cannot supply the shared version at all. Unknown managed-state fields and
future schemas are rejected without rewriting the shared file.

The files do not overlap:

- `agent-seed.json` controls the Agent Seed runtime baseline and team policy.
- `managed-skills.json` controls managed child skill/package and external
  integration desired versions.
- `agent-seed.local.json` records machine state and operator history.

`install_prompt_history` is local audit evidence only. It must not override or
replace desired entries in `managed-skills.json`. Personal declines and
machine-specific installation observations must not be committed as team
desired state.

## Legacy Migration

The split-capable Agent Seed detects a legacy unified file when
`.agents/agent-seed.json` has no `schema_version: 2` split schema or contains
known local-only fields.

Migration proceeds as follows:

1. Read and completely validate the legacy JSON before writing anything.
2. Read the running packaged Agent Seed version from `VERSION.json`.
3. Build shared config from known team-policy fields.
4. Set `minimum_agent_seed_version` to the higher of a valid explicit baseline
   and the running split-capable Agent Seed version. This preserves a newer
   approved baseline without allowing an older non-split release.
5. Build local state from installation data, proxy configuration, check cache,
   and install history.
6. Preserve unknown legacy fields under `legacy_unclassified` in the local
   file and report them for manual classification.
7. If a local file already exists, keep its local-owned scalar/object values,
   fill only missing values from the legacy file, and merge history entries
   while removing exact duplicates.
8. Atomically write and validate the local file first.
9. Atomically replace the unified file with the shared-only config.
10. Update `.gitignore` so the shared Agent Seed and managed-skills files are
    trackable while `.agents/agent-seed.local.json` remains ignored.
11. Verify the final Git ignore state and report the shared files that the
    owner must review and commit.

`self_update.last_check.latest_version` is never used as the initial baseline.
It records a network observation, not team approval.

The migration is idempotent. A retry must not duplicate history or discard a
newer local value. A failure before the shared rewrite leaves the original
legacy file intact. A failure after the shared rewrite leaves the complete
local file present and reports the remaining `.gitignore` repair.

## Git Ignore Migration

For the current exact rules, migration removes these entries:

```gitignore
.agents/agent-seed.json
.agents/managed-skills.json
```

It adds this entry:

```gitignore
.agents/agent-seed.local.json
```

Migration must also handle broader ignore patterns. It uses Git's ignore check
as the final authority and adds the necessary negations when a parent or JSON
glob remains ignored. The required postcondition is:

- `.agents/agent-seed.json` is not ignored.
- `.agents/managed-skills.json` is not ignored.
- `.agents/agent-seed.local.json` is ignored.

These rules apply to the target project passed to installed Agent Seed, not to
the Agent Seed source repository's own `.gitignore`. The migrator preserves
unrelated target-project content and does not stage or commit files.

## Failure Handling And Safety

- Invalid legacy JSON causes a clear error and no file changes.
- Invalid or missing installed version metadata prevents baseline creation and
  leaves the legacy file unchanged.
- Proxy values, absolute installation paths, and audit history are checked
  before the shared write and must never appear in shared output.
- Shared writes use a sibling temporary file and atomic rename.
- Local writes use a sibling temporary file and atomic rename.
- A startup check never edits the shared baseline without owner approval.
- Update application still requires the existing separate approval boundary.

## Required Tests

### Configuration And Migration

- Split a representative legacy file containing write mode, startup policy,
  update cache, proxy, installation path, and install history.
- Preserve every legacy value in the correct destination.
- Prove that local-only values never appear in shared output.
- Preserve and report unknown legacy fields in local state.
- Merge into an existing local file without replacing newer local state.
- Retry migration without duplicating history.
- Leave all files unchanged for malformed legacy JSON or invalid version
  metadata.
- Recover correctly from failures at each atomic-write boundary.

### Version Behavior

- Installed version lower than, equal to, and higher than the shared baseline.
- Invalid and missing versions report unknown without shared writes.
- A higher installed version never triggers downgrade.
- Startup detection does not refresh the baseline automatically.
- Approved baseline refresh changes only the version field.

### Git Ignore Behavior

- Migrate the repository's current exact ignore entries.
- Handle `.agents/*.json` and `.agents/` ignore patterns with correct
  negations.
- Preserve unrelated ignore rules and comments.
- Verify both shared files are trackable and the local file remains ignored.

### Regression Coverage

- Self-update caching still uses local `last_check`.
- Proxy commands update only local state.
- Installation-root recording updates only local state.
- Activation honors shared `self_update.check_on_start`.
- Knowledge workflows honor shared `knowledge_asset_write_mode`.
- Managed-skill inspection continues to use shared desired versions and target
  filesystem version metadata.
- External integration inspection compares shared desired entries with local
  actual observations and never treats a missing observation as installed.

## Documentation Changes

Update `README.md`, `skill/SKILL.md`, the updater skill, and Agent Seed
references so they consistently describe:

- the shared/local ownership split;
- minimum-version behavior;
- the no-downgrade rule;
- owner-approved baseline refresh;
- migration and Git policy;
- `managed-skills.json` as shared desired state.
