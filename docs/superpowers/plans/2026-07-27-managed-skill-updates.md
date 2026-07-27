# Managed Skill Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect, record, and update Agent Seed-managed project skills at session start while external integrations remain under their native platform's ownership.

**Architecture:** A new ESM manager owns manifest normalization, project-local state, read-only inspection, transactional replacement, and a CLI. Direct skills copy from the installed package; package updates reuse the existing installer inside a backup of declared write roots. Generated `AGENTS.md` requests a non-blocking preflight before the first task.

**Tech Stack:** Node.js ESM, `node:test`, `node:fs/promises`, and the existing PowerShell extraction path.

---

### Task 1: Materialize direct-skill versions in a release

**Files:**
- Modify: `skill/bundled-skills.json`
- Modify: `tools/release.mjs`
- Modify: `tools/release.test.mjs`

- [ ] **Step 1: Write the failing artifact test**

```js
const manifest = JSON.parse(await readFile(path.join(result.expandedDir, "bundled-skills.json"), "utf8"));
assert.equal(manifest.bundled_skills[0].version, "v2.3.4");
```

- [ ] **Step 2: Run it and confirm failure**

Run: `node --test tools/release.test.mjs --test-name-pattern "materializes bundled skill versions"`

Expected: FAIL because the output manifest has no release-specific skill version.

- [ ] **Step 3: Implement only the manifest version expansion**

Use `"$AGENT_SEED_VERSION"` in each source direct-skill entry. Immediately after `writeVersionMetadata` in `releaseSkill`, call:

```js
async function materializeBundledSkillVersions({ manifestPath, version }) {
  const manifest = await readJsonIfExists(manifestPath);
  if (!manifest) return;
  for (const entry of manifest.bundled_skills || []) {
    if (entry.version === "$AGENT_SEED_VERSION") entry.version = version;
    if (typeof entry.version !== "string" || entry.version.trim() === "") throw new Error(`Invalid bundled skill version: ${entry.name}`);
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
```

- [ ] **Step 4: Verify and commit**

Run: `node --test tools/release.test.mjs --test-name-pattern "materializes bundled skill versions"`

Expected: PASS.

Commit: `git add skill/bundled-skills.json tools/release.mjs tools/release.test.mjs && git commit -m "feat: version bundled direct skills in releases"`

### Task 2: Add managed state and pure update inspection

**Files:**
- Create: `skill/scripts/manage-managed-skills.mjs`
- Create: `tools/managed-skill-updates.test.mjs`
- Modify: `.gitignore`
- Modify: `Makefile`

- [ ] **Step 1: Write failing state and status tests**

```js
const report = await manager.inspectManagedUpdates({ skillRoot, targetDir, platform: "codex" });
assert.equal(report.managed[0].state, "update-available");
assert.equal(report.managed[1].state, "current");
assert.equal((await manager.inspectManagedUpdates({ skillRoot, targetDir: legacyTarget, platform: "codex" })).managed[0].state, "legacy-unmanaged");
```

- [ ] **Step 2: Run it and confirm failure**

Run: `node --test tools/managed-skill-updates.test.mjs`

Expected: FAIL because the manager module does not exist.

- [ ] **Step 3: Implement local-state and version APIs**

```js
export async function readManagedState(targetDir) {}
export async function writeManagedState(targetDir, state) {}
export async function inspectManagedUpdates({ skillRoot, targetDir, platform }) {}
export function compareVersions(left, right) {}

const record = { name: "gitpush", kind: "direct-skill", version: "v1.0.0", platform: "codex", target_path: "skills/gitpush", source: "bundled-skills/gitpush/skill" };
```

Read an absent state file as `{ schema_version: 1, managed_skills: [], external_integrations: [] }`; write it through a sibling temporary file and rename. Compare only numeric `vMAJOR.MINOR.PATCH` segments. For a selected platform report `current`, `update-available`, `missing`, or `legacy-unmanaged` from records, manifest version, and target-path existence. Do not compute hashes or recursively scan skill content. Ignore `.agents/managed-skills.json` and add this test file to `make check`.

- [ ] **Step 4: Verify and commit**

Run: `node --test tools/managed-skill-updates.test.mjs; git diff --check`

Expected: PASS with no whitespace failures.

