# Agent Seed Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight project-local `agent-seed-updater` skill that preserves Agent Seed self-update behavior and reports managed skill updates and newly offered skills once per conversation without running onboarding or repository scans.

**Architecture:** Extend the existing managed-skill manager with schema-v2 declined-offer state and new-install detection. Add a small executable preflight coordinator that independently runs the existing cached Agent Seed self-check and local managed check, then expose that coordinator through a bundled multi-platform skill and a portable `AGENTS.md` startup rule. Keep all download, replacement, rollback, proxy, package installation, and knowledge-maintenance behavior in their existing owners.

**Tech Stack:** Node.js ES modules and built-in `node:test`, JSON manifests and local state, Markdown skills and references, YAML Codex metadata, existing release packaging scripts.

---

## File Structure

- Modify: `skill/scripts/manage-managed-skills.mjs` - schema-v2 normalization, new-install states, decline recording, decline cleanup, and CLI support.
- Modify: `tools/managed-skill-updates.test.mjs` - manager state, detection, decline, migration, and apply regression coverage.
- Modify: `skill/scripts/update-agent-seed.mjs` - persist the validated installed Agent Seed root without changing self-update behavior.
- Modify: `tools/update-agent-seed.test.mjs` - installation-root persistence and cached-check regression coverage.
- Create: `skill/scripts/check-agent-seed-updates.mjs` - resilient, read-only startup coordinator for self-update and managed checks.
- Create: `tools/agent-seed-updater.test.mjs` - coordinator unit and CLI behavior.
- Create: `skill/bundled-skills/agent-seed-updater/skill/SKILL.md` - portable once-per-conversation updater workflow.
- Create: `skill/bundled-skills/agent-seed-updater/overlays/codex/agents/openai.yaml` - Codex discovery metadata.
- Modify: `skill/bundled-skills.json` - four-platform project-local updater registration.
- Modify: `skill/SKILL.md` - updater installation, self-update preservation, and old-project migration guidance.
- Modify: `skill/references/output-assets.md` - exact portable startup rule and partial-install repair behavior.
- Modify: `README.md` - user-facing updater, state schema, statuses, and migration documentation.
- Modify: `tools/release.test.mjs` - bundled artifact, parent integration, no-scan, and migration contracts.
- Modify: `Makefile` - include the coordinator suite in the normal check target.
- Modify: `.github/workflows/release.yml` - run managed-skill and updater tests before publishing.

### Task 1: Add Schema-V2 New-Install Detection

**Files:**
- Modify: `tools/managed-skill-updates.test.mjs`
- Modify: `skill/scripts/manage-managed-skills.mjs`

- [ ] **Step 1: Write failing state and status tests**

Update the unmanaged-state expectation to schema v2, add `default_install.offer_by_default: true` to the direct-skill fixtures, and add these focused tests:

```js
test("inspectManagedUpdates reports new default offers and suppresses the declined version", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-managed-offers-"));
  const skillRoot = path.join(rootDir, "skill-root");
  const targetDir = path.join(rootDir, "target");

  try {
    await writeManifest(skillRoot);
    const initial = await manager.inspectManagedUpdates({ skillRoot, targetDir, platform: "codex" });
    assert.equal(initial.managed.find((entry) => entry.name === "gitpush").state, "install-available");

    await mkdir(path.join(targetDir, ".agents"), { recursive: true });
    await writeFile(
      path.join(targetDir, ".agents", "managed-skills.json"),
      `${JSON.stringify({
        schema_version: 2,
        managed_skills: [],
        external_integrations: [],
        declined_install_offers: [{
          name: "gitpush",
          kind: "direct-skill",
          platform: "codex",
          offered_version: "v1.1.0",
          declined_at: "2026-08-03T10:00:00.000Z",
        }],
      })}\n`,
    );

    const declined = await manager.inspectManagedUpdates({ skillRoot, targetDir, platform: "codex" });
    assert.equal(declined.managed.find((entry) => entry.name === "gitpush").state, "declined-current-version");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("read-only inspection normalizes schema v1 without rewriting it", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-managed-v1-"));
  const skillRoot = path.join(rootDir, "skill-root");
  const targetDir = path.join(rootDir, "target");
  const statePath = path.join(targetDir, ".agents", "managed-skills.json");

  try {
    await writeManifest(skillRoot);
    await mkdir(path.dirname(statePath), { recursive: true });
    const original = `${JSON.stringify({ schema_version: 1, managed_skills: [], external_integrations: [] })}\n`;
    await writeFile(statePath, original);

    const state = await manager.readManagedState(targetDir);
    assert.deepEqual(state, {
      schema_version: 2,
      managed_skills: [],
      external_integrations: [],
      declined_install_offers: [],
    });
    await manager.inspectManagedUpdates({ skillRoot, targetDir, platform: "codex" });
    assert.equal(await readFile(statePath, "utf8"), original);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
```

