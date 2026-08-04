import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import * as manager from "../skill/scripts/manage-managed-skills.mjs";

const execFileAsync = promisify(execFile);

test("inspectManagedUpdates reports current, available, missing, and legacy direct skills", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-managed-inspect-"));
  const skillRoot = path.join(rootDir, "skill-root");
  const targetDir = path.join(rootDir, "target");

  try {
    await writeManifest(skillRoot);
    await mkdir(path.join(targetDir, "skills", "gitpush"), { recursive: true });
    await mkdir(path.join(targetDir, "skills", "gittag"), { recursive: true });
    await mkdir(path.join(targetDir, "skills", "gitsync"), { recursive: true });
    await mkdir(path.join(targetDir, ".agents"), { recursive: true });
    await writeFile(
      path.join(targetDir, ".agents", "managed-skills.json"),
      `${JSON.stringify({
        schema_version: 1,
        managed_skills: [
          record("gitpush", "v1.0.0"),
          record("gittag", "v1.1.0"),
          record("gitsync", "v1.1.0"),
        ],
        external_integrations: [],
      })}\n`,
    );
    await rm(path.join(targetDir, "skills", "gitsync"), { recursive: true });

    const report = await manager.inspectManagedUpdates({ skillRoot, targetDir, platform: "codex" });

    assert.deepEqual(
      report.managed.map(({ name, state, installed_version, available_version }) => ({ name, state, installed_version, available_version })),
      [
        { name: "gitpush", state: "update-available", installed_version: "v1.0.0", available_version: "v1.1.0" },
        { name: "gittag", state: "current", installed_version: "v1.1.0", available_version: "v1.1.0" },
        { name: "gitsync", state: "missing", installed_version: "v1.1.0", available_version: "v1.1.0" },
      ],
    );

    await rm(path.join(targetDir, ".agents", "managed-skills.json"));
    const legacy = await manager.inspectManagedUpdates({ skillRoot, targetDir, platform: "codex" });
    assert.equal(legacy.managed.find((entry) => entry.name === "gitpush").state, "legacy-unmanaged");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("readManagedState returns an empty state for an unmanaged project", async () => {
  const targetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-managed-state-"));

  try {
    assert.deepEqual(await manager.readManagedState(targetDir), {
      schema_version: 2,
      managed_skills: [],
      external_integrations: [],
      declined_install_offers: [],
    });
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
});

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

    await writeManifest(skillRoot, "v1.2.0");
    const upgraded = await manager.inspectManagedUpdates({ skillRoot, targetDir, platform: "codex" });
    assert.equal(upgraded.managed.find((entry) => entry.name === "gitpush").state, "install-available");
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

test("applyManagedUpdate replaces an approved direct skill and records its version", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-managed-apply-"));
  const skillRoot = path.join(rootDir, "skill-root");
  const targetDir = path.join(rootDir, "target");

  try {
    await writeManifest(skillRoot);
    await mkdir(path.join(skillRoot, "bundled-skills", "gitpush", "skill"), { recursive: true });
    await writeFile(path.join(skillRoot, "bundled-skills", "gitpush", "skill", "SKILL.md"), "new skill\n");
    await mkdir(path.join(targetDir, "skills", "gitpush"), { recursive: true });
    await writeFile(path.join(targetDir, "skills", "gitpush", "SKILL.md"), "old skill\n");

    await manager.applyManagedUpdate({ skillRoot, targetDir, name: "gitpush", platform: "codex", approved: true });

    assert.equal(await readFile(path.join(targetDir, "skills", "gitpush", "SKILL.md"), "utf8"), "new skill\n");
    assert.equal((await manager.readManagedState(targetDir)).managed_skills[0].version, "v1.1.0");
    await assert.rejects(
      manager.applyManagedUpdate({ skillRoot, targetDir, name: "gitpush", platform: "codex", approved: false }),
      /Owner approval is required/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("applyManagedUpdate restores package write roots when its installer fails", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-managed-package-"));
  const skillRoot = path.join(rootDir, "skill-root");
  const targetDir = path.join(rootDir, "target");

  try {
    await writePackageManifest(skillRoot);
    await mkdir(path.join(targetDir, "skills", "tracker"), { recursive: true });
    await writeFile(path.join(targetDir, "skills", "tracker", "SKILL.md"), "old tracker\n");

    await assert.rejects(
      manager.applyManagedUpdate({
        skillRoot,
        targetDir,
        name: "tracker",
        platform: "codex",
        approved: true,
        installPackage: async () => {
          await rm(path.join(targetDir, "skills", "tracker"), { recursive: true });
          await mkdir(path.join(targetDir, "skills", "tracker"), { recursive: true });
          await writeFile(path.join(targetDir, "skills", "tracker", "SKILL.md"), "broken tracker\n");
          throw new Error("installer failed");
        },
      }),
      /installer failed/,
    );

    assert.equal(await readFile(path.join(targetDir, "skills", "tracker", "SKILL.md"), "utf8"), "old tracker\n");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("managed update CLI check is read-only and apply requires approval", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-managed-cli-"));
  const skillRoot = path.join(rootDir, "skill-root");
  const targetDir = path.join(rootDir, "target");
  const script = path.join(process.cwd(), "skill", "scripts", "manage-managed-skills.mjs");

  try {
    await writeManifest(skillRoot);
    await mkdir(path.join(targetDir, "skills", "gitpush"), { recursive: true });
    const { stdout } = await execFileAsync(process.execPath, [script, "check", targetDir, "--platform", "codex", "--skill-root", skillRoot, "--json"]);

    assert.equal(JSON.parse(stdout).managed[0].state, "legacy-unmanaged");
    const declined = await execFileAsync(process.execPath, [
      script,
      "decline",
      targetDir,
      "--name",
      "gittag",
      "--platform",
      "codex",
      "--skill-root",
      skillRoot,
      "--confirmed",
      "--json",
    ]);
    assert.equal(JSON.parse(declined.stdout).offered_version, "v1.1.0");
    await assert.rejects(
      execFileAsync(process.execPath, [script, "apply", targetDir, "--name", "gitpush", "--platform", "codex", "--skill-root", skillRoot]),
      /--approved/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

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
    const local = JSON.parse(await readFile(path.join(targetDir, ".agents", "agent-seed.local.json"), "utf8"));
    assert.deepEqual(local.managed_skills.declined_install_offers, [decline]);
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

test("installing agent-seed-updater returns the startup-rule migration action", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-managed-post-install-"));
  const skillRoot = path.join(rootDir, "skill-root");
  const targetDir = path.join(rootDir, "target");

  try {
    await writeManifest(skillRoot);
    const manifestPath = path.join(skillRoot, "bundled-skills.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.bundled_skills.push({
      name: "agent-seed-updater",
      version: "v1.1.0",
      source_path: "bundled-skills/agent-seed-updater/skill",
      default_install: { offer_by_default: true },
      post_install: {
        action: "ensure-agent-seed-updater-startup-rule",
        requires_user_approval: true,
        instruction_files: ["AGENTS.md", "CLAUDE.md"],
      },
      platforms: [{ platform: "codex", target_path: "skills/agent-seed-updater" }],
    });
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
    await mkdir(path.join(skillRoot, "bundled-skills", "agent-seed-updater", "skill"), { recursive: true });
    await writeFile(path.join(skillRoot, "bundled-skills", "agent-seed-updater", "skill", "SKILL.md"), "updater\n");

    const result = await manager.applyManagedUpdate({
      skillRoot,
      targetDir,
      name: "agent-seed-updater",
      platform: "codex",
      approved: true,
    });

    assert.equal(result.status, "installed");
    assert.deepEqual(result.post_install, {
      action: "ensure-agent-seed-updater-startup-rule",
      requires_user_approval: true,
      instruction_files: ["AGENTS.md", "CLAUDE.md"],
    });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("external integrations record ownership and require approval for native updates", async () => {
  const targetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-external-state-"));

  try {
    const state = await manager.recordExternalIntegration({
      targetDir,
      name: "opencli",
      platform: "codex",
      ownership: "agent-seed-assisted",
      version: "unknown",
    });
    assert.deepEqual(state.external_integrations, [{ name: "opencli", platform: "codex", ownership: "agent-seed-assisted", version: "unknown" }]);
    await assert.rejects(manager.applyExternalUpdate({ approved: false, nativeUpdate: async () => true }), /Owner approval is required/);
    let invoked = false;
    assert.equal(await manager.applyExternalUpdate({ approved: true, nativeUpdate: async () => { invoked = true; } }), true);
    assert.equal(invoked, true);
    const report = await manager.inspectManagedUpdates({ skillRoot: await createEmptySkillRoot(targetDir), targetDir, platform: "codex" });
    assert.equal(report.external[0].state, "version-unknown");
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
});

function record(name, version) {
  return {
    name,
    kind: "direct-skill",
    version,
    platform: "codex",
    target_path: `skills/${name}`,
    source: `bundled-skills/${name}/skill`,
  };
}

async function writeManifest(skillRoot, version = "v1.1.0") {
  await mkdir(skillRoot, { recursive: true });
  await writeFile(
    path.join(skillRoot, "bundled-skills.json"),
    `${JSON.stringify({
      bundled_skills: ["gitpush", "gittag", "gitsync"].map((name) => ({
      name,
      version,
      kind: "multi-platform-direct-skill",
      source_path: `bundled-skills/${name}/skill`,
      default_install: { offer_by_default: true },
      platforms: [{ platform: "codex", target_path: `skills/${name}` }],
      })),
    })}\n`,
  );
  await writeFile(path.join(skillRoot, "bundled-packages.json"), '{"bundled_packages":[]}\n');
}

async function writePackageManifest(skillRoot) {
  await mkdir(skillRoot, { recursive: true });
  await writeFile(path.join(skillRoot, "bundled-skills.json"), '{"bundled_skills":[]}\n');
  await writeFile(
    path.join(skillRoot, "bundled-packages.json"),
    `${JSON.stringify({
      bundled_packages: [{
        name: "tracker",
        version: "v1.1.0",
        default_install: { writes: ["skills/tracker"] },
        platform_skills: [{ platform: "codex", target_path: "skills/tracker" }],
      }],
    })}\n`,
  );
}

async function createEmptySkillRoot(targetDir) {
  const skillRoot = path.join(targetDir, "skill-root");
  await mkdir(skillRoot, { recursive: true });
  await writeFile(path.join(skillRoot, "bundled-skills.json"), '{"bundled_skills":[]}\n');
  await writeFile(path.join(skillRoot, "bundled-packages.json"), '{"bundled_packages":[]}\n');
  return skillRoot;
}
