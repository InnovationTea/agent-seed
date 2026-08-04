# Agent Seed Shared Config And Local State Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split Agent Seed project policy from machine-local state, share a minimum compatible Agent Seed version and managed-skill baseline, migrate legacy unified files safely, and preserve no-downgrade behavior.

**Architecture:** Add a focused config module that classifies shared and local fields, resolves effective policy, performs idempotent legacy migration, and writes local state atomically. Update the self-updater and startup coordinator to consume that module; keep version enforcement and baseline refresh as explicit operations. Update Git policy, managed-skill state handling, documentation, and tests together.

**Tech Stack:** Node.js ESM, `node:fs/promises`, Node test runner, Git ignore checks, existing Agent Seed release scripts.

---

### Task 1: Add split-config primitives and migration tests

**Files:**
- Create: `skill/scripts/agent-seed-config.mjs`
- Create: `tools/agent-seed-config.test.mjs`

- [ ] **Step 1: Write failing tests for ownership and effective policy**

  Cover these exact inputs and outputs:

  ```js
  const shared = {
    schema_version: 2,
    minimum_agent_seed_version: "v0.3.8",
    knowledge_asset_write_mode: "agent-approve",
    self_update: { check_on_start: true, update_mode: "notify" },
  };
  const local = {
    schema_version: 1,
    installation: { skill_root: "C:/agent-seed" },
    self_update: {
      proxy: { https_proxy: "http://proxy.example:8080" },
      last_check: { status: "current" },
    },
  };
  const effective = resolveAgentSeedConfig({ shared, local });
  assert.equal(effective.minimum_agent_seed_version, "v0.3.8");
  assert.equal(effective.knowledge_asset_write_mode, "agent-approve");
  assert.equal(effective.self_update.check_on_start, true);
  assert.equal(effective.self_update.proxy.https_proxy, "http://proxy.example:8080");
  ```

  Also assert that a local `self_update.check_on_start: false` cannot override
  the shared policy and that missing files resolve to the existing defaults.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `node --test tools/agent-seed-config.test.mjs`

  Expected: FAIL because `skill/scripts/agent-seed-config.mjs` is absent.

- [ ] **Step 3: Implement config paths, readers, ownership filters, and atomic writers**

  Export these boundaries:

  ```js
  export const SHARED_CONFIG_FILE = ".agents/agent-seed.json";
  export const LOCAL_CONFIG_FILE = ".agents/agent-seed.local.json";
  export async function readAgentSeedFiles(targetDir): Promise<{ shared, local, legacy }>;
  export function resolveAgentSeedConfig({ shared, local }): object;
  export function splitLegacyAgentSeedConfig(legacy, installedVersion): { shared, local };
  export async function migrateAgentSeedConfig({ targetDir, installedVersion }): Promise<result>;
  export async function writeSharedAgentSeedConfig(targetDir, config): Promise<void>;
  export async function writeLocalAgentSeedState(targetDir, patch): Promise<void>;
  ```

  `splitLegacyAgentSeedConfig` must move `knowledge_asset_write_mode` and
  shared `self_update` policy keys to shared, move proxy/cache/installation/
  history to local, preserve unknown keys under local `legacy_unclassified`,
  and choose the greater of a valid existing baseline and `installedVersion`.

- [ ] **Step 4: Add migration and atomic-write regression tests**

  Use a temporary project containing the supplied legacy sample plus proxy,
  installation, and an unknown field. Assert that the shared output contains
  no proxy, path, cache, history, or unknown machine data; assert local output
  preserves all of them. Add malformed JSON, missing VERSION, existing-local-
  wins, duplicate-history, and retry-idempotence tests.

- [ ] **Step 5: Run the focused suite and commit**

  Run: `node --test tools/agent-seed-config.test.mjs`

  Expected: PASS. Commit with `feat: add Agent Seed split config primitives`.

### Task 2: Integrate self-update and startup preflight

**Files:**
- Modify: `skill/scripts/update-agent-seed.mjs`
- Modify: `skill/scripts/check-agent-seed-updates.mjs`
- Modify: `tools/update-agent-seed.test.mjs`
- Modify: `tools/agent-seed-updater.test.mjs`