Change the empty-state assertion to:

```js
assert.deepEqual(await manager.readManagedState(targetDir), {
  schema_version: 2,
  managed_skills: [],
  external_integrations: [],
  declined_install_offers: [],
});
```

- [ ] **Step 2: Run the focused tests and verify red**

Run:

```bash
node --test --test-name-pattern="new default offers|schema v1|empty state" tools/managed-skill-updates.test.mjs
```

Expected: FAIL because new entries are skipped and schema version 1 is still returned.

- [ ] **Step 3: Implement schema-v2 normalization and offer states**

In `manage-managed-skills.mjs`, replace the empty state and normalization with:

```js
const EMPTY_STATE = Object.freeze({
  schema_version: 2,
  managed_skills: [],
  external_integrations: [],
  declined_install_offers: [],
});

function normalizeState(state, statePath) {
  if (!state || Array.isArray(state) || typeof state !== "object") {
    throw new Error(`Invalid managed skill state: ${statePath}`);
  }
  if (![1, 2].includes(state.schema_version)
      || !Array.isArray(state.managed_skills)
      || !Array.isArray(state.external_integrations)
      || (state.schema_version === 2 && !Array.isArray(state.declined_install_offers))) {
    throw new Error(`Invalid managed skill state: ${statePath}`);
  }
  return {
    schema_version: 2,
    managed_skills: state.managed_skills,
    external_integrations: state.external_integrations,
    declined_install_offers: state.declined_install_offers || [],
  };
}
```

Expose the default-offer bit from `normalizeEntry`:

```js
offer_by_default: entry.default_install?.offer_by_default === true,
```

Replace the unconditional absent-entry skip in `inspectManagedUpdates` with:

```js
const decline = state.declined_install_offers.find((candidate) =>
  candidate.name === entry.name
  && candidate.kind === entry.kind
  && candidate.platform === platform
  && compareVersions(candidate.offered_version, entry.version) === 0
);

if (!record && !targetExists && !entry.offer_by_default) continue;

const status = record
  ? targetExists
    ? compareVersions(record.version, entry.version) < 0 ? "update-available" : "current"
    : "missing"
  : targetExists
    ? "legacy-unmanaged"
    : decline
      ? "declined-current-version"
      : "install-available";
```

- [ ] **Step 4: Run the manager suite and verify green**

Run: `node --test tools/managed-skill-updates.test.mjs`

Expected: PASS with all manager tests green.

- [ ] **Step 5: Commit the schema and status behavior**

```bash
git add skill/scripts/manage-managed-skills.mjs tools/managed-skill-updates.test.mjs
git commit -m "feat: detect new managed skill offers"
```

### Task 2: Record Version-Specific Declines And Clear Them On Install

**Files:**
- Modify: `tools/managed-skill-updates.test.mjs`
- Modify: `skill/scripts/manage-managed-skills.mjs`

- [ ] **Step 1: Write failing decline and migration tests**

Add tests that call a public decline function and exercise the CLI:

