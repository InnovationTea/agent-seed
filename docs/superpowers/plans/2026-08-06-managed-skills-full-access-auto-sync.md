# Managed Skills Full-Access Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `full-access` automatically install, update, and repair Agent Seed-owned bundled skills and packages during the project updater preflight while preserving explicit declines, rollback, approval-gated modes, and external-plugin ownership.

**Architecture:** Keep `check-agent-seed-updates.mjs` read-only. Extend `manage-managed-skills.mjs` with a sequential, failure-tolerant `apply --all --approved` path that re-inspects before applying and rechecks afterward. Move the common existing-target policy from repeated entry-level `safety` objects to a root `managed_target_policy`; update the bundled updater instructions to invoke the batch path only after resolving `full-access`.

**Tech Stack:** Node.js ESM, `node:test`, JSON manifests, Markdown skill instructions, Git release tests.

---

### Task 1: Lock The Root Managed-Target Policy In Manifest Tests

**Files:**
- Modify: `tools/release.test.mjs:368-398` (bundled manifest policy assertions)
- Modify: `tools/managed-skill-updates.test.mjs:755-785` (synthetic manifest helpers)

- [ ] **Step 1: Write the failing manifest assertions**

Update the bundled-manifest test to require this exact root policy on both
`skill/bundled-skills.json` and `skill/bundled-packages.json`:

```js
assert.deepEqual(config.activation_policy.managed_target_policy, {
  full_access: "replace-and-verify",
  approval_gated: "ask-before-write",
  personal_or_global_target_requires_explicit_request: true,
});
```

Within the same test, assert that every bundled direct-skill and package entry
has no `safety` property. Update the synthetic `writeManifest` and
`writePackageManifest` helpers to provide the same root policy so manager tests
exercise the new schema.

- [ ] **Step 2: Run the focused release test and verify it fails**

Run:

```powershell
node --test tools/release.test.mjs --test-name-pattern="bundled install manifests require activation preflight handling"
```

Expected: FAIL because the root `managed_target_policy` is absent and the
entry-level `safety` blocks are still present.

- [ ] **Step 3: Implement the manifest simplification**

In `skill/bundled-skills.json` and `skill/bundled-packages.json`:

1. Add `activation_policy.managed_target_policy` with the exact three fields
   asserted above.
2. Remove each bundled direct-skill/package `safety` object.
3. Keep `default_install.writes`, platform target paths, package write roots,
   and existing mode-aware `default_install.requires_user_approval_in_modes`.

- [ ] **Step 4: Run the focused release test and verify it passes**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit the manifest schema change**

```powershell
git add skill/bundled-skills.json skill/bundled-packages.json tools/release.test.mjs tools/managed-skill-updates.test.mjs
git commit -m "refactor: simplify bundled target safety policy"
```

### Task 2: Add A Readable Batch Selection API

**Files:**
- Modify: `skill/scripts/manage-managed-skills.mjs:128-307` (batch operation)
- Modify: `tools/managed-skill-updates.test.mjs:1-735` (manager behavior tests)

- [ ] **Step 1: Write the failing batch-selection tests**

Add a test that creates a target with one entry in each actionable state:

- `update-available`: valid marker below manifest version;
- `install-available`: default offer with no target or record;
- `missing`: shared record with no target;
- `unverified`: target exists with an invalid marker;
- `legacy-unmanaged`: target exists without a shared record.

Call the new exported operation with `approved: true` and a controlled apply
function. Assert that all five names are selected in manifest order, while
`current`, `declined-current-version`, and `baseline-unavailable` are excluded.
Add a second test that records an exact-version decline and asserts the same
entry is excluded from the batch selection.

Use the existing `writeManifest`, `writeManagedMarker`, `record`, and temporary
directory helpers; do not mock filesystem state.

- [ ] **Step 2: Run the focused manager tests and verify they fail**

Run:

```powershell
node --test tools/managed-skill-updates.test.mjs --test-name-pattern="batch|all five|declined"
```

Expected: FAIL because `applyManagedUpdates` is not exported.

- [ ] **Step 3: Implement `applyManagedUpdates`**

Export a function with this shape:

```js
export async function applyManagedUpdates({
  skillRoot,
  targetDir,
  platform,
  approved,
  applyEntry = applyManagedUpdate,
  installPackage,
})
```

Implementation requirements:

1. Reject any value other than literal `approved: true` with the existing
   owner-approval error.