- [ ] **Step 1: Add failing tests for local state writes**

  Change existing fixtures to provide shared and local files. Assert proxy,
  `last_check`, and `installation.skill_root` are written only to
  `.agents/agent-seed.local.json`, while shared `check_on_start` remains intact.

- [ ] **Step 2: Make the updater resolve effective policy and local state**

  Replace direct `readAgentSeedConfig(configPath)` calls with the new module.
  Preserve `--config` as a legacy-compatible option, but derive the sibling
  local path for split projects. `--config` must continue reading old unified
  fixtures during migration.

- [ ] **Step 3: Route all updater state writers to local state**

  Update proxy persistence, installation-root recording, network-denied state,
  cached update results, and deferred/queued/updated statuses to patch local
  state only. Reads of `check_on_start`, `update_mode`, and the minimum version
  must come from shared policy plus local runtime data.

- [ ] **Step 4: Implement version-baseline reporting without downgrade**

  Compare installed `VERSION.json.version` with shared
  `minimum_agent_seed_version`. Emit `version-incompatible` when lower,
  `version-current` when equal, and `baseline-refresh-available` when higher.
  Do not mutate shared config during startup. Add an explicit approved refresh
  operation that changes only the version field.

- [ ] **Step 5: Run updater and preflight tests and commit**

  Run: `node --test tools/update-agent-seed.test.mjs tools/agent-seed-updater.test.mjs`

  Expected: PASS. Commit with `feat: integrate Agent Seed split state`.

### Task 3: Make shared managed-skill policy and Git migration explicit

**Files:**
- Modify: `.gitignore`
- Modify: `skill/scripts/manage-managed-skills.mjs`
- Modify: `tools/managed-skill-updates.test.mjs`
- Modify: `tools/release.test.mjs`

- [ ] **Step 1: Write failing tests for shared desired state**

  Assert `.agents/managed-skills.json` is trackable, its desired version and
  target platform are read for every clone, and a missing target is reported as
  installable from the shared desired entry. Keep personal decline/history
  data out of the shared file and verify it is stored in local state.

- [ ] **Step 2: Update Git ignore rules**

  Remove exact ignores for `.agents/agent-seed.json` and
  `.agents/managed-skills.json`; add `.agents/agent-seed.local.json` and any
  required negations for broader `.agents` or JSON ignore patterns.

- [ ] **Step 3: Separate desired managed entries from local observations**

  Keep desired name/version/platform/target data in the committed state. Read
  actual target existence from the filesystem. Store version-specific decline
  records and external installation observations in local state so one
  developer's choice cannot suppress another developer's prompt.

- [ ] **Step 4: Run managed-skill and release tests and commit**

  Run: `node --test tools/managed-skill-updates.test.mjs tools/release.test.mjs`

  Expected: PASS. Commit with `feat: share managed skill policy`.

### Task 4: Migrate documentation and add end-to-end coverage

**Files:**
- Modify: `README.md`
- Modify: `skill/SKILL.md`
- Modify: `skill/references/output-assets.md`
- Modify: `skill/references/update-existing-assets.md`
- Modify: `skill/bundled-skills/agent-seed-updater/skill/SKILL.md`
- Modify: `tools/release.test.mjs`
- Modify: `Makefile`

- [ ] **Step 1: Replace unified-file documentation**

  Document shared/local ownership, the minimum-version/no-downgrade rules,
  owner-approved baseline refresh, migration behavior, and the corrected Git
  policy. Keep the current-user-request precedence for write mode.

- [ ] **Step 2: Add end-to-end migration and clone simulation tests**

  Create a temporary repository with the supplied legacy JSON, run migration,
  verify `git check-ignore` results, then simulate a second clone with no local
  file. Assert the second clone reads shared policy, required Agent Seed
  baseline, and managed-skill desired versions while creating only local state.

- [ ] **Step 3: Run the complete verification suite**

  Run: `make check`

  Expected: all Node tests pass with no release-contract failures.

- [ ] **Step 4: Review the final diff and commit**

  Run: `git diff --check; git status --short`

  Expected: only the split-config implementation, tests, docs, and Git policy
  changes are present. Commit with `feat: split Agent Seed shared config and local state`.