```js
test("recordInstallOfferDecline requires confirmation and stores the manifest version", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-managed-decline-"));
  const skillRoot = path.join(rootDir, "skill-root");
  const targetDir = path.join(rootDir, "target");

  try {
    await writeManifest(skillRoot);
    await assert.rejects(
      manager.recordInstallOfferDecline({ skillRoot, targetDir, name: "gitpush", platform: "codex", confirmed: false }),
      /explicit owner decline is required/i,
    );
    const decline = await manager.recordInstallOfferDecline({
      skillRoot,
      targetDir,
      name: "gitpush",
      platform: "codex",
      confirmed: true,
      now: new Date("2026-08-03T10:00:00.000Z"),
    });
    assert.equal(decline.offered_version, "v1.1.0");
    assert.equal((await manager.readManagedState(targetDir)).schema_version, 2);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("approved installation clears the matching declined offer", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-managed-clear-decline-"));
  const skillRoot = path.join(rootDir, "skill-root");
  const targetDir = path.join(rootDir, "target");

  try {
    await writeManifest(skillRoot);
    await mkdir(path.join(skillRoot, "bundled-skills", "gitpush", "skill"), { recursive: true });
    await writeFile(path.join(skillRoot, "bundled-skills", "gitpush", "skill", "SKILL.md"), "new skill\n");
    await manager.recordInstallOfferDecline({ skillRoot, targetDir, name: "gitpush", platform: "codex", confirmed: true });
    await manager.applyManagedUpdate({ skillRoot, targetDir, name: "gitpush", platform: "codex", approved: true });

    const state = await manager.readManagedState(targetDir);
    assert.equal(state.managed_skills[0].version, "v1.1.0");
    assert.deepEqual(state.declined_install_offers, []);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
```

Extend the existing CLI test with:

```js
const declined = await execFileAsync(process.execPath, [
  script, "decline", targetDir,
  "--name", "gittag",
  "--platform", "codex",
  "--skill-root", skillRoot,
  "--confirmed",
  "--json",
]);
assert.equal(JSON.parse(declined.stdout).offered_version, "v1.1.0");
```

- [ ] **Step 2: Run the decline tests and verify red**

Run:

```bash
node --test --test-name-pattern="decline|clears the matching" tools/managed-skill-updates.test.mjs
```

Expected: FAIL because `recordInstallOfferDecline` and the `decline` CLI command do not exist.

- [ ] **Step 3: Implement the decline API**

Add:

```js
export async function recordInstallOfferDecline({ skillRoot, targetDir, name, platform, confirmed, now = new Date() }) {
  if (confirmed !== true) throw new Error("An explicit owner decline is required.");
  const entry = (await readManagedEntries(skillRoot, platform)).find((candidate) => candidate.name === name);
  if (!entry || !entry.offer_by_default) throw new Error(`Unknown default install offer for ${platform}: ${name}`);

  const state = await readManagedState(targetDir);
  const decline = {
    name: entry.name,
    kind: entry.kind,
    platform,
    offered_version: entry.version,
    declined_at: now.toISOString(),
  };
  const retained = state.declined_install_offers.filter((candidate) =>
    candidate.name !== entry.name || candidate.kind !== entry.kind || candidate.platform !== platform
  );
  await writeManagedState(targetDir, { ...state, declined_install_offers: [...retained, decline] });
  return decline;
}
```

Update `recordManagedInstall` so a successful install removes declines for the installed name, kind, and platform:

```js
const retainedDeclines = state.declined_install_offers.filter((entry) =>
  entry.name !== record.name || entry.kind !== record.kind || entry.platform !== record.platform
);
return writeManagedState(targetDir, {
  ...state,
  managed_skills: [...retained, record],
  declined_install_offers: retainedDeclines,
});
```

- [ ] **Step 4: Extend the CLI without weakening approval boundaries**

Allow `check`, `apply`, and `decline`; parse `--confirmed`; require `--name` for both write commands; and dispatch explicitly:

```js
if (!command || !targetDir || !["check", "apply", "decline"].includes(command)) {
  throw new Error("Usage: node scripts/manage-managed-skills.mjs <check|apply|decline> <target-project> --platform <platform> [--name <name>] [--approved] [--confirmed] [--json]");
}

if (arg === "--approved") options.approved = true;
else if (arg === "--confirmed") options.confirmed = true;

if (["apply", "decline"].includes(command) && !options.name) throw new Error(`--name is required for ${command}`);
if (command === "apply" && !options.approved) throw new Error("--approved is required for apply");
if (command === "decline" && !options.confirmed) throw new Error("--confirmed is required for decline");
```

Use an explicit `if`/`else if` dispatch in `runCli` so `decline` calls `recordInstallOfferDecline` and `--json` prints its returned record.

- [ ] **Step 5: Run the manager suite and commit**

Run: `node --test tools/managed-skill-updates.test.mjs`

Expected: PASS.

```bash
git add skill/scripts/manage-managed-skills.mjs tools/managed-skill-updates.test.mjs
git commit -m "feat: remember declined skill offers"
```

### Task 3: Persist The Installed Agent Seed Root

**Files:**
- Modify: `tools/update-agent-seed.test.mjs`
- Modify: `skill/scripts/update-agent-seed.mjs`

- [ ] **Step 1: Add failing persistence tests**

Add a direct helper test:

```js
test("Agent Seed updater records its installed root without discarding config", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-install-root-"));
  const configPath = path.join(rootDir, ".agents", "agent-seed.json");
  const skillRoot = path.join(rootDir, "installed", "agent-seed");

  try {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify({ knowledge_asset_write_mode: "full-access" })}\n`);
    await updater.writeAgentSeedInstallationState({
      configPath,
      skillRoot,
      now: new Date("2026-08-03T10:00:00.000Z"),
    });

    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(config.knowledge_asset_write_mode, "full-access");
    assert.deepEqual(config.installation, {
      skill_root: path.resolve(skillRoot),
      recorded_at: "2026-08-03T10:00:00.000Z",
    });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
```

Add a CLI regression fixture with a recent matching `last_check` and a temporary `VERSION.json`; invoke `update-agent-seed.mjs --json --target <skillRoot> --config <configPath>` and assert both cached output and the persisted `installation.skill_root`. This proves root recording does not bypass or invalidate the 24-hour cache.

- [ ] **Step 2: Run the focused tests and verify red**

Run:

```bash
node --test --test-name-pattern="installed root|cached.*installed root" tools/update-agent-seed.test.mjs
```

Expected: FAIL because `writeAgentSeedInstallationState` is undefined and the CLI does not persist the root.

- [ ] **Step 3: Add the preserving config writer**

Add next to the other config writers:

```js
export async function writeAgentSeedInstallationState({ configPath = DEFAULT_CONFIG_PATH, skillRoot, now = new Date() } = {}) {
  if (typeof skillRoot !== "string" || skillRoot.trim() === "") throw new Error("Agent Seed skill root is required.");
  const config = await readAgentSeedConfig(configPath);
  await writeAgentSeedConfig(configPath, {
    ...config,
    installation: {
      skill_root: path.resolve(skillRoot),
      recorded_at: now.toISOString(),
    },
  });
}
```

In normal check/apply execution, resolve `targetDir` immediately after argument parsing, call `writeAgentSeedInstallationState({ configPath, skillRoot: targetDir })`, then read the config used for caching and proxy behavior. Keep proxy-only, network-denied recording, and deferred-helper commands on their existing specialized paths.

- [ ] **Step 4: Run self-update tests and commit**

Run: `node --test tools/update-agent-seed.test.mjs`

Expected: PASS, including all existing cache, proxy, apply, rollback, and Windows deferred-update tests.

```bash
git add skill/scripts/update-agent-seed.mjs tools/update-agent-seed.test.mjs
git commit -m "feat: record agent seed installation root"
```

### Task 4: Add The Resilient Startup Coordinator

**Files:**
- Create: `tools/agent-seed-updater.test.mjs`
- Create: `skill/scripts/check-agent-seed-updates.mjs`

- [ ] **Step 1: Write failing coordinator tests**

Create `tools/agent-seed-updater.test.mjs` with tests for independent failure handling and normalized output:

```js
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runAgentSeedPreflight } from "../skill/scripts/check-agent-seed-updates.mjs";

