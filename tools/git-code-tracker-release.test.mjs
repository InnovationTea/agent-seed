import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { installGitCodeTracker, selectPlatforms } from "../skill/scripts/install-git-code-tracker.mjs";

const execFileAsync = promisify(execFile);
const archivePath = path.join(process.cwd(), "skill", "packages", "git-code-tracker", "ai-commit-statistic-skill-v1.0.3.zip");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createGitRepository() {
  const targetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-tracker-install-"));
  await execFileAsync("git", ["init"], { cwd: targetDir });
  return targetDir;
}

test("selectPlatforms detects the only project platform", async () => {
  const targetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-tracker-detect-"));

  try {
    await mkdir(path.join(targetDir, ".claude"));

    assert.deepEqual(await selectPlatforms({ targetDir, env: {} }), ["claude"]);
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
});

test("selectPlatforms rejects conflicting project platforms", async () => {
  const targetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-tracker-ambiguous-"));

  try {
    await Promise.all([mkdir(path.join(targetDir, ".claude")), mkdir(path.join(targetDir, ".cac"))]);

    await assert.rejects(
      selectPlatforms({ targetDir, env: {} }),
      /Unable to determine a single target platform/,
    );
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
});

test("selectPlatforms rejects an unsupported explicit platform", async () => {
  await assert.rejects(
    selectPlatforms({ targetDir: process.cwd(), platform: "codex", env: {} }),
    /Unsupported platform: codex/,
  );
});

test("installGitCodeTracker copies and initializes only the detected Claude asset", async () => {
  const targetDir = await createGitRepository();

  try {
    await mkdir(path.join(targetDir, ".claude"));

    await installGitCodeTracker({ targetDir, env: {}, archivePath });

    assert.equal(await exists(path.join(targetDir, ".claude", "skills", "ai-code-tracker", "SKILL.md")), true);
    assert.equal(await exists(path.join(targetDir, ".opencode", "skills", "ai-code-tracker", "SKILL.md")), false);
    assert.equal(await exists(path.join(targetDir, ".cac", "skills", "ai-code-tracker", "SKILL.md")), false);
    assert.match(await readFile(path.join(targetDir, "AGENTS.md"), "utf8"), /Claude Code skill `ai-code-tracker`/);
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
});

test("installGitCodeTracker initializes every explicitly requested platform", async () => {
  const targetDir = await createGitRepository();

  try {
    await installGitCodeTracker({ targetDir, platform: "all", env: {}, archivePath });

    for (const platformDir of [".claude", ".opencode", ".cac"]) {
      assert.equal(await exists(path.join(targetDir, platformDir, "skills", "ai-code-tracker", "SKILL.md")), true);
    }
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
});

test("installGitCodeTracker fails before copying when the release asset is missing", async () => {
  const targetDir = await createGitRepository();

  try {
    await mkdir(path.join(targetDir, ".claude"));

    await assert.rejects(
      installGitCodeTracker({ targetDir, env: {}, archivePath: path.join(targetDir, "missing.zip") }),
      /Missing release asset/,
    );
    assert.equal(await exists(path.join(targetDir, ".claude", "skills", "ai-code-tracker")), false);
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
});
