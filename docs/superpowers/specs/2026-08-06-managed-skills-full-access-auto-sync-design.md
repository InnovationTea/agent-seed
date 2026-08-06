# Managed Skills Full-Access Auto-Sync Design

> Status: Proposed
> Date: 2026-08-06

## Goal

When the effective project mode is `full-access`, automatically synchronize
Agent Seed-managed bundled skills and packages during the existing project-local
updater preflight. Preserve explicit declines, per-entry rollback, approval-gated
modes, and the ownership boundary for external plugins.

## Context

Agent Seed has two separate version domains:

- `VERSION.json` and the installed skill root identify the Agent Seed package.
- `.agents/managed-skills.json` plus each target's
  `.agent-seed-managed.json` identify project-local managed skills and packages.

`check-agent-seed-updates.mjs` is currently read-only. It reports
`update-available`, `install-available`, `missing`, `unverified`, and
`legacy-unmanaged`, while `manage-managed-skills.mjs apply` handles one entry at
a time after explicit approval. This design adds a deterministic batch path for
the mode that authorizes declared project-local writes.

## Decisions

### Mode and trigger

The existing effective-mode precedence remains current request, shared project
configuration, then `full-access`. The `agent-seed-updater` skill resolves that
mode before choosing an action.

In `full-access`, after the local managed preflight, the updater applies every
applicable actionable bundled entry. The Agent Seed remote release check keeps
its existing 24-hour cache and existing self-update authorization; this design
does not make Agent Seed's own `--apply` silent or automatic.

In `ask-each-change` and `agent-approve`, preflight remains read-only and the
updater continues to request approval for each write action.

### Entries included in automatic repair

Full-access batch repair includes:

- `update-available`: replace an existing managed target with the newer manifest
  content;
- `install-available`: install a new default-offer entry unless the exact
  manifest version was explicitly declined;
- `missing`: recreate a target whose shared managed record remains present;
- `unverified`: replace a target whose managed marker is missing or invalid;
- `legacy-unmanaged`: replace an existing untracked target and start managing it.

It skips `current`, `declined-current-version`, and `baseline-unavailable`.
`baseline-unavailable` requires a newer installed Agent Seed manifest or a
shared baseline decision and must never be repaired by guessing.

An explicit decline is keyed by entry name, kind, platform, and offered version.
Full-access does not override a decline for that exact installation offer; a
higher manifest version becomes actionable again. There is no new persistent
decline state for an existing managed update.

### Ownership boundary

Bundled direct skills and bundled packages are owned by Agent Seed and may be
replaced through the batch manager. External integrations remain owned by their
platform-native updater; Agent Seed only reports their state and never copies,
deletes, or overwrites an external plugin directory.

## Manifest Policy Simplification

The repeated per-entry `safety` objects are removed from
`bundled-skills.json` and `bundled-packages.json`. All current bundled entries
share the same project-local replacement policy, so the policy moves to the
manifest root:

```json
"managed_target_policy": {
  "full_access": "replace-and-verify",
  "approval_gated": "ask-before-write",
  "personal_or_global_target_requires_explicit_request": true
}
```

`default_install.writes`, platform target paths, and package-specific declared
write roots remain per-entry because they describe concrete file scope. The
existing mode-aware `default_install.requires_user_approval_in_modes` metadata
also remains, since it describes default-offer handling rather than replacement
of an already-present target.

The manager normalizes the root policy along with each manifest entry. The
policy is enforced as follows:

- `full-access` authorizes replacement and verification within declared
  project-local targets;
- approval-gated modes require the existing explicit approval boundary;
- personal/global targets still require an explicit owner request even when
  project-local writes are autonomous.

No per-entry override is added until a bundled entry has a demonstrably
different safety requirement.

## Batch Manager API and CLI

Add an exported `applyManagedUpdates` operation in
`skill/scripts/manage-managed-skills.mjs`. It accepts the same `skillRoot`,
`targetDir`, and `platform` inputs as inspection and requires an explicit
`approved: true` authorization from its caller. It performs a fresh inspection
before selecting entries, so a stale preflight result cannot apply an entry that
has become current or declined.

The CLI gains an all-entry form:

```text
node scripts/manage-managed-skills.mjs apply <project-root> --all \
  --platform <platform> --skill-root <agent-seed-root> --approved --json
```

`--all` and `--name` are mutually exclusive. `--all` without `--approved` is a
usage error, just like the existing single-entry apply. The command applies
entries sequentially in manifest order and returns a JSON summary containing
the selected state, result (`installed`, `updated`, `failed`, or `skipped`),
error text when present, and any `post_install` action returned by the existing
single-entry operation.

Each entry keeps the current staged copy, verification, backup, rollback, and
no-downgrade behavior. A successful entry records its state immediately. A
failed entry restores its own prior content, records no desired-version
downgrade, and does not prevent later selected entries from being attempted.

After the batch completes, the updater runs one read-only inspection again and
reports remaining actionable states and failures together.

## Updater Integration

The bundled `agent-seed-updater` instructions gain a full-access branch:

1. Resolve the effective mode and run the existing combined preflight.
2. In `full-access`, invoke the batch CLI when the report contains selected
   actionable managed entries.
3. Apply returned `post_install` actions, including the updater startup-rule
   repair, within the declared project-instruction scope.
4. Re-run the combined preflight against the installed manifests.
5. Report successful entries, remaining entries, and failures, then continue the
   user's task unless an existing full-access onboarding failure policy requires
   blocking onboarding.

If the Agent Seed self-update returns `queued`, the updater does not inspect the
staged root or run the batch against it; the next conversation repeats the
process after the deferred replacement completes.

## Testing

Add regression coverage for:

- root manifest policy normalization after the per-entry safety fields are
  removed;
- selection of all five actionable managed states;
- preservation of `declined-current-version` and `baseline-unavailable`;
- mixed direct-skill and package batch updates;
- one entry failing while later entries still run;
- per-entry rollback and immediate shared-state recording;
- post-install actions in the batch result;
- CLI `--all`/`--name` exclusivity and approval requirements;
- full-access updater instructions and approval-gated behavior;
- release packaging of the new scripts, manifests, and instructions.

The existing full test suite remains the completion gate.

## Non-Goals

- Automatically updating Agent Seed itself without the existing self-update
  authorization;
- automatically updating external plugins or platform-native integrations;
- merging user modifications inside a managed target;
- repairing `baseline-unavailable` by lowering a shared baseline or guessing a
  missing manifest entry.
