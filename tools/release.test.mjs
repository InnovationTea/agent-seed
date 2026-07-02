import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { releaseSkill } from "./release.mjs";

test("releaseSkill creates an expanded skill directory and zip package", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-runbook-distiller-release-"));

  try {
    const skillDir = path.join(rootDir, "skill");
    await mkdir(path.join(skillDir, "references"), { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: agent-runbook-distiller\n---\n");
    await writeFile(path.join(skillDir, "references", "guide.md"), "# Guide\n");

    const result = await releaseSkill({
      rootDir,
      skillDir: path.join(rootDir, "skill"),
      outputDir: path.join(rootDir, "outputs"),
    });

    assert.equal(path.basename(result.expandedDir), "agent-runbook-distiller");
    assert.equal(path.basename(result.zipPath), "agent-runbook-distiller.zip");
    assert.equal(await readFile(path.join(result.expandedDir, "SKILL.md"), "utf8"), "---\nname: agent-runbook-distiller\n---\n");
    assert.equal(await readFile(path.join(result.expandedDir, "references", "guide.md"), "utf8"), "# Guide\n");

    const zipStat = await stat(result.zipPath);
    assert.ok(zipStat.size > 0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("recommended external plugins config includes install metadata", async () => {
  const configPath = path.join(process.cwd(), "skill", "recommended-external-plugins.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));

  assert.ok(Array.isArray(config.recommended_external_plugins));
  assert.ok(config.recommended_external_plugins.length > 0);

  for (const plugin of config.recommended_external_plugins) {
    assert.equal(typeof plugin.name, "string");
    assert.notEqual(plugin.name.trim(), "");
    assert.equal(typeof plugin.display_name, "string");
    assert.notEqual(plugin.display_name.trim(), "");
    assert.equal(typeof plugin.purpose, "string");
    assert.notEqual(plugin.purpose.trim(), "");
    assert.equal(typeof plugin.use_when, "string");
    assert.notEqual(plugin.use_when.trim(), "");
    assert.equal(typeof plugin.do_not_vendor_unless_explicitly_requested, "boolean");

    assert.equal(typeof plugin.default_recommendation.requires_network, "boolean");
    assert.equal(typeof plugin.default_recommendation.requires_user_approval, "boolean");
    assert.equal(typeof plugin.default_recommendation.safety_level, "string");
    assert.notEqual(plugin.default_recommendation.safety_level.trim(), "");

    assert.ok(Array.isArray(plugin.platforms));
    assert.ok(plugin.platforms.length > 0);

    for (const platform of plugin.platforms) {
      assert.equal(typeof platform.platform, "string");
      assert.notEqual(platform.platform.trim(), "");
      assert.equal(typeof platform.install_action, "string");
      assert.notEqual(platform.install_action.trim(), "");
      assert.ok(Array.isArray(platform.detection_evidence));
      assert.ok(platform.detection_evidence.length > 0);
      assert.ok(platform.detection_evidence.every((entry) => typeof entry === "string" && entry.trim() !== ""));
      assert.equal(typeof platform.verification, "string");
      assert.notEqual(platform.verification.trim(), "");
    }
  }
});

test("external plugin prose stays configuration driven", async () => {
  const rootDir = process.cwd();
  const configPath = path.join(rootDir, "skill", "recommended-external-plugins.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const pluginTerms = config.recommended_external_plugins.flatMap((plugin) => [plugin.name, plugin.display_name]);
  const files = [path.join(rootDir, "README.md"), ...(await markdownFiles(path.join(rootDir, "skill")))]
    .filter((filePath) => path.normalize(filePath) !== path.normalize(configPath));

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    for (const term of pluginTerms) {
      assert.equal(
        content.toLowerCase().includes(term.toLowerCase()),
        false,
        `${path.relative(rootDir, filePath)} hardcodes external plugin term "${term}"`
      );
    }
  }
});

test("framework knowledge config registers valid built-in knowledge packs", async () => {
  const rootDir = process.cwd();
  const configPath = path.join(rootDir, "skill", "framework-knowledge.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));

  assert.ok(Array.isArray(config.framework_knowledge));
  assert.ok(config.framework_knowledge.length > 0);

  const nuwa = config.framework_knowledge.find((entry) => entry.name === "nuwa");
  assert.ok(nuwa, "expected Nuwa framework knowledge entry");
  assert.equal(nuwa.knowledge_path, "references/frameworks/nuwa.md");

  for (const entry of config.framework_knowledge) {
    assert.equal(typeof entry.name, "string");
    assert.notEqual(entry.name.trim(), "");
    assert.equal(typeof entry.display_name, "string");
    assert.notEqual(entry.display_name.trim(), "");
    assert.ok(Array.isArray(entry.aliases));
    assert.ok(entry.aliases.length > 0);
    assert.ok(entry.aliases.every((alias) => typeof alias === "string" && alias.trim() !== ""));

    assert.ok(Array.isArray(entry.fingerprints.search_terms));
    assert.ok(entry.fingerprints.search_terms.length > 0);
    assert.ok(entry.fingerprints.search_terms.every((term) => typeof term === "string" && term.trim() !== ""));

    assert.ok(Array.isArray(entry.fingerprints.file_patterns));
    assert.ok(entry.fingerprints.file_patterns.length > 0);
    assert.ok(entry.fingerprints.file_patterns.every((pattern) => typeof pattern === "string" && pattern.trim() !== ""));

    assert.equal(typeof entry.knowledge_path, "string");
    assert.match(entry.knowledge_path, /^references\/frameworks\/.+\.md$/);
    await stat(path.join(rootDir, "skill", entry.knowledge_path));

    assert.ok(Array.isArray(entry.project_local.registry_paths));
    assert.ok(entry.project_local.registry_paths.length > 0);
    assert.ok(Array.isArray(entry.project_local.knowledge_paths));
    assert.ok(entry.project_local.knowledge_paths.length > 0);

    assert.ok(Array.isArray(entry.source_policy.labels));
    assert.deepEqual(entry.source_policy.labels, [
      "Preset",
      "Repo-confirmed",
      "Owner-confirmed",
      "Inferred",
      "Unknown",
    ]);
    assert.equal(entry.source_policy.preset_may_confirm_project_facts, false);
    assert.equal(entry.safety.stay_inside_target_root, true);
    assert.equal(entry.safety.external_sdk_inspection_requires_user_request, true);
  }
});

test("framework-specific prose stays in framework knowledge packs", async () => {
  const rootDir = process.cwd();
  const allowedFiles = new Set([
    path.normalize(path.join(rootDir, "skill", "framework-knowledge.json")),
    path.normalize(path.join(rootDir, "skill", "references", "frameworks", "nuwa.md")),
    path.normalize(path.join(rootDir, "skill", "references", "framework-fingerprints.md")),
    path.normalize(path.join(rootDir, "README.md")),
  ]);
  const files = [path.join(rootDir, "README.md"), ...(await markdownFiles(path.join(rootDir, "skill")))].filter(
    (filePath) => !allowedFiles.has(path.normalize(filePath))
  );

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    assert.equal(
      /\bNuwa\b/i.test(content),
      false,
      `${path.relative(rootDir, filePath)} hardcodes Nuwa prose outside framework knowledge routing`
    );
  }
});

async function markdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await markdownFiles(entryPath)));
    } else if (entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}