2. Run `inspectManagedUpdates({ skillRoot, targetDir, platform })` immediately
   before selecting entries.
3. Select only the five actionable states listed in the design, preserving the
   `managed` manifest order. Do not select `current`,
   `declined-current-version`, or `baseline-unavailable`.
4. Sequentially call `applyEntry({ skillRoot, targetDir, name, platform,
   approved: true, installPackage })` for each selected entry.
5. Catch an entry failure, append `{ name, kind, state, result: "failed",
   error: error.message }`, and continue to the next entry. Existing
   `applyManagedUpdate` rollback behavior remains responsible for that entry's
   filesystem restoration.
6. Record successful direct/package results as `installed` or `updated`, retain
   returned `post_install` metadata, and append non-selected report states as
   `skipped` results so the caller can explain every inspected entry.
7. Return `{ results, summary }`, where `summary` contains selected, succeeded,
   failed, and skipped counts.

`readManagedEntries` must read and validate the root
`activation_policy.managed_target_policy` from both manifests and carry the
normalized policy into each entry. A missing policy uses the conservative
`approval_gated` behavior and prevents an automatic batch from treating an
existing target as implicitly authorized.

- [ ] **Step 4: Add direct/package and continue-after-failure tests**

Add tests that:

- apply a direct skill and a package in one batch and verify both target
  metadata files and `.agents/managed-skills.json` are updated;
- make the first selected source invalid, verify its result is `failed`, and
  verify a later selected direct skill still installs;
- make a package installer fail through the existing `installPackage` hook and
  verify the package write roots are restored while later entries continue;
- verify a successful `agent-seed-updater` result preserves its `post_install`
  action in the batch result.

- [ ] **Step 5: Run the manager tests and verify they pass**

Run:

```powershell
node --test tools/managed-skill-updates.test.mjs
```

Expected: PASS with all existing and new manager tests passing.

- [ ] **Step 6: Commit the batch manager implementation**

```powershell
git add skill/scripts/manage-managed-skills.mjs tools/managed-skill-updates.test.mjs
git commit -m "feat: add managed skill batch updates"
```

### Task 3: Extend The Manager CLI With `--all`

**Files:**
- Modify: `skill/scripts/manage-managed-skills.mjs:574-617` (argument parser and dispatcher)
- Modify: `tools/managed-skill-updates.test.mjs:428-461` (CLI tests)

- [ ] **Step 1: Write failing CLI contract tests**

Add subprocess tests asserting:

1. `apply <target> --all --platform codex --skill-root <root> --json` exits
   nonzero and reports `--approved` is required.
2. `apply <target> --all --name gitpush --platform codex --approved --json`
   exits nonzero because `--all` and `--name` are mutually exclusive.
3. A valid `--all --approved --json` invocation returns the batch JSON summary
   and updates all selected fixture entries.

- [ ] **Step 2: Run the CLI tests and verify they fail**

Run:

```powershell
node --test tools/managed-skill-updates.test.mjs --test-name-pattern="CLI|all"
```

Expected: FAIL because `parseArgs` rejects `--all` and `runCli` only dispatches
the single-entry operation.

- [ ] **Step 3: Implement CLI parsing and dispatch**

Extend `parseArgs` with `all: false`. Accept `--all`, reject it together with
`--name`, require `--approved` for `apply`, and require exactly one of `--all`
or `--name` for `apply`. Update the usage string to show both forms. Dispatch
`apply --all` to `applyManagedUpdates(options)` and preserve existing output
for single-entry apply, check, and decline.

- [ ] **Step 4: Run the CLI tests and verify they pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit the CLI change**

```powershell
git add skill/scripts/manage-managed-skills.mjs tools/managed-skill-updates.test.mjs
git commit -m "feat: expose managed skill batch apply CLI"
```

### Task 4: Integrate Full-Access Updater Behavior

**Files:**
- Modify: `skill/bundled-skills/agent-seed-updater/skill/SKILL.md:36-95`
- Modify: `skill/SKILL.md:177-195, 300-306` (mode-aware managed update rules)
- Modify: `tools/agent-seed-updater.test.mjs:138-203` (instruction/preflight assertions)
- Modify: `tools/release.test.mjs:477-514` (updater skill content assertions)

- [ ] **Step 1: Write failing instruction assertions**

Add assertions that the updater skill:

- resolves the effective mode before applying managed entries;
- invokes `manage-managed-skills.mjs apply ... --all --approved --json` in
  `full-access`;