test("preflight combines the existing self-update and managed checks", async () => {
  const result = await runAgentSeedPreflight({
    skillRoot: "C:/agent-seed",
    targetDir: "C:/project",
    platform: "codex",
    runSelfUpdate: async () => ({ hasUpdate: true, currentVersion: "v1.0.0", latestVersion: "v1.1.0", cached: true }),
    inspectManaged: async () => ({ managed: [{ name: "gitpush", state: "update-available" }], external: [] }),
  });

  assert.deepEqual(result.agent_seed, {
    state: "update-available",
    current_version: "v1.0.0",
    available_version: "v1.1.0",
    cached: true,
  });
  assert.equal(result.managed[0].name, "gitpush");
  assert.deepEqual(result.errors, []);
});

test("preflight continues managed inspection when self-update check fails", async () => {
  let managedCalled = false;
  const result = await runAgentSeedPreflight({
    skillRoot: "C:/agent-seed",
    targetDir: "C:/project",
    platform: "codex",
    runSelfUpdate: async () => { throw new Error("network unavailable"); },
    inspectManaged: async () => { managedCalled = true; return { managed: [], external: [] }; },
  });

  assert.equal(managedCalled, true);
  assert.equal(result.agent_seed.state, "unknown");
  assert.deepEqual(result.errors, [{ source: "agent-seed", message: "network unavailable" }]);
});

test("preflight returns managed errors without failing the caller", async () => {
  const result = await runAgentSeedPreflight({
    skillRoot: "C:/agent-seed",
    targetDir: "C:/project",
    platform: "codex",
    runSelfUpdate: async () => ({ hasUpdate: false, currentVersion: "v1.1.0", latestVersion: "v1.1.0" }),
    inspectManaged: async () => { throw new Error("invalid bundled-skills.json"); },
  });

  assert.deepEqual(result.managed, []);
  assert.deepEqual(result.errors, [{ source: "managed-skills", message: "invalid bundled-skills.json" }]);
});
```

- [ ] **Step 2: Run the new suite and verify red**

Run: `node --test tools/agent-seed-updater.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `check-agent-seed-updates.mjs`.

- [ ] **Step 3: Implement the dependency-injected coordinator**

Create `skill/scripts/check-agent-seed-updates.mjs` with these public boundaries:

```js
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { inspectManagedUpdates } from "./manage-managed-skills.mjs";

const execFileAsync = promisify(execFile);

export async function runAgentSeedPreflight({
  skillRoot,
  targetDir,
  platform,
  runSelfUpdate = runSelfUpdateCheck,
  inspectManaged = inspectManagedUpdates,
}) {
  const result = { agent_seed: { state: "unknown" }, managed: [], external: [], errors: [] };

  try {
    const update = await runSelfUpdate({ skillRoot, targetDir });
    result.agent_seed = {
      state: update.hasUpdate ? "update-available" : "current",
      current_version: update.currentVersion,
      available_version: update.latestVersion,
      cached: update.cached === true,
    };
  } catch (error) {
    result.agent_seed = { state: "unknown" };
    result.errors.push({ source: "agent-seed", message: error.message });
  }

  try {
    const managed = await inspectManaged({ skillRoot, targetDir, platform });
    result.managed = managed.managed;
    result.external = managed.external;
  } catch (error) {
    result.errors.push({ source: "managed-skills", message: error.message });
  }
  return result;
}

export async function runSelfUpdateCheck({ skillRoot, targetDir }) {
  const script = path.join(path.resolve(skillRoot), "scripts", "update-agent-seed.mjs");
  const config = path.join(path.resolve(targetDir), ".agents", "agent-seed.json");
  const { stdout } = await execFileAsync(process.execPath, [script, "--json", "--target", skillRoot, "--config", config], {
    cwd: path.resolve(targetDir),
    windowsHide: true,
  });
  return JSON.parse(stdout);
}
```