Commit: `git add skill/scripts/manage-managed-skills.mjs tools/managed-skill-updates.test.mjs .gitignore Makefile && git commit -m "feat: track managed skill versions"`

### Task 3: Apply approved direct and package updates with rollback

**Files:**
- Modify: `skill/scripts/manage-managed-skills.mjs`
- Modify: `skill/scripts/install-git-code-tracker.mjs`
- Modify: `tools/managed-skill-updates.test.mjs`

- [ ] **Step 1: Write failing apply and rollback tests**

```js
await manager.applyManagedUpdate({ skillRoot, targetDir, name: "gitpush", platform: "codex", approved: true });
assert.equal(await readFile(path.join(targetDir, "skills", "gitpush", "SKILL.md"), "utf8"), "new skill\n");
assert.equal((await manager.readManagedState(targetDir)).managed_skills[0].version, "v1.1.0");
await assert.rejects(manager.applyManagedUpdate({ skillRoot, targetDir, name: "gitpush", platform: "codex", approved: false }), /Owner approval is required/);
await assert.rejects(manager.applyManagedUpdate({ skillRoot, targetDir: failingTarget, name: "gitpush", platform: "codex", approved: true }), /verification failed/);
assert.equal(await readFile(path.join(failingTarget, "skills", "gitpush", "SKILL.md"), "utf8"), "old skill\n");
```

- [ ] **Step 2: Run it and confirm failure**

Run: `node --test tools/managed-skill-updates.test.mjs --test-name-pattern "apply|rollback|legacy"`

Expected: FAIL because `applyManagedUpdate` is not exported.

- [ ] **Step 3: Implement the update transaction**

```js
export async function applyManagedUpdate({ skillRoot, targetDir, name, platform, approved, installPackage }) {
  if (approved !== true) throw new Error("Owner approval is required to apply a managed update.");
  const resolved = await resolveManagedEntry({ skillRoot, targetDir, name, platform });
  const backup = await backupWriteRoots(targetDir, resolved.writeRoots);
  try { await resolved.apply({ installPackage }); await resolved.verify(); await recordManagedInstall(targetDir, resolved.record); }
  catch (error) { await restoreWriteRoots(targetDir, backup); throw error; }
  await removeBackup(backup);
}
```

For direct skills, stage `source_path`, apply its selected platform `overlay_path`, verify `SKILL.md exists at <target_path>`, then replace exactly that directory. An approved legacy target takes this same force-replace path and gains its first record.

For `git-code-tracker`, export `installPackageForManagedUpdate` from its installer as an adapter over `installGitCodeTracker`. Before calling it, derive non-overlapping ancestor write roots from `default_install.writes`, back them up, and restore them when install or verification fails. Persist package state only after success. Use injected `installPackage` in tests to prove package rollback without changing the archive.

- [ ] **Step 4: Verify and commit**

Run: `node --test tools/managed-skill-updates.test.mjs tools/git-code-tracker-release.test.mjs`

Expected: PASS for legacy takeover, declined update, direct rollback, package rollback, and recorded success.

Commit: `git add skill/scripts/manage-managed-skills.mjs skill/scripts/install-git-code-tracker.mjs tools/managed-skill-updates.test.mjs && git commit -m "feat: apply managed skill updates"`

### Task 4: Add session-preflight CLI commands

**Files:**
- Modify: `skill/scripts/manage-managed-skills.mjs`
- Modify: `tools/managed-skill-updates.test.mjs`

- [ ] **Step 1: Write failing CLI tests**

```js
const result = await execFileAsync(process.execPath, [script, "check", targetDir, "--platform", "codex", "--json"]);
assert.equal(JSON.parse(result.stdout).managed[0].state, "update-available");
await assert.rejects(execFileAsync(process.execPath, [script, "apply", targetDir, "--name", "gitpush", "--platform", "codex"]), /--approved/);
```

- [ ] **Step 2: Run it and confirm failure**

Run: `node --test tools/managed-skill-updates.test.mjs --test-name-pattern "CLI"`

Expected: FAIL because the module has no CLI parser.

- [ ] **Step 3: Implement the exact command contract**

```text
node scripts/manage-managed-skills.mjs check <target-project> --platform <platform> [--json]
node scripts/manage-managed-skills.mjs apply <target-project> --name <managed-name> --platform <platform> --approved [--json]
```