- keeps the existing one-entry approval path for approval-gated modes;
- applies returned `post_install` actions and reruns the preflight;
- reports failed entries without stopping later entries.

Add core-skill assertions that full-access authorizes declared managed target
replacement while approval-gated modes require approval.

- [ ] **Step 2: Run instruction tests and verify they fail**

Run:

```powershell
node --test tools/agent-seed-updater.test.mjs tools/release.test.mjs --test-name-pattern="updater|managed|full-access"
```

Expected: FAIL because the current instructions only describe single-entry
approval and explicitly prohibit automatic managed writes.

- [ ] **Step 3: Update the updater instructions**

Change the updater flow to:

1. Resolve current request, shared `knowledge_asset_write_mode`, then default
   `full-access`.
2. Run the existing combined preflight.
3. In `full-access`, run the batch CLI when actionable managed entries exist;
   do not pass it entries reported as `declined-current-version` or
   `baseline-unavailable`.
4. Apply each returned declared `post_install` action in its documented scope.
5. Run the combined preflight again and report successes, remaining states, and
   failures before continuing the user task.
6. In approval-gated modes, retain per-entry prompts and the existing
   `--approved`/`--confirmed` commands.

Update core `skill/SKILL.md` so the managed-write rule is explicitly
mode-aware, and document that the existing target policy is root-level rather
than repeated on each entry.

- [ ] **Step 4: Run instruction tests and verify they pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit updater integration**

```powershell
git add skill/SKILL.md skill/bundled-skills/agent-seed-updater/skill/SKILL.md tools/agent-seed-updater.test.mjs tools/release.test.mjs
git commit -m "feat: auto-sync managed skills in full-access"
```

### Task 5: Update User-Facing Documentation And Release Coverage

**Files:**
- Modify: `README.md` (managed skill updates and full-access behavior)
- Modify: `README.zh-CN.md` (Chinese documentation)
- Modify: `skill/references/output-assets.md` (generated updater guidance)
- Modify: `tools/release.test.mjs` (documentation and packaged-file assertions)

- [ ] **Step 1: Write failing documentation assertions**

Extend release tests to require documentation of:

- full-access automatic managed synchronization;
- per-entry rollback and continue-after-failure behavior;
- exact-version decline preservation;
- approval-gated per-entry prompts;
- external plugin ownership remaining platform-native.

- [ ] **Step 2: Run the focused documentation tests and verify they fail**

Run:

```powershell
node --test tools/release.test.mjs --test-name-pattern="README|managed|full-access"
```

Expected: FAIL because the current documentation describes read-only preflight
and explicit approval for every managed action.

- [ ] **Step 3: Update the documentation**

Describe the new mode-aware behavior using the same state names and command
forms as the updater skill. Do not claim that external integrations are copied
or that Agent Seed itself is silently upgraded.

- [ ] **Step 4: Run focused documentation and release tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit documentation changes**

```powershell
git add README.md README.zh-CN.md skill/references/output-assets.md tools/release.test.mjs
git commit -m "docs: document full-access managed skill synchronization"
```

### Task 6: Full Verification And Release Artifact Check

**Files:**
- Verify: all modified files from Tasks 1-5
- Create temporary generated output only through the existing release test/tool

- [ ] **Step 1: Run the complete test suite**

```powershell
node --test tools/*.test.mjs
```

Expected: zero failures and all existing plus new tests passing.

- [ ] **Step 2: Run static diff checks**

```powershell
git diff --check
git status --short --branch
```

Expected: no whitespace errors and only intended manifest, script, test,
instruction, documentation, spec, and plan changes.

- [ ] **Step 3: Build and inspect a disposable release artifact**

Run the repository's existing release command with a temporary version, then
verify the generated package contains:

- the batch-capable `scripts/manage-managed-skills.mjs`;
- both simplified root policies;
- the updated updater and core instructions;
- no entry-level `safety` blocks.

- [ ] **Step 4: Run the packaged preflight smoke check**

Use the generated skill root against a temporary project fixture containing
all five actionable states. Verify the JSON summary contains per-entry results,
the final read-only check reports remaining failures only, and an exact
declined offer remains suppressed.

- [ ] **Step 5: Record the final implementation state**

```powershell
git status --short --branch
git log --oneline --decorate -6
```

Expected: all implementation tasks are represented by focused commits, the
worktree is clean, and the branch is ready for review or PR creation.
