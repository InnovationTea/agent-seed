# Git Code Tracker Release Asset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Install the upstream tracker release asset into the detected project platform and initialize it without vendoring its full repository.

**Architecture:** Store the exact v1.0.3 release zip in skill/packages/git-code-tracker/. A focused Node installer resolves one platform from an explicit option, agent environment, or project markers; extracts only that platform's skill directory; runs the copied install.js; and verifies it. Manifest and documentation point to this installer.

**Tech Stack:** Node.js ESM, node:test, filesystem and child-process APIs, Windows PowerShell Expand-Archive.

---

## File Structure

- Create: skill/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.3.zip - exact upstream release asset.
- Create: skill/scripts/install-git-code-tracker.mjs - detection, extraction, initialization, CLI.
- Create: tools/git-code-tracker-release.test.mjs - installer behavior tests.
- Modify: skill/bundled-packages.json - release source, asset path, new install command.
- Modify: skill/references/output-assets.md, README.md - release asset guidance.
- Modify: tools/release.test.mjs, Makefile - metadata expectations and standard test command.
- Delete: skill/packages/git-code-tracker/ - obsolete vendored upstream repository.

### Task 1: Define Installer Behavior With Failing Tests

**Files:**
- Create: tools/git-code-tracker-release.test.mjs

- [ ] **Step 1: Write the failing platform-resolution tests**

~~~js
test("selectPlatforms detects the only project platform", async () => {
  const targetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-tracker-detect-"));
  await mkdir(path.join(targetDir, ".claude"));
  assert.deepEqual(await selectPlatforms({ targetDir, env: {} }), ["claude"]);
});

test("selectPlatforms rejects conflicting project platforms", async () => {
  const targetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-tracker-ambiguous-"));
  await Promise.all([mkdir(path.join(targetDir, ".claude")), mkdir(path.join(targetDir, ".cac"))]);
  await assert.rejects(selectPlatforms({ targetDir, env: {} }), /Unable to determine a single target platform/);
});

test("selectPlatforms rejects an unsupported explicit platform", async () => {
  await assert.rejects(selectPlatforms({ targetDir: process.cwd(), platform: "codex", env: {} }), /Unsupported platform: codex/);
});
~~~

- [ ] **Step 2: Verify the tests fail for the expected reason**

Run: node --test tools/git-code-tracker-release.test.mjs

Expected: FAIL because skill/scripts/install-git-code-tracker.mjs does not export selectPlatforms.

- [ ] **Step 3: Add failing scoped-install tests**

~~~js
test("installGitCodeTracker copies and initializes only the detected Claude asset", async () => {
  const targetDir = await createGitRepository();
  await mkdir(path.join(targetDir, ".claude"));
  await installGitCodeTracker({ targetDir, env: {}, archivePath });
  assert.equal(await exists(path.join(targetDir, ".claude", "skills", "ai-code-tracker", "SKILL.md")), true);
  assert.equal(await exists(path.join(targetDir, ".opencode", "skills", "ai-code-tracker", "SKILL.md")), false);
  assert.equal(await exists(path.join(targetDir, ".cac", "skills", "ai-code-tracker", "SKILL.md")), false);
  assert.match(await readFile(path.join(targetDir, "AGENTS.md"), "utf8"), /Claude Code skill ai-code-tracker/);
});

test("installGitCodeTracker initializes every explicitly requested platform", async () => {
  const targetDir = await createGitRepository();
  await installGitCodeTracker({ targetDir, platform: "all", env: {}, archivePath });
  for (const platformDir of [".claude", ".opencode", ".cac"]) {
    assert.equal(await exists(path.join(targetDir, platformDir, "skills", "ai-code-tracker", "SKILL.md")), true);
  }
});

test("installGitCodeTracker fails before copying when the release asset is missing", async () => {
  const targetDir = await createGitRepository();
  await mkdir(path.join(targetDir, ".claude"));
  await assert.rejects(
    installGitCodeTracker({ targetDir, env: {}, archivePath: path.join(targetDir, "missing.zip") }),
    /Missing release asset/,
  );
  assert.equal(await exists(path.join(targetDir, ".claude", "skills", "ai-code-tracker")), false);
});
~~~

- [ ] **Step 4: Verify the tests fail for the expected reason**

Run: node --test tools/git-code-tracker-release.test.mjs

Expected: FAIL because installGitCodeTracker does not exist.

- [ ] **Step 5: Commit the red tests**

~~~bash
git add tools/git-code-tracker-release.test.mjs
git commit -m "test: define tracker release asset installation"
~~~

### Task 2: Implement Copy, Initialization, And Verification

**Files:**
- Create: skill/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.3.zip
- Create: skill/scripts/install-git-code-tracker.mjs
- Test: tools/git-code-tracker-release.test.mjs

- [ ] **Step 1: Add the exact release asset**

Download https://github.com/yooocen/git-code-tracker/releases/download/v1.0.3/ai-commit-statistic-skill-v1.0.3.zip into skill/packages/git-code-tracker/. Verify it includes:

