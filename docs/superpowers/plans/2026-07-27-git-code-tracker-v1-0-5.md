# Git Code Tracker v1.0.5 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle Git Code Tracker v1.0.5 and verify new projects record version `1.0.5`.

**Architecture:** Agent Seed keeps the upstream release ZIP unmodified and pins it in `bundled-packages.json`. The existing wrapper continues to own only the upload URL merge; upstream v1.0.5 owns `installedVersion`.

**Tech Stack:** Node.js ESM, node:test, GitHub release assets, PowerShell archive extraction.

---

## File Structure

- Replace: `skill/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.4.zip`.
- Create: `skill/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.5.zip`.
- Modify: `skill/bundled-packages.json`.
- Modify: `skill/scripts/install-git-code-tracker.mjs`.
- Modify: `tools/git-code-tracker-release.test.mjs`.
- Modify: `tools/release.test.mjs`.

### Task 1: Define The v1.0.5 Contract

**Files:**
- Modify: `tools/git-code-tracker-release.test.mjs`
- Modify: `tools/release.test.mjs`

- [ ] **Step 1: Make the installer test expect v1.0.5**

Change its fixture archive path to `ai-commit-statistic-skill-v1.0.5.zip`. In the existing new-config test, omit the `archivePath` option so it exercises the installer's default archive path. Keep the URL assertion and add:

```js
assert.equal(config.installedVersion, "1.0.5");
```

- [ ] **Step 2: Make release metadata tests expect v1.0.5**

Update the assertions to:

```js
assert.equal(tracker.version, "v1.0.5");
assert.equal(tracker.source.ref, "refs/tags/v1.0.5");
assert.equal(tracker.source.asset, "ai-commit-statistic-skill-v1.0.5.zip");
assert.equal(tracker.asset_path, "packages/git-code-tracker/ai-commit-statistic-skill-v1.0.5.zip");
```

Update the expected packaged asset list to:

```js
["ai-commit-statistic-skill-v1.0.5.zip"]
```

- [ ] **Step 3: Confirm the red state**

Run:

```powershell
node --test tools/git-code-tracker-release.test.mjs tools/release.test.mjs
```

Expected: failure because the v1.0.5 archive and manifest pin do not yet exist.

### Task 2: Replace The Asset And Pin The Manifest

**Files:**
- Create: `skill/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.5.zip`
- Delete: `skill/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.4.zip`
- Modify: `skill/bundled-packages.json`
- Modify: `skill/scripts/install-git-code-tracker.mjs`

- [ ] **Step 1: Download and verify v1.0.5**

Download `https://github.com/yooocen/git-code-tracker/releases/download/v1.0.5/ai-commit-statistic-skill-v1.0.5.zip`. Verify SHA-256:

```text
e882455f070bd73467994d55edf7d77cb475eb007d839e2ec6fef7b3c1b3d482
```

Verify with `tar -tf` that the archive includes `.opencode/skills/ai-code-tracker/`, `.claude/skills/ai-code-tracker/`, and `.cac/skills/ai-code-tracker/`. Only then remove v1.0.4.

- [ ] **Step 2: Update the immutable manifest values**

Set these values in the `git-code-tracker` package entry:

```json
"version": "v1.0.5",
"ref": "refs/tags/v1.0.5",
"asset": "ai-commit-statistic-skill-v1.0.5.zip",
"asset_path": "packages/git-code-tracker/ai-commit-statistic-skill-v1.0.5.zip"
```

Set `source.commit` to the commit resolved for tag `v1.0.5`. Do not alter the existing `upload` block or write declarations.

- [ ] **Step 3: Update the installer default archive path**

Change the `DEFAULT_ARCHIVE_PATH` filename in `skill/scripts/install-git-code-tracker.mjs` to:

```js
"ai-commit-statistic-skill-v1.0.5.zip"
```

This makes the command-line installer use the bundled v1.0.5 archive when no `archivePath` test override is supplied.

- [ ] **Step 4: Confirm the green state**

Run:

```powershell
node --test tools/git-code-tracker-release.test.mjs tools/release.test.mjs
```

Expected: all selected tests pass, including the version and upload URL assertions.

### Task 3: Verify The Packaged Release

**Files:**
- Verify: `skill/scripts/install-git-code-tracker.mjs`
- Verify: `outputs/agent-seed/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.5.zip`

- [ ] **Step 1: Run the full repository suite**

```powershell
make check
```

Expected: exit code 0.

- [ ] **Step 2: Build a release package**

```powershell
make release VERSION=v1.0.5-test
```

Expected: exit code 0 with `outputs/agent-seed/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.5.zip` and `outputs/agent-seed/scripts/install-git-code-tracker.mjs` present.

- [ ] **Step 3: Verify the packaged archive list**

```powershell
tar -tf outputs/agent-seed.zip | Select-String 'git-code-tracker'
```

Expected: v1.0.5 is present and v1.0.4 is absent.

- [ ] **Step 4: Commit the integration**

```powershell
git add skill/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.5.zip skill/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.4.zip skill/bundled-packages.json tools/git-code-tracker-release.test.mjs tools/release.test.mjs
git commit -m "feat: update tracker to v1.0.5"
```