`check` calls only `inspectManagedUpdates`, so it cannot create `.agents/` or a state file. `apply` requires literal `--approved` and calls `applyManagedUpdate`. Unknown names, unsupported platforms, invalid arguments, and failed verification exit nonzero.

- [ ] **Step 4: Verify and commit**

Run: `node --test tools/managed-skill-updates.test.mjs`

Expected: PASS.

Commit: `git add skill/scripts/manage-managed-skills.mjs tools/managed-skill-updates.test.mjs && git commit -m "feat: add managed update check command"`

### Task 5: Record external ownership and native-update delegation

**Files:**
- Modify: `skill/scripts/manage-managed-skills.mjs`
- Modify: `skill/external-packages.json`
- Modify: `tools/managed-skill-updates.test.mjs`
- Modify: `tools/release.test.mjs`

- [ ] **Step 1: Write failing external-integration tests**

```js
const state = await manager.recordExternalIntegration({ targetDir, name: "opencli", platform: "codex", ownership: "agent-seed-assisted", version: "unknown" });
assert.deepEqual(state.external_integrations[0], { name: "opencli", platform: "codex", ownership: "agent-seed-assisted", version: "unknown" });
await assert.rejects(manager.applyExternalUpdate({ approved: false, nativeUpdate }), /Owner approval is required/);
assert.equal(await manager.applyExternalUpdate({ approved: true, nativeUpdate }), true);
```

- [ ] **Step 2: Run it and confirm failure**

Run: `node --test tools/managed-skill-updates.test.mjs --test-name-pattern "external"`

Expected: FAIL because external integration APIs are absent.

- [ ] **Step 3: Implement only native delegation**

Add this policy to every platform entry in `external-packages.json`:

```json
"update_policy": { "ownership": "platform-native", "version_check": "best-effort", "update_requires_user_approval": true }
```

Export `recordExternalIntegration` and `applyExternalUpdate`. The latter requires `approved === true` and calls an injected `nativeUpdate` function. It must not accept a target directory or perform a copy, removal, or directory replacement. Integrations without a platform-supported executable updater remain `version-unknown` and advisory through their manifest action text.

- [ ] **Step 4: Verify and commit**

Run: `node --test tools/managed-skill-updates.test.mjs tools/release.test.mjs`

Expected: PASS.

Commit: `git add skill/scripts/manage-managed-skills.mjs skill/external-packages.json tools/managed-skill-updates.test.mjs tools/release.test.mjs && git commit -m "feat: track external integration ownership"`

### Task 6: Generate the one-per-session update preflight guidance

**Files:**
- Modify: `skill/SKILL.md`
- Modify: `skill/references/output-assets.md`
- Modify: `README.md`
- Modify: `tools/release.test.mjs`

- [ ] **Step 1: Write failing instruction tests**

```js
assert.match(skill, /Before executing the first user task in a new agent session/i);
assert.match(skill, /manage-managed-skills\.mjs check/i);
assert.match(skill, /must not block the requested task/i);
assert.match(outputAssets, /AGENTS\.md.*session preflight/is);
```

- [ ] **Step 2: Run it and confirm failure**

Run: `node --test tools/release.test.mjs --test-name-pattern "managed update|session preflight"`

Expected: FAIL because the session-preflight guidance does not exist.

- [ ] **Step 3: Update the instruction contracts**

In `skill/SKILL.md`, require one `check` before the first user task, reporting non-current state but continuing the request. Allow `apply` only after owner approval. Keep Agent Seed's existing cached self-update behavior: the preflight cannot bypass `check_interval_hours` and cannot run `--apply` automatically.

In `output-assets.md`, require generated `AGENTS.md` to include the same command with its project root. In `README.md`, document managed state, CLI usage, replacement/rollback behavior, legacy migration, and external platform-native ownership.

- [ ] **Step 4: Run final verification and package a test artifact**

Run: `make check; node tools/release.mjs --version v0.0.0-test; rg --files outputs/agent-seed | rg "manage-managed-skills\.mjs|bundled-skills\.json"`

Expected: all tests pass and the package includes the manager script and materialized manifest.

- [ ] **Step 5: Commit**

Commit: `git add skill/SKILL.md skill/references/output-assets.md README.md tools/release.test.mjs && git commit -m "docs: add managed update session preflight"`
