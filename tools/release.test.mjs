import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { releaseSkill } from "./release.mjs";

test("releaseSkill creates an expanded skill directory and zip package", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-release-"));

  try {
    const skillDir = path.join(rootDir, "skill");
    await mkdir(path.join(skillDir, "references"), { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: agent-seed\n---\n");
    await writeFile(path.join(skillDir, "references", "guide.md"), "# Guide\n");

    const result = await releaseSkill({
      rootDir,
      skillDir: path.join(rootDir, "skill"),
      outputDir: path.join(rootDir, "outputs"),
    });

    assert.equal(path.basename(result.expandedDir), "agent-seed");
    assert.equal(path.basename(result.zipPath), "agent-seed.zip");
    assert.equal(await readFile(path.join(result.expandedDir, "SKILL.md"), "utf8"), "---\nname: agent-seed\n---\n");
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

test("recommended external plugins include DevEco CLI for HarmonyOS projects", async () => {
  const configPath = path.join(process.cwd(), "skill", "recommended-external-plugins.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const deveco = config.recommended_external_plugins.find((plugin) => plugin.name === "deveco-cli");

  assert.ok(deveco, "expected DevEco CLI recommendation");
  assert.match(deveco.display_name, /DevEco CLI/);
  assert.match(deveco.purpose, /HarmonyOS/);
  assert.match(deveco.use_when, /HarmonyOS|OpenHarmony|ArkUI|ArkTS/);
  assert.match(deveco.use_when, /DevEco Toolbox|deveco-toolbox|@deveco-codegenie\/mcp/);
  assert.equal(deveco.default_recommendation.requires_network, true);
  assert.equal(deveco.default_recommendation.requires_user_approval, true);
  assert.equal(deveco.default_recommendation.safety_level, "ask-first");
  assert.match(deveco.default_recommendation.recommend_by_default_when, /HarmonyOS/i);
  assert.match(deveco.default_recommendation.recommend_by_default_when, /DevEco Toolbox|@deveco-codegenie\/mcp/);
  assert.ok(deveco.platforms.some((platform) => /npm install -g @deveco\/deveco-cli@latest/.test(platform.install_action)));
  assert.ok(deveco.platforms.some((platform) => platform.detection_evidence.some((entry) => /oh-package\.json5/.test(entry))));
  assert.ok(deveco.platforms.some((platform) => platform.detection_evidence.some((entry) => /build-profile\.json5/.test(entry))));
  assert.ok(deveco.platforms.some((platform) => platform.detection_evidence.some((entry) => /module\.json5/.test(entry))));
  assert.ok(deveco.platforms.some((platform) => platform.detection_evidence.some((entry) => /DevEco Toolbox|deveco-toolbox|@deveco-codegenie\/mcp/.test(entry))));
  assert.ok(deveco.platforms.some((platform) => platform.verification.includes("devecocli --version")));
});

test("recommended external plugins do not default to archived DevEco Toolbox", async () => {
  const configPath = path.join(process.cwd(), "skill", "recommended-external-plugins.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));

  assert.equal(
    config.recommended_external_plugins.some((plugin) => /deveco-toolbox|DevEco Toolbox/i.test(`${plugin.name} ${plugin.display_name}`)),
    false
  );
});

test("Codex default prompt tells agents to offer default bundled package installs", async () => {
  const promptPath = path.join(process.cwd(), "skill", "agents", "openai.yaml");
  const prompt = await readFile(promptPath, "utf8");

  assert.match(prompt, /bundled-packages\.json/);
  assert.match(prompt, /offer default/i);
  assert.match(prompt, /approval/i);
});

test("skill identity uses Agent Seed naming", async () => {
  const skillPath = path.join(process.cwd(), "skill", "SKILL.md");
  const promptPath = path.join(process.cwd(), "skill", "agents", "openai.yaml");
  const skill = await readFile(skillPath, "utf8");
  const prompt = await readFile(promptPath, "utf8");

  assert.match(skill, /^name: agent-seed$/m);
  assert.match(skill, /^# Agent Seed$/m);
  assert.match(prompt, /display_name: "Agent Seed"/);
  assert.match(prompt, /\$agent-seed/);
});

test("core skill instructions require cross-platform default package install offers", async () => {
  const skillPath = path.join(process.cwd(), "skill", "SKILL.md");
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /Every onboarding run/i);
  assert.match(skill, /bundled-packages\.json/);
  assert.match(skill, /default_install\.offer_by_default/);
  assert.match(skill, /Codex, Claude Code, OpenCode/);
  assert.match(skill, /approval/i);
});

test("knowledge asset write mode is persistent and documented across write workflows", async () => {
  const rootDir = process.cwd();
  const files = [
    path.join(rootDir, "skill", "SKILL.md"),
    path.join(rootDir, "skill", "references", "output-assets.md"),
    path.join(rootDir, "skill", "references", "update-existing-assets.md"),
  ];

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    assert.match(content, /\.agents\/agent-seed\.json/, path.relative(rootDir, filePath));
    assert.match(content, /knowledge_asset_write_mode/, path.relative(rootDir, filePath));
    assert.match(content, /ask-each-change/, path.relative(rootDir, filePath));
    assert.match(content, /agent-approve/, path.relative(rootDir, filePath));
    assert.match(content, /full-access/, path.relative(rootDir, filePath));
  }

  const skill = await readFile(path.join(rootDir, "skill", "SKILL.md"), "utf8");
  assert.match(skill, /default to `ask-each-change`/i);
  assert.match(skill, /current user request wins/i);
});

test("external plugin prose stays configuration driven", async () => {
  const rootDir = process.cwd();
  const configPath = path.join(rootDir, "skill", "recommended-external-plugins.json");
  const skillPath = path.join(rootDir, "skill", "SKILL.md");
  const frameworkPackPaths = new Set([
    path.normalize(path.join(rootDir, "skill", "references", "frameworks", "nuwa.md")),
    path.normalize(path.join(rootDir, "skill", "references", "frameworks", "harmonyos.md")),
  ]);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const pluginTerms = config.recommended_external_plugins.flatMap((plugin) => [plugin.name, plugin.display_name]);
  const files = [path.join(rootDir, "README.md"), ...(await markdownFiles(path.join(rootDir, "skill")))]
    .filter((filePath) => ![configPath, skillPath].map((allowedPath) => path.normalize(allowedPath)).includes(path.normalize(filePath)))
    .filter((filePath) => !frameworkPackPaths.has(path.normalize(filePath)));

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

test("core skill instructions define Superpowers SDD as an ask-first external workflow", async () => {
  const skillPath = path.join(process.cwd(), "skill", "SKILL.md");
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /Superpowers/i);
  assert.match(skill, /recommended-external-plugins\.json/);
  assert.match(skill, /not visible/i);
  assert.match(skill, /recommend installing/i);
  assert.match(skill, /approval/i);
  assert.match(skill, /superpowers:brainstorming/);
  assert.match(skill, /superpowers:writing-plans/);
  assert.match(skill, /superpowers:subagent-driven-development/);
  assert.match(skill, /superpowers:executing-plans/);
  assert.match(skill, /superpowers:test-driven-development/);
  assert.match(skill, /superpowers:systematic-debugging/);
  assert.match(skill, /superpowers:verification-before-completion/);
  assert.match(skill, /superpowers:requesting-code-review/);
  assert.match(skill, /superpowers:receiving-code-review/);
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
  const harmonyos = config.framework_knowledge.find((entry) => entry.name === "harmonyos");
  assert.ok(harmonyos, "expected HarmonyOS framework knowledge entry");
  assert.equal(harmonyos.knowledge_path, "references/frameworks/harmonyos.md");

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
    path.normalize(path.join(rootDir, "skill", "references", "frameworks", "harmonyos.md")),
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

test("HarmonyOS framework knowledge includes DevEco CLI tooling guidance", async () => {
  const rootDir = process.cwd();
  const configPath = path.join(rootDir, "skill", "framework-knowledge.json");
  const harmonyosPath = path.join(rootDir, "skill", "references", "frameworks", "harmonyos.md");
  const config = await readFile(configPath, "utf8");
  const harmonyos = await readFile(harmonyosPath, "utf8");

  assert.match(config, /devecocli/);
  assert.match(config, /DevEco CLI/);
  assert.match(harmonyos, /DevEco CLI/);
  assert.match(harmonyos, /@deveco\/deveco-cli@latest/);
  assert.match(harmonyos, /Node\.js >= 18/);
  assert.match(harmonyos, /DevEco Studio >= 6\.1\.0/);
  assert.match(harmonyos, /devecocli build/);
  assert.match(harmonyos, /devecocli run/);
  assert.match(harmonyos, /devecocli device list/);
  assert.match(harmonyos, /devecocli emulator list/);
  assert.match(harmonyos, /devecocli log/);
  assert.match(harmonyos, /devecocli docs search/);
  assert.match(harmonyos, /devecocli docs read/);
  assert.match(harmonyos, /devecocli init --mcp/);
  assert.match(harmonyos, /devecocli serve mcp/);
  assert.match(harmonyos, /devecocli skills list/);
  assert.match(harmonyos, /ask first/i);
  assert.match(harmonyos, /Preset/);
});

test("HarmonyOS framework knowledge treats DevEco Toolbox as archived fallback tooling", async () => {
  const rootDir = process.cwd();
  const configPath = path.join(rootDir, "skill", "framework-knowledge.json");
  const harmonyosPath = path.join(rootDir, "skill", "references", "frameworks", "harmonyos.md");
  const config = await readFile(configPath, "utf8");
  const harmonyos = await readFile(harmonyosPath, "utf8");

  assert.match(config, /deveco-toolbox/);
  assert.match(config, /@deveco-codegenie\/mcp/);
  assert.match(harmonyos, /DevEco Toolbox/);
  assert.match(harmonyos, /archived/i);
  assert.match(harmonyos, /not recommend/i);
  assert.match(harmonyos, /recommend DevEco CLI/i);
  assert.match(harmonyos, /DevEco CLI/);
  assert.match(harmonyos, /deveco-mcp-server/);
  assert.match(harmonyos, /@deveco-codegenie\/mcp@beta/);
  assert.match(harmonyos, /DEVECO_PATH/);
  assert.match(harmonyos, /ask first/i);
});

test("Nuwa framework knowledge stays independent from HarmonyOS tooling", async () => {
  const rootDir = process.cwd();
  const configPath = path.join(rootDir, "skill", "framework-knowledge.json");
  const nuwaPath = path.join(rootDir, "skill", "references", "frameworks", "nuwa.md");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const nuwa = config.framework_knowledge.find((entry) => entry.name === "nuwa");
  const nuwaMarkdown = await readFile(nuwaPath, "utf8");
  const nuwaTerms = [...nuwa.aliases, ...nuwa.fingerprints.search_terms, ...nuwa.fingerprints.file_patterns].join("\n");

  assert.doesNotMatch(nuwaTerms, /harmony|openharmony|arkui|arkts|devecocli|deveco|oh-package|build-profile|hvigor|ohpm|hdc|hilog|module\.json5|app\.json5/i);
  assert.doesNotMatch(nuwaMarkdown, /DevEco CLI|devecocli|@deveco\/deveco-cli|oh-package|build-profile|hvigor|ohpm|hdc|hilog/i);
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