Add strict CLI parsing for:

```text
node scripts/check-agent-seed-updates.mjs <target-project> --platform <platform> [--skill-root <agent-seed-root>] [--json]
```

Default `--skill-root` to the parent of the coordinator's `scripts/` directory. Require `--platform`. JSON mode prints the complete combined object; text mode prints only non-current managed entries, an available Agent Seed update, and errors.

- [ ] **Step 4: Add a CLI fixture test**

Create a temporary packaged-like skill root containing a fake `scripts/update-agent-seed.mjs` that prints a valid cached JSON plan plus empty bundled manifests. Invoke the coordinator CLI with `--skill-root`, `--platform codex`, and `--json`; assert exit code 0 and parseable combined output. Add a second fixture whose fake self-updater exits nonzero and assert the managed result still appears with an `agent-seed` error.

- [ ] **Step 5: Run and commit the coordinator**

Run: `node --test tools/agent-seed-updater.test.mjs`

Expected: PASS.

```bash
git add skill/scripts/check-agent-seed-updates.mjs tools/agent-seed-updater.test.mjs
git commit -m "feat: coordinate startup update checks"
```

### Task 5: Package The Agent Seed Updater Skill

**Files:**
- Modify: `tools/release.test.mjs`
- Create: `skill/bundled-skills/agent-seed-updater/skill/SKILL.md`
- Create: `skill/bundled-skills/agent-seed-updater/overlays/codex/agents/openai.yaml`
- Modify: `skill/bundled-skills.json`

- [ ] **Step 1: Add the failing bundled-skill contract**

Add a release test that loads `bundled-skills.json`, finds `agent-seed-updater`, and asserts:

```js
assert.equal(updater.kind, "multi-platform-direct-skill");
assert.equal(updater.source_path, "bundled-skills/agent-seed-updater/skill");
assert.equal(updater.default_install.mode, "project-local");
assert.equal(updater.default_install.offer_by_default, true);
assert.equal(updater.default_install.requires_user_approval, true);
assert.equal(updater.default_install.install_only_for_detected_or_requested_platforms, true);
assert.deepEqual(updater.platforms.map((entry) => entry.platform).sort(), ["claude", "codeagent-cli", "codex", "opencode"]);
```

Read its `SKILL.md` and Codex overlay and assert they cover: once before the first task, the combined coordinator command, version-specific decline, approval-gated apply, synchronous recheck, Windows `queued`, no repository scan, no Agent Seed onboarding, no knowledge update, and non-blocking failure.

- [ ] **Step 2: Run the focused release test and verify red**

Run:

```bash
node --test --test-name-pattern="agent-seed-updater bundled skill" tools/release.test.mjs
```

Expected: FAIL because the manifest entry and skill files do not exist.

- [ ] **Step 3: Create the portable updater skill**

Create frontmatter and sections with this contract:

```markdown
---
name: agent-seed-updater
description: Use once before the first project task in each new agent conversation to check the installed Agent Seed release and its project-local managed skills without running onboarding or scanning the repository.
---

# Agent Seed Updater

Run once before the first user task in a new conversation. Do not run again in the same conversation.

## Boundaries

Read only `.agents/agent-seed.json`, `.agents/managed-skills.json`, the configured managed target paths, and the installed Agent Seed version, manifests, and updater scripts. Do not scan the repository, invoke Agent Seed onboarding, interview the owner, update knowledge assets, inspect personal skill directories, or configure hooks.
```