~~~text
.claude/skills/ai-code-tracker/SKILL.md
.opencode/skills/ai-code-tracker/SKILL.md
.cac/skills/ai-code-tracker/SKILL.md
~~~

- [ ] **Step 2: Implement the wished-for API**

Export selectPlatforms and installGitCodeTracker. Parse --platform opencode|claude|codeagent-cli|all. Without that option, select in order from AGENT_SEED_PLATFORM, Claude/OpenCode/codeagent runtime variables, then exactly one project marker (.claude, .opencode, .cac). Throw "Unable to determine a single target platform" if detection is absent or conflicting.

For each platform: extract the archive into a temporary directory, copy only its configured skills/ai-code-tracker source into the target platform path, invoke the copied scripts/install.js with AI_CODE_TRACKER_PROCESS_TREE set to that platform, and invoke it again with --check. Remove staging in finally. The CLI accepts an optional target project and prints selected platforms only after checks pass.

- [ ] **Step 3: Verify the focused test suite is green**

Run: node --test tools/git-code-tracker-release.test.mjs

Expected: PASS, proving automatic Claude detection, ambiguity and unsupported-platform rejection, missing-asset safety, scoped installation, explicit all, initializer execution, and post-install verification.

- [ ] **Step 4: Commit the implementation**

~~~bash
git add skill/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.3.zip skill/scripts/install-git-code-tracker.mjs tools/git-code-tracker-release.test.mjs
git commit -m "feat: install tracker from release asset"
~~~

### Task 3: Migrate Metadata And Documentation

**Files:**
- Modify: skill/bundled-packages.json
- Modify: skill/references/output-assets.md
- Modify: README.md
- Modify: tools/release.test.mjs

- [ ] **Step 1: Replace legacy assertions with release-asset expectations**

~~~js
assert.equal(tracker.source.type, "github-release-asset");
assert.equal(tracker.source.asset, "ai-commit-statistic-skill-v1.0.3.zip");
assert.equal(tracker.asset_path, "packages/git-code-tracker/ai-commit-statistic-skill-v1.0.3.zip");
assert.match(tracker.default_install.command, /scripts\/install-git-code-tracker\.mjs/);
assert.equal(tracker.default_install.auto_detect_platform, true);
~~~

Assert skill/packages/git-code-tracker is absent and the README says the copied skill owns initialization.

- [ ] **Step 2: Verify the changed assertions fail**

Run: node --test tools/release.test.mjs tools/git-code-tracker-release.test.mjs

Expected: FAIL because the legacy manifest, guidance, and vendored source are still present.

- [ ] **Step 3: Update manifest and written guidance**

Set the source to the GitHub release repo/tag/commit plus asset name and asset_path. Set auto_detect_platform to true; retain approval requirements and all upstream initialization outputs in writes. Use this command:

~~~text
node scripts/install-git-code-tracker.mjs <target-project> [--platform <detected-platform>]
~~~

Replace all packages/git-code-tracker instructions in the root README and output-assets.md with the precise archive-copy then copied-skill-initialization flow.

- [ ] **Step 4: Verify focused tests are green**

Run: node --test tools/release.test.mjs tools/git-code-tracker-release.test.mjs

Expected: PASS with no assertion or documentation reference to the vendored package.

- [ ] **Step 5: Commit the metadata migration**

~~~bash
git add skill/bundled-packages.json skill/references/output-assets.md README.md tools/release.test.mjs tools/git-code-tracker-release.test.mjs
git commit -m "docs: describe tracker release asset integration"
~~~

### Task 4: Remove Vendored Repository And Verify Packaging

**Files:**
- Delete: skill/packages/git-code-tracker/
- Modify: Makefile
- Test: tools/release.test.mjs
- Test: tools/git-code-tracker-release.test.mjs

- [ ] **Step 1: Remove the full upstream copy**

Run: git rm -r skill/packages/git-code-tracker

Expected: all upstream source, tests, metadata, and legacy installer are scheduled for deletion.

- [ ] **Step 2: Add the new suite to the normal check command**

~~~make
check:
	node --test tools/release.test.mjs tools/update-agent-seed.test.mjs tools/git-code-tracker-release.test.mjs
~~~

- [ ] **Step 3: Run complete verification**

Run: make check

Expected: PASS.

Run: make release VERSION=v1.0.4-test

Expected: exit code 0; outputs/agent-seed/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.3.zip and outputs/agent-seed/scripts/install-git-code-tracker.mjs both exist.

- [ ] **Step 4: Commit the removal and release coverage**

~~~bash
git add Makefile tools/release.test.mjs tools/git-code-tracker-release.test.mjs skill/bundled-packages.json skill/references/output-assets.md README.md skill/packages/git-code-tracker/ai-commit-statistic-skill-v1.0.3.zip skill/scripts/install-git-code-tracker.mjs
git add -u skill/packages/git-code-tracker
git commit -m "refactor: remove vendored tracker repository"
~~~
