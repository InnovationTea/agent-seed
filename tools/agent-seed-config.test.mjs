import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  migrateAgentSeedConfig,
  readAgentSeedFiles,
  resolveAgentSeedConfig,
  splitLegacyAgentSeedConfig,
  writeLocalAgentSeedState,
} from "../skill/scripts/agent-seed-config.mjs";

test("effective config combines shared policy with local state without local policy override", () => {
  const effective = resolveAgentSeedConfig({
    shared: {
      schema_version: 2,
      minimum_agent_seed_version: "v0.3.8",
      knowledge_asset_write_mode: "agent-approve",
      self_update: { check_on_start: true, update_mode: "notify" },
    },
    local: {
      schema_version: 1,
      installation: { skill_root: "C:/agent-seed" },
      self_update: {
        check_on_start: false,
        proxy: { https_proxy: "http://proxy.example:8080" },
        last_check: { status: "current" },
      },
    },
  });

  assert.equal(effective.minimum_agent_seed_version, "v0.3.8");
  assert.equal(effective.knowledge_asset_write_mode, "agent-approve");
  assert.equal(effective.self_update.check_on_start, true);
  assert.equal(effective.self_update.update_mode, "notify");
  assert.equal(effective.self_update.proxy.https_proxy, "http://proxy.example:8080");
  assert.equal(effective.self_update.last_check.status, "current");
});

test("legacy config is split into shared policy and local state", () => {
  const result = splitLegacyAgentSeedConfig({
    knowledge_asset_write_mode: "full-access",
    self_update: {
      check_on_start: true,
      proxy: { https_proxy: "http://proxy.example:8080" },
      last_check: { status: "updated" },
    },
    installation: { skill_root: "C:/Users/example/.codex/skills/agent-seed" },
    install_prompt_history: [{ integration: "opencli", decision: "declined" }],
    future_field: { keep: true },
  }, "v0.3.7");

  assert.deepEqual(result.shared, {
    schema_version: 2,
    minimum_agent_seed_version: "v0.3.7",
    knowledge_asset_write_mode: "full-access",
    self_update: { check_on_start: true },
  });
  assert.deepEqual(result.local.self_update, {
    proxy: { https_proxy: "http://proxy.example:8080" },
    last_check: { status: "updated" },
  });
  assert.deepEqual(result.local.installation, { skill_root: "C:/Users/example/.codex/skills/agent-seed" });
  assert.deepEqual(result.local.install_prompt_history, [{ integration: "opencli", decision: "declined" }]);
  assert.deepEqual(result.local.legacy_unclassified, { future_field: { keep: true } });
});

test("legacy split preserves an approved baseline newer than the installed version", () => {
  const result = splitLegacyAgentSeedConfig({
    minimum_agent_seed_version: "v0.4.0",
    knowledge_asset_write_mode: "full-access",
  }, "v0.3.8");

  assert.equal(result.shared.minimum_agent_seed_version, "v0.4.0");
});

test("migration keeps a newer existing local value and is idempotent", async () => {
  const targetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-config-"));
  try {
    const agentsDir = path.join(targetDir, ".agents");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, "agent-seed.json"), `${JSON.stringify({
      knowledge_asset_write_mode: "full-access",
      self_update: { check_on_start: true, last_check: { status: "old" } },
      install_prompt_history: [{ integration: "opencli", decision: "declined" }],
    })}\n`);
    await writeFile(path.join(agentsDir, "agent-seed.local.json"), `${JSON.stringify({
      schema_version: 1,
      self_update: { last_check: { status: "newer" } },
      install_prompt_history: [{ integration: "opencli", decision: "declined" }],
    })}\n`);

    const first = await migrateAgentSeedConfig({ targetDir, installedVersion: "v0.3.8" });
    assert.equal(first.status, "migrated");

    const files = await readAgentSeedFiles(targetDir);
    assert.equal(files.shared.minimum_agent_seed_version, "v0.3.8");
    assert.equal(files.local.self_update.last_check.status, "newer");
    assert.equal(files.local.install_prompt_history.length, 1);

    const second = await migrateAgentSeedConfig({ targetDir, installedVersion: "v0.3.8" });
    assert.equal(second.status, "current");
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
});

test("local state writer does not modify shared policy", async () => {
  const targetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-local-write-"));
  try {
    const agentsDir = path.join(targetDir, ".agents");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, "agent-seed.json"), `${JSON.stringify({
      schema_version: 2,
      minimum_agent_seed_version: "v0.3.8",
      knowledge_asset_write_mode: "agent-approve",
      self_update: { check_on_start: true },
    })}\n`);
    await writeLocalAgentSeedState({ targetDir, patch: { self_update: { last_check: { status: "current" } } } });

    const shared = JSON.parse(await readFile(path.join(agentsDir, "agent-seed.json"), "utf8"));
    const local = JSON.parse(await readFile(path.join(agentsDir, "agent-seed.local.json"), "utf8"));
    assert.deepEqual(shared.self_update, { check_on_start: true });
    assert.deepEqual(local.self_update.last_check, { status: "current" });
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
});

test("migration leaves a malformed legacy file unchanged", async () => {
  const targetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-invalid-"));
  try {
    const agentsDir = path.join(targetDir, ".agents");
    const sharedPath = path.join(agentsDir, "agent-seed.json");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(sharedPath, "{ invalid json\n");

    await assert.rejects(migrateAgentSeedConfig({ targetDir, installedVersion: "v0.3.8" }), SyntaxError);
    assert.equal(await readFile(sharedPath, "utf8"), "{ invalid json\n");
    await assert.rejects(readFile(path.join(agentsDir, "agent-seed.local.json"), "utf8"), { code: "ENOENT" });
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
});

test("migration requires a valid split-capable installed version before writing", async () => {
  const targetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-no-version-"));
  try {
    const agentsDir = path.join(targetDir, ".agents");
    const sharedPath = path.join(agentsDir, "agent-seed.json");
    const legacy = `${JSON.stringify({ knowledge_asset_write_mode: "full-access" })}\n`;
    await mkdir(agentsDir, { recursive: true });
    await writeFile(sharedPath, legacy);

    await assert.rejects(
      migrateAgentSeedConfig({ targetDir, installedVersion: "" }),
      /valid installed Agent Seed version/,
    );
    assert.equal(await readFile(sharedPath, "utf8"), legacy);
    await assert.rejects(readFile(path.join(agentsDir, "agent-seed.local.json"), "utf8"), { code: "ENOENT" });
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
});
