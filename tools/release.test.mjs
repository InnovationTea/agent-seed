import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { releaseSkill } from "./release.mjs";

const execFileAsync = promisify(execFile);

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

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

test("releaseSkill packages bundled direct skills from the manifest", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-release-bundled-"));

  try {
    const skillDir = path.join(rootDir, "skill");
    const bundledSkillDir = path.join(skillDir, "bundled-skills", "alpha-tool", "skill");
    const codexOverlayDir = path.join(skillDir, "bundled-skills", "alpha-tool", "overlays", "codex");

    await mkdir(path.join(bundledSkillDir, "references"), { recursive: true });
    await mkdir(path.join(codexOverlayDir, "agents"), { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: agent-seed\n---\n");
    await writeFile(path.join(bundledSkillDir, "SKILL.md"), "---\nname: alpha-tool\n---\n");
    await writeFile(path.join(bundledSkillDir, "references", "guide.md"), "# Alpha\n");
    await writeFile(path.join(codexOverlayDir, "agents", "openai.yaml"), "version: 1\n");
    await writeFile(
      path.join(skillDir, "bundled-skills.json"),
      `${JSON.stringify(
        {
          bundled_skills: [
            {
              name: "alpha-tool",
              source_path: "bundled-skills/alpha-tool/skill",
              platforms: [
                {
                  platform: "codex",
                  overlay_path: "bundled-skills/alpha-tool/overlays/codex",
                },
              ],
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    await releaseSkill({
      rootDir,
      skillDir: path.join(rootDir, "skill"),
      outputDir: path.join(rootDir, "outputs"),
    });

    const bundledOutputDir = path.join(rootDir, "outputs", "bundled-skills");
    assert.equal(
      await readFile(path.join(bundledOutputDir, "alpha-tool", "SKILL.md"), "utf8"),
      "---\nname: alpha-tool\n---\n",
    );
    assert.equal(
      await readFile(path.join(bundledOutputDir, "alpha-tool", "references", "guide.md"), "utf8"),
      "# Alpha\n",
    );
    assert.equal(
      await readFile(path.join(bundledOutputDir, "alpha-tool-codex", "agents", "openai.yaml"), "utf8"),
      "version: 1\n",
    );

    assert.ok((await stat(path.join(bundledOutputDir, "alpha-tool.zip"))).size > 0);
    assert.ok((await stat(path.join(bundledOutputDir, "alpha-tool-codex.zip"))).size > 0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("releaseSkill writes package version metadata and a release manifest", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-release-version-"));

  try {
    const skillDir = path.join(rootDir, "skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: agent-seed\n---\n");

    const result = await releaseSkill({
      rootDir,
      skillDir,
      outputDir: path.join(rootDir, "outputs"),
      version: "v2.3.4",
      repository: "owner/agent-seed",
      commit: "0123456789abcdef",
    });

    const versionMetadata = JSON.parse(await readFile(path.join(result.expandedDir, "VERSION.json"), "utf8"));
    assert.equal(versionMetadata.name, "agent-seed");
    assert.equal(versionMetadata.version, "v2.3.4");
    assert.equal(versionMetadata.repository, "owner/agent-seed");
    assert.equal(versionMetadata.commit, "0123456789abcdef");
    assert.equal(versionMetadata.update.release_manifest, "agent-seed-release.json");

    const manifestPath = path.join(rootDir, "outputs", "agent-seed-release.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.name, "agent-seed");
    assert.equal(manifest.version, "v2.3.4");
    assert.equal(manifest.repository, "owner/agent-seed");
    assert.equal(manifest.commit, "0123456789abcdef");
    assert.ok(
      manifest.assets.some(
        (asset) => asset.name === "agent-seed.zip" && asset.path === "agent-seed.zip" && /^[a-f0-9]{64}$/.test(asset.sha256),
      ),
    );
    assert.ok(manifest.assets.some((asset) => asset.name === "agent-seed-release.json" && /^[a-f0-9]{64}$/.test(asset.sha256)));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("release CLI accepts a local version override", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-release-cli-version-"));

  try {
    const skillDir = path.join(rootDir, "skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: agent-seed\n---\n");

    await execFileAsync(process.execPath, [
      path.join(process.cwd(), "tools", "release.mjs"),
      "--root-dir",
      rootDir,
      "--version",
      "v9.9.9",
    ]);

    const versionMetadata = JSON.parse(await readFile(path.join(rootDir, "outputs", "agent-seed", "VERSION.json"), "utf8"));
    const releaseManifest = JSON.parse(await readFile(path.join(rootDir, "outputs", "agent-seed-release.json"), "utf8"));

    assert.equal(versionMetadata.version, "v9.9.9");
    assert.equal(releaseManifest.version, "v9.9.9");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("external plugins config includes install metadata", async () => {
  const configPath = path.join(process.cwd(), "skill", "external-plugins.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));

  assert.equal(config.activation_policy.on_agent_seed_start, "must_check");
  assert.equal(config.activation_policy.missing_action, "must_offer_before_onboarding");
  assert.equal(config.activation_policy.requires_user_approval, true);
  assert.equal(config.activation_policy.skip_reason_required, true);

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

test("bundled install manifests require activation preflight handling", async () => {
  const rootDir = process.cwd();
  const bundledSkills = JSON.parse(await readFile(path.join(rootDir, "skill", "bundled-skills.json"), "utf8"));
  const bundledPackages = JSON.parse(await readFile(path.join(rootDir, "skill", "bundled-packages.json"), "utf8"));

  for (const config of [bundledSkills, bundledPackages]) {
    assert.equal(config.activation_policy.on_agent_seed_start, "must_check");
    assert.equal(config.activation_policy.default_install_action, "must_offer_before_onboarding");
    assert.equal(config.activation_policy.requires_user_approval, true);
    assert.equal(config.activation_policy.skip_reason_required, true);
  }
});

test("bundled direct skill manifest registers every bundled skill directory", async () => {
  const rootDir = process.cwd();
  const bundledSkillsDir = path.join(rootDir, "skill", "bundled-skills");
  const config = JSON.parse(await readFile(path.join(rootDir, "skill", "bundled-skills.json"), "utf8"));
  const registeredNames = new Set(config.bundled_skills.map((skill) => skill.name));
  const directoryNames = (await readdir(bundledSkillsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const directoryName of directoryNames) {
    assert.ok(registeredNames.has(directoryName), `missing bundled-skills.json entry for ${directoryName}`);
  }

  for (const skill of config.bundled_skills) {
    assert.equal(typeof skill.source_path, "string");
    await stat(path.join(rootDir, "skill", skill.source_path, "SKILL.md"));
  }
});

test("Codex bundled direct skill detection does not treat AGENTS.md as a standalone platform signal", async () => {
  const rootDir = process.cwd();
  const config = JSON.parse(await readFile(path.join(rootDir, "skill", "bundled-skills.json"), "utf8"));

  for (const skill of config.bundled_skills) {
    const codex = skill.platforms.find((platform) => platform.platform === "codex");
    assert.ok(codex, `${skill.name} must define Codex platform metadata`);
    assert.ok(Array.isArray(codex.detection_paths));
    assert.equal(codex.detection_paths.includes("AGENTS.md"), false, `${skill.name} Codex detection should not use AGENTS.md`);
  }
});

test("external plugin config recognizes both OpenCode config file names", async () => {
  const rootDir = process.cwd();
  const config = JSON.parse(await readFile(path.join(rootDir, "skill", "external-plugins.json"), "utf8"));
  const opencodePlatforms = config.recommended_external_plugins
    .flatMap((plugin) => plugin.platforms)
    .filter((platform) => platform.platform === "opencode");

  assert.ok(opencodePlatforms.length > 0);

  for (const platform of opencodePlatforms) {
    const searchableText = [platform.install_action, platform.verification, ...platform.detection_evidence].join("\n");
    assert.match(searchableText, /opencode\.json/);
    assert.match(searchableText, /\.opencode\.yaml/);
  }
});

test("bundled direct skills support codeagent-cli .cac targets", async () => {
  const rootDir = process.cwd();
  const config = JSON.parse(await readFile(path.join(rootDir, "skill", "bundled-skills.json"), "utf8"));

  for (const skill of config.bundled_skills) {
    const platform = skill.platforms.find((entry) => entry.platform === "codeagent-cli");

    assert.ok(platform, `${skill.name} must define codeagent-cli platform metadata`);
    assert.equal(platform.target_path, `.cac/skills/${skill.name}`);
    assert.deepEqual(platform.detection_paths, [".cac"]);
    assert.equal(platform.verification, `SKILL.md exists at .cac/skills/${skill.name}/SKILL.md`);
    assert.ok(skill.writes.includes(`.cac/skills/${skill.name}`), `${skill.name} writes must include .cac target`);
  }
});

test("git-code-tracker package supports codeagent-cli .cac installation", async () => {
  const rootDir = process.cwd();
  const config = JSON.parse(await readFile(path.join(rootDir, "skill", "bundled-packages.json"), "utf8"));
  const tracker = config.bundled_packages.find((entry) => entry.name === "git-code-tracker");
  const installer = await readFile(path.join(rootDir, "skill", "packages", "git-code-tracker", "install-to-project.js"), "utf8");

  assert.ok(tracker, "expected git-code-tracker package entry");
  assert.equal(tracker.version, "v1.0.3");
  assert.equal(tracker.source.ref, "refs/tags/v1.0.3");
  assert.equal(tracker.source.commit, "66c048422dee2e433583cb97bb3a71efd0fcfbef");
  assert.ok(tracker.default_install.writes.includes(".cac/skills/ai-code-tracker"));
  assert.ok(tracker.default_install.writes.includes(".cac/commands"));
  assert.ok(tracker.default_install.writes.includes(".cac/settings.json"));

  const platform = tracker.platform_skills.find((entry) => entry.platform === "codeagent-cli");
  assert.ok(platform, "git-code-tracker must define codeagent-cli platform skill metadata");
  assert.equal(platform.source_path, ".cac/skills/ai-code-tracker");
  assert.equal(platform.target_path, ".cac/skills/ai-code-tracker");
  assert.equal(platform.verification, "node .cac/skills/ai-code-tracker/scripts/install.js --check");

  const cacSkillDir = path.join(rootDir, "skill", "packages", "git-code-tracker", ".cac", "skills", "ai-code-tracker");
  await stat(path.join(cacSkillDir, "SKILL.md"));
  await stat(path.join(cacSkillDir, "lib", "index.js"));
  const cacInstallScript = await readFile(path.join(cacSkillDir, "scripts", "install.js"), "utf8");
  const cacHookScript = await readFile(path.join(cacSkillDir, "scripts", "claude-code-hook.js"), "utf8");
  const cacRuntime = await readFile(path.join(cacSkillDir, "lib", "cli", "install.js"), "utf8");
  assert.match(cacInstallScript, /from "\.\.\/lib\/index\.js"/);
  assert.match(cacInstallScript, /runInstall/);
  assert.match(cacHookScript, /from "\.\.\/lib\/index\.js"/);
  assert.match(cacHookScript, /runClaudeCodeHook/);
  assert.match(cacRuntime, /tool === "codeagent-cli"/);
  assert.match(cacRuntime, /\.cac", "settings\.json"/);
  assert.match(cacRuntime, /tool === "codeagent-cli" \? "\.cac" : "\.claude"/);
  assert.match(installer, /sourceCacSkill/);
  assert.match(installer, /targetCacSkill/);
  assert.match(installer, /\.cac/);
});

test("git-code-tracker installer scopes installation to the selected platform", async () => {
  const rootDir = process.cwd();
  const targetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-tracker-platform-"));

  try {
    await execFileAsync("git", ["init"], { cwd: targetDir });
    await execFileAsync(process.execPath, [
      path.join(rootDir, "skill", "packages", "git-code-tracker", "install-to-project.js"),
      targetDir,
      "--platform",
      "claude",
    ]);

    assert.equal(await exists(path.join(targetDir, ".claude", "skills", "ai-code-tracker", "SKILL.md")), true);
    assert.equal(await exists(path.join(targetDir, ".opencode", "skills", "ai-code-tracker", "SKILL.md")), false);
    assert.equal(await exists(path.join(targetDir, ".cac", "skills", "ai-code-tracker", "SKILL.md")), false);

    const agents = await readFile(path.join(targetDir, "AGENTS.md"), "utf8");
    assert.match(agents, /load the Claude Code skill `ai-code-tracker`/);
    assert.doesNotMatch(agents, /load the opencode skill `ai-code-tracker`/);
  } finally {
    await rm(targetDir, { recursive: true, force: true });
  }
});

test("git-code-tracker package install command requires detected platform selection", async () => {
  const rootDir = process.cwd();
  const config = JSON.parse(await readFile(path.join(rootDir, "skill", "bundled-packages.json"), "utf8"));
  const tracker = config.bundled_packages.find((entry) => entry.name === "git-code-tracker");
  const outputAssets = await readFile(path.join(rootDir, "skill", "references", "output-assets.md"), "utf8");

  assert.ok(tracker, "expected git-code-tracker package entry");
  assert.match(tracker.default_install.command, /--platform <detected-platform>/);
  assert.match(outputAssets, /--platform <detected-platform>/);
  assert.match(outputAssets, /detected or requested platform/i);
});

test("git-code-tracker platform skill docs and AGENTS rules are platform-specific", async () => {
  const rootDir = process.cwd();
  const packageDir = path.join(rootDir, "skill", "packages", "git-code-tracker");
  const claudeSkill = await readFile(path.join(packageDir, ".claude", "skills", "ai-code-tracker", "SKILL.md"), "utf8");
  const cacSkill = await readFile(path.join(packageDir, ".cac", "skills", "ai-code-tracker", "SKILL.md"), "utf8");
  const claudeInstallScript = await readFile(path.join(packageDir, ".claude", "skills", "ai-code-tracker", "scripts", "install.js"), "utf8");
  const cacInstallScript = await readFile(path.join(packageDir, ".cac", "skills", "ai-code-tracker", "scripts", "install.js"), "utf8");
  const claudeTargetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-tracker-claude-"));
  const cacTargetDir = await mkdtemp(path.join(tmpdir(), "agent-seed-tracker-cac-"));

  try {
    assert.match(claudeSkill, /node \.claude\/skills\/ai-code-tracker\/scripts\/install\.js --check/);
    assert.match(claudeSkill, /current Claude Code session/);
    assert.doesNotMatch(claudeSkill, /\.opencode\/skills\/ai-code-tracker\/scripts\/install\.js/);
    assert.doesNotMatch(claudeSkill, /current opencode session/);
    assert.match(claudeInstallScript, /from "\.\.\/lib\/index\.js"/);
    assert.match(claudeInstallScript, /runInstall/);

    assert.match(cacSkill, /current codeagent-cli session/);
    assert.doesNotMatch(cacSkill, /current opencode session/);
    assert.match(cacInstallScript, /from "\.\.\/lib\/index\.js"/);
    assert.match(cacInstallScript, /runInstall/);

    await execFileAsync("git", ["init"], { cwd: claudeTargetDir });
    await execFileAsync(process.execPath, [
      path.join(packageDir, "install-to-project.js"),
      claudeTargetDir,
      "--platform",
      "claude",
    ]);
    const claudeAgents = await readFile(path.join(claudeTargetDir, "AGENTS.md"), "utf8");
    assert.match(claudeAgents, /load the Claude Code skill `ai-code-tracker`/);
    assert.match(claudeAgents, /restart the current Claude Code session/);
    assert.doesNotMatch(claudeAgents, /load the opencode skill `ai-code-tracker`/);

    await execFileAsync("git", ["init"], { cwd: cacTargetDir });
    await execFileAsync(process.execPath, [
      path.join(packageDir, "install-to-project.js"),
      cacTargetDir,
      "--platform",
      "codeagent-cli",
    ]);
    const cacAgents = await readFile(path.join(cacTargetDir, "AGENTS.md"), "utf8");
    assert.match(cacAgents, /load the codeagent-cli skill `ai-code-tracker`/);
    assert.match(cacAgents, /restart the current codeagent-cli session/);
    assert.doesNotMatch(cacAgents, /load the opencode skill `ai-code-tracker`/);
  } finally {
    await rm(claudeTargetDir, { recursive: true, force: true });
    await rm(cacTargetDir, { recursive: true, force: true });
  }
});

test("core instructions recognize codeagent-cli platform evidence", async () => {
  const rootDir = process.cwd();
  const skill = await readFile(path.join(rootDir, "skill", "SKILL.md"), "utf8");
  const outputAssets = await readFile(path.join(rootDir, "skill", "references", "output-assets.md"), "utf8");

  for (const content of [skill, outputAssets]) {
    assert.match(content, /codeagent-cli/i);
    assert.match(content, /\bcac\b/i);
    assert.match(content, /\.cac\//);
  }
});

test("gitpush verifies required remotes before creating a commit", async () => {
  const rootDir = process.cwd();
  const skill = await readFile(path.join(rootDir, "skill", "bundled-skills", "gitpush", "skill", "SKILL.md"), "utf8");

  assert.match(skill, /fork/i);
  assert.ok(skill.indexOf("git remote get-url origin") < skill.indexOf('git commit -S -m "提交信息"'));
  assert.ok(skill.indexOf("git remote get-url upstream") < skill.indexOf('git commit -S -m "提交信息"'));
});

test("gitpush creates signed commits and helps users enable signing when -S fails", async () => {
  const rootDir = process.cwd();
  const skill = await readFile(path.join(rootDir, "skill", "bundled-skills", "gitpush", "skill", "SKILL.md"), "utf8");

  assert.match(skill, /git commit -S -m "提交信息"/);
  assert.doesNotMatch(skill, /git commit -m "提交信息"/);
  assert.match(skill, /Do not retry without `-S`/);
  assert.match(skill, /do not fall back to an unsigned commit/i);
  assert.match(skill, /git config --global commit\.gpgsign true/);
  assert.match(skill, /git config --global gpg\.format ssh/);
  assert.match(skill, /git config --global user\.signingkey/);
});

test("gitpush auto-configures SSH signing when a usable ~/.ssh key exists", async () => {
  const rootDir = process.cwd();
  const skill = await readFile(path.join(rootDir, "skill", "bundled-skills", "gitpush", "skill", "SKILL.md"), "utf8");

  assert.match(skill, /Bootstrap commit signing before committing/);
  assert.match(skill, /git config --get commit\.gpgsign/);
  assert.match(skill, /git config --get gpg\.format/);
  assert.match(skill, /git config --get user\.signingkey/);
  assert.match(skill, /~\/\.ssh\/id_ed25519\.pub/);
  assert.match(skill, /~\/\.ssh\/id_ecdsa\.pub/);
  assert.match(skill, /~\/\.ssh\/id_rsa\.pub/);
  assert.match(skill, /same basename private key/);
  assert.match(skill, /git config --global gpg\.format ssh/);
  assert.match(skill, /git config --global user\.signingkey SSH_PUBLIC_KEY_PATH/);
  assert.match(skill, /GitHub Settings > SSH and GPG keys/);
});

test("gittag runs gitsync before local tag creation and pushes tags to both remotes", async () => {
  const rootDir = process.cwd();
  const skill = await readFile(path.join(rootDir, "skill", "bundled-skills", "gittag", "skill", "SKILL.md"), "utf8");
  const overlay = await readFile(
    path.join(rootDir, "skill", "bundled-skills", "gittag", "overlays", "codex", "agents", "openai.yaml"),
    "utf8",
  );
  const manifest = JSON.parse(await readFile(path.join(rootDir, "skill", "bundled-skills.json"), "utf8"));
  const entry = manifest.bundled_skills.find((candidate) => candidate.name === "gittag");

  assert.ok(entry, "expected gittag to be registered in bundled-skills.json");
  assert.match(skill, /REQUIRED SUB-SKILL: Use gitsync/i);
  assert.ok(skill.indexOf("gitsync") < skill.indexOf("git tag -a TAG_NAME"));
  assert.ok(skill.indexOf("git remote get-url origin") < skill.indexOf("git tag -a TAG_NAME"));
  assert.ok(skill.indexOf("git remote get-url upstream") < skill.indexOf("git tag -a TAG_NAME"));
  assert.match(skill, /git push origin TAG_NAME/);
  assert.match(skill, /git push upstream TAG_NAME/);
  assert.match(skill, /git ls-remote --tags origin/);
  assert.match(skill, /git ls-remote --tags upstream/);
  assert.match(overlay, /display_name: "GitTag"/);
});

test("core skill instructions define activation preflight as a hard gate", async () => {
  const skillPath = path.join(process.cwd(), "skill", "SKILL.md");
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /## Activation Preflight/);
  assert.match(skill, /Before scanning, interviewing, generating files, or answering onboarding conclusions/i);
  assert.match(skill, /must inspect `external-plugins\.json`, `bundled-skills\.json`, and `bundled-packages\.json`/i);
  assert.match(skill, /Do not continue with onboarding work until each applicable default or recommended item/i);
  assert.match(skill, /accepted, declined, already available, platform-inapplicable, or explicitly deferred/i);
  assert.match(skill, /Record the reason when an applicable install is skipped/i);
});

test("activation preflight separates manifest inspection from repository evidence based applicability", async () => {
  const skillPath = path.join(process.cwd(), "skill", "SKILL.md");
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /First, inspect `external-plugins\.json`, `bundled-skills\.json`, and `bundled-packages\.json`/i);
  assert.match(skill, /After the target root is known, perform a minimal platform-evidence scan/i);
  assert.match(skill, /Do not present the scan summary, begin owner interviews, generate files, or claim no installs are needed/i);
});

test("activation preflight falls back from project evidence to runtime and approved user-level evidence", async () => {
  const skillPath = path.join(process.cwd(), "skill", "SKILL.md");
  const skill = await readFile(skillPath, "utf8");

  assert.match(skill, /If target-root platform evidence is absent or ambiguous/i);
  assert.match(skill, /current agent runtime/i);
  assert.match(skill, /visible skills/i);
  assert.match(skill, /Ask the owner before inspecting user-level agent configuration/i);
  assert.match(skill, /\$CODEX_HOME/i);
  assert.match(skill, /personal\/global directories/i);
  assert.match(skill, /multiple platform candidates/i);
  assert.match(skill, /ask the owner to choose/i);
});

test("external plugins include OpenCLI for browser automation", async () => {
  const configPath = path.join(process.cwd(), "skill", "external-plugins.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const opencli = config.recommended_external_plugins.find((plugin) => plugin.name === "opencli");

  assert.ok(opencli, "expected OpenCLI recommendation");
  assert.equal(opencli.display_name, "OpenCLI");
  assert.match(opencli.purpose, /website|browser|web/i);
  assert.match(opencli.use_when, /default/i);
  assert.equal(opencli.default_recommendation.requires_network, true);
  assert.equal(opencli.default_recommendation.requires_user_approval, true);
  assert.equal(opencli.default_recommendation.safety_level, "ask-first");
  assert.match(opencli.default_recommendation.recommend_by_default_when, /supported platform/i);

  const supportedPlatforms = ["codex", "claude", "codeagent-cli", "opencode"];
  assert.deepEqual(opencli.platforms.map((platform) => platform.platform).sort(), supportedPlatforms.sort());

  for (const platform of opencli.platforms) {
    assert.match(platform.install_action, /npm install -g @jackwener\/opencli/);
    assert.match(platform.install_action, /npx skills add jackwener\/opencli/);
    assert.match(platform.install_action, /Browser Bridge/i);
    assert.match(platform.install_action, /do not install.*automatically/i);
    assert.ok(platform.detection_evidence.some((entry) => /opencli --version|OpenCLI skills/i.test(entry)));
    assert.match(platform.verification, /opencli --version/);
    assert.match(platform.verification, /skills/i);
  }
});

test("external plugins include DevEco CLI for HarmonyOS projects", async () => {
  const configPath = path.join(process.cwd(), "skill", "external-plugins.json");
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

test("external plugins do not default to archived DevEco Toolbox", async () => {
  const configPath = path.join(process.cwd(), "skill", "external-plugins.json");
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

test("local Agent Seed config is ignored by Git", async () => {
  const gitignore = await readFile(path.join(process.cwd(), ".gitignore"), "utf8");

  assert.match(gitignore, /^\.agents\/agent-seed\.json$/m);
});

test("external plugin prose stays configuration driven", async () => {
  const rootDir = process.cwd();
  const configPath = path.join(rootDir, "skill", "external-plugins.json");
  const skillPath = path.join(rootDir, "skill", "SKILL.md");
  const frameworkPackPaths = new Set([
    path.normalize(path.join(rootDir, "skill", "references", "frameworks", "nuwa.md")),
    path.normalize(path.join(rootDir, "skill", "references", "frameworks", "harmonyos.md")),
  ]);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const pluginTerms = config.recommended_external_plugins.flatMap((plugin) => [plugin.name, plugin.display_name]);
  const vendoredPackageDir = path.normalize(path.join(rootDir, "skill", "packages"));
  const files = [path.join(rootDir, "README.md"), ...(await markdownFiles(path.join(rootDir, "skill")))]
    .filter((filePath) => ![configPath, skillPath].map((allowedPath) => path.normalize(allowedPath)).includes(path.normalize(filePath)))
    .filter((filePath) => !frameworkPackPaths.has(path.normalize(filePath)))
    .filter((filePath) => !path.normalize(filePath).startsWith(vendoredPackageDir + path.sep));

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
  assert.match(skill, /external-plugins\.json/);
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

test("core skill instructions document version metadata and self update flow", async () => {
  const skill = await readFile(path.join(process.cwd(), "skill", "SKILL.md"), "utf8");

  assert.match(skill, /VERSION\.json/);
  assert.match(skill, /scripts\/update-agent-seed\.mjs/);
  assert.match(skill, /--apply/);
  assert.match(skill, /GitHub latest release/i);
  assert.match(skill, /self-update preflight/i);
  assert.match(skill, /network-denied/i);
  assert.match(skill, /deferred/i);
  assert.match(skill, /\.agents\/agent-seed\.json/);
});

test("core skill instructions document deferred Windows self updates", async () => {
  const rootDir = process.cwd();
  const documents = await Promise.all([
    readFile(path.join(rootDir, "skill", "SKILL.md"), "utf8"),
    readFile(path.join(rootDir, "README.md"), "utf8"),
  ]);

  for (const document of documents) {
    assert.match(document, /queued/i);
    assert.match(document, /windows-directory-locked/i);
    assert.match(document, /(?:automatically completes|completes automatically) after the agent host exits and releases the (?:directory )?lock/i);
    assert.match(document, /terminal `failed` state (?:requires another `--apply` command|needs a new `--apply` command)/i);
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