Complete the file with exact commands for the coordinator, Agent Seed `--apply`, managed `apply`, and managed `decline`. Require explicit approval or decline before every write. Specify that only `update-available`, `install-available`, `missing`, `legacy-unmanaged`, `unknown`, and errors are surfaced; `current` and `declined-current-version` stay quiet. Instruct the agent to rerun the coordinator only after synchronous Agent Seed replacement and to defer when the update is `queued`.

- [ ] **Step 4: Create Codex metadata**

```yaml
interface:
  display_name: "Agent Seed Updater"
  short_description: "Check Agent Seed and managed skill updates."
  default_prompt: "Use $agent-seed-updater once before the first project task, report actionable updates without blocking the task, and do not run Agent Seed onboarding."
```

- [ ] **Step 5: Register all platform targets**

Add the manifest entry using version `$AGENT_SEED_VERSION`, source path `bundled-skills/agent-seed-updater/skill`, the existing project-local approval policy, and these targets:

```text
codex          skills/agent-seed-updater                  overlay: bundled-skills/agent-seed-updater/overlays/codex
claude         .claude/skills/agent-seed-updater
codeagent-cli  .cac/skills/agent-seed-updater
opencode       .opencode/skills/agent-seed-updater
```

Use the same detection paths and verification sentence pattern as existing direct skills. Add all four paths to the entry's `writes` list and retain `existing_target_requires_user_decision: true`.

- [ ] **Step 6: Run release tests and commit**

Run: `node --test tools/release.test.mjs`

Expected: PASS.

```bash
git add tools/release.test.mjs skill/bundled-skills.json skill/bundled-skills/agent-seed-updater
git commit -m "feat: bundle agent seed updater skill"
```

### Task 6: Install The Startup Rule And Migrate Existing Projects

**Files:**
- Modify: `tools/release.test.mjs`
- Modify: `skill/SKILL.md`
- Modify: `skill/references/output-assets.md`
- Modify: `README.md`

- [ ] **Step 1: Add failing parent-integration tests**

Add tests asserting both `skill/SKILL.md` and `output-assets.md` contain this behavior:

```text
Before the first task in each new agent conversation, invoke the installed
`agent-seed-updater` exactly once. Let it run only Agent Seed's cached
self-update check and the local managed-skill manifest check; do not let it
invoke Agent Seed onboarding or scan the repository. Report actionable results
without blocking the requested task.
```

Also assert:

- Agent Seed's own activation still calls `update-agent-seed.mjs --json` and never applies automatically.
- updater installation and instruction edits require approval.
- Codex/OpenCode use `AGENTS.md`, while Claude Code/codeagent-cli use the `CLAUDE.md` import.
- a pre-existing updater target with a missing rule receives a repair offer.
- old direct `manage-managed-skills.mjs check` preflight prose is replaced only after approved updater installation.
- migration explicitly forbids repository scanning, owner interviews, and knowledge distillation.

- [ ] **Step 2: Run the focused integration tests and verify red**

Run:

```bash
node --test --test-name-pattern="agent seed updater startup rule|existing managed preflight" tools/release.test.mjs
```

Expected: FAIL because the parent skill still installs the direct manager preflight.

- [ ] **Step 3: Replace the generated preflight rule**

In `output-assets.md`, replace the direct Node manager command with the exact portable updater rule above. Document that installation plus the `AGENTS.md`/`CLAUDE.md` edits are one disclosed, approval-gated operation; validate skill availability and instruction visibility independently; and offer a minimal repair when either half is missing.

Add an old-project migration paragraph requiring removal of only the obsolete direct-manager preflight after updater installation succeeds. Preserve unrelated `AGENTS.md` content and never use migration as authorization for a broader onboarding refresh.

- [ ] **Step 4: Update Agent Seed responsibilities without touching self-update semantics**

In `skill/SKILL.md`:

- keep `## Version And Self Update` and its existing cached `update-agent-seed.mjs --json` behavior;
- replace `## Managed Skill Update Preflight` with an `## Agent Seed Updater` section;
- require installation offers for supported platforms during onboarding;
- require `.agents/agent-seed.json.installation.skill_root` to be refreshed by the existing update command;
- route routine conversation startup to the installed updater;
- document schema-v2 decline behavior and old direct-preflight migration;
- retain approval requirements for every apply and explicit decline write;
- explicitly prohibit onboarding scans and knowledge distillation during migration and routine checks.

- [ ] **Step 5: Update public documentation**

In `README.md`, update the configuration table and managed-update section to document:

- schema-v2 `declined_install_offers`;
- `install-available` and `declined-current-version`;
- the combined coordinator command;
- the 24-hour self-check cache;
- version-specific re-prompt behavior;
- synchronous recheck versus Windows `queued` deferral;
- the separation between startup updater, Agent Seed onboarding, and end-of-task `knowledge-updater`.

- [ ] **Step 6: Run integration tests and commit**

Run: `node --test tools/release.test.mjs tools/update-agent-seed.test.mjs tools/managed-skill-updates.test.mjs tools/agent-seed-updater.test.mjs`

Expected: PASS.

```bash
git add skill/SKILL.md skill/references/output-assets.md README.md tools/release.test.mjs
git commit -m "docs: route startup checks through updater"
```

### Task 7: Wire Release Verification And Run The Full Build

**Files:**
- Modify: `Makefile`
- Modify: `.github/workflows/release.yml`
- Verify: `skill/scripts/check-agent-seed-updates.mjs`
- Verify: `skill/bundled-skills/agent-seed-updater/skill/SKILL.md`
- Verify: `skill/bundled-skills/agent-seed-updater/overlays/codex/agents/openai.yaml`
- Verify: `skill/bundled-skills.json`

- [ ] **Step 1: Add the updater suite to local and release checks**

Change `make check` to run:

```make
node --test tools/release.test.mjs tools/update-agent-seed.test.mjs tools/git-code-tracker-release.test.mjs tools/managed-skill-updates.test.mjs tools/agent-seed-updater.test.mjs
```

Use the same complete test list in the release workflow's `Test release script` step so publication cannot skip managed-update behavior.

- [ ] **Step 2: Run the complete test suite**

Run: `make check`

Expected: exit code 0 with zero failed tests.

- [ ] **Step 3: Build release artifacts with a concrete test version**

Run:

```bash
make release VERSION=v0.0.999
```

Expected: exit code 0 and artifacts for the main Agent Seed package and every bundled skill.

- [ ] **Step 4: Verify expanded updater artifacts and materialized versions**

Run:

```bash
node -e "const fs=require('node:fs'); const paths=['outputs/agent-seed/scripts/check-agent-seed-updates.mjs','outputs/bundled-skills/agent-seed-updater/SKILL.md','outputs/bundled-skills/agent-seed-updater-codex/SKILL.md','outputs/bundled-skills/agent-seed-updater-codex/agents/openai.yaml']; for(const p of paths){if(!fs.existsSync(p))throw new Error('missing '+p)} const manifest=JSON.parse(fs.readFileSync('outputs/agent-seed/bundled-skills.json','utf8')); const entry=manifest.bundled_skills.find(x=>x.name==='agent-seed-updater'); if(entry?.version!=='v0.0.999')throw new Error('wrong updater version'); console.log('agent-seed-updater release artifacts verified');"
```

Expected: `agent-seed-updater release artifacts verified`.

- [ ] **Step 5: Confirm no unintended worktree changes**

Run:

```bash
git status --short
git diff --check
```

Expected: only the intended source, test, documentation, Makefile, and workflow changes; no tracked `outputs/` files and no whitespace errors.

- [ ] **Step 6: Commit release verification wiring**

```bash
git add Makefile .github/workflows/release.yml
git commit -m "test: verify agent seed updater releases"
```

- [ ] **Step 7: Review the complete implementation diff**

Run:

```bash
git log --oneline --decorate -8
git diff HEAD~7..HEAD --stat
git status --short --branch
```

Expected: seven focused implementation commits after the design/plan commits and a clean working tree.
