import { access, cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { installGitCodeTracker } from "./install-git-code-tracker.mjs";

const STATE_DIRECTORY = ".agents";
const STATE_FILE = "managed-skills.json";
const EMPTY_STATE = Object.freeze({
  schema_version: 2,
  managed_skills: [],
  external_integrations: [],
  declined_install_offers: [],
});

export async function readManagedState(targetDir) {
  const statePath = path.join(path.resolve(targetDir), STATE_DIRECTORY, STATE_FILE);
  try {
    return normalizeState(JSON.parse(await readFile(statePath, "utf8")), statePath);
  } catch (error) {
    if (error.code === "ENOENT") return structuredClone(EMPTY_STATE);
    throw error;
  }
}

export async function writeManagedState(targetDir, state) {
  const stateDir = path.join(path.resolve(targetDir), STATE_DIRECTORY);
  const statePath = path.join(stateDir, STATE_FILE);
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  const normalizedState = normalizeState(state, statePath);
  await mkdir(stateDir, { recursive: true });
  try {
    await writeFile(tempPath, `${JSON.stringify(normalizedState, null, 2)}\n`, "utf8");
    await rename(tempPath, statePath);
  } finally {
    await rm(tempPath, { force: true });
  }
  return normalizedState;
}

export async function inspectManagedUpdates({ skillRoot, targetDir, platform }) {
  const resolvedTargetDir = path.resolve(targetDir);
  const entries = await readManagedEntries(skillRoot, platform);
  const state = await readManagedState(resolvedTargetDir);
  const managed = [];

  for (const entry of entries) {
    const record = state.managed_skills.find((candidate) => candidate.name === entry.name && candidate.platform === platform);
    const targetExists = await pathExists(resolveInside(resolvedTargetDir, entry.target_path, `${entry.name} target path`));
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
    managed.push({
      name: entry.name,
      kind: entry.kind,
      platform,
      target_path: entry.target_path,
      installed_version: record?.version ?? null,
      available_version: entry.version,
      state: status,
    });
  }

  const external = state.external_integrations
    .filter((entry) => entry.platform === platform)
    .map((entry) => ({ ...entry, state: entry.version === "unknown" ? "version-unknown" : "available" }));

  return { managed, external };
}

export async function applyManagedUpdate({ skillRoot, targetDir, name, platform, approved, installPackage }) {
  if (approved !== true) {
    throw new Error("Owner approval is required to apply a managed update.");
  }

  const resolvedTargetDir = path.resolve(targetDir);
  const entry = (await readManagedEntries(skillRoot, platform)).find((candidate) => candidate.name === name);
  if (!entry) {
    throw new Error(`Unknown managed entry for ${platform}: ${name}`);
  }
  if (entry.kind === "package") {
    return applyPackageUpdate({ entry, targetDir: resolvedTargetDir, platform, installPackage });
  }

  const sourceDir = resolveInside(path.resolve(skillRoot), entry.source_path, `${name} source path`);
  const targetPath = resolveInside(resolvedTargetDir, entry.target_path, `${name} target path`);
  const stagingRoot = await mkdtemp(path.join(tmpdir(), "agent-seed-managed-update-"));
  const stagedSkill = path.join(stagingRoot, "skill");
  const backupPath = `${targetPath}.agent-seed-backup-${Date.now()}`;
  const targetExisted = await pathExists(targetPath);

  try {
    await cp(sourceDir, stagedSkill, { recursive: true });
    if (entry.overlay_path) {
      await cp(resolveInside(path.resolve(skillRoot), entry.overlay_path, `${name} overlay path`), stagedSkill, { recursive: true });
    }
    await access(path.join(stagedSkill, "SKILL.md"));
    await mkdir(path.dirname(targetPath), { recursive: true });
    if (targetExisted) {
      await rename(targetPath, backupPath);
    }
    await cp(stagedSkill, targetPath, { recursive: true });
    await access(path.join(targetPath, "SKILL.md"));
    await recordManagedInstall(resolvedTargetDir, {
      name: entry.name,
      kind: entry.kind,
      version: entry.version,
      platform,
      target_path: entry.target_path,
      source: entry.source_path,
    });
    await rm(backupPath, { recursive: true, force: true });
  } catch (error) {
    await rm(targetPath, { recursive: true, force: true });
    if (targetExisted && (await pathExists(backupPath))) {
      await rename(backupPath, targetPath);
    }
    throw error;
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

async function applyPackageUpdate({ entry, targetDir, platform, installPackage }) {
  const stagingRoot = await mkdtemp(path.join(tmpdir(), "agent-seed-managed-package-"));
  const backup = await backupWriteRoots(targetDir, entry.write_paths, stagingRoot);
  const installer = installPackage || defaultPackageInstaller(entry.name);

  try {
    await installer({ targetDir, platform });
    await access(path.join(resolveInside(targetDir, entry.target_path, `${entry.name} target path`), "SKILL.md"));
    await recordManagedInstall(targetDir, {
      name: entry.name,
      kind: entry.kind,
      version: entry.version,
      platform,
      target_path: entry.target_path,
      source: entry.source_path ?? entry.name,
    });
  } catch (error) {
    await restoreWriteRoots(targetDir, backup);
    throw error;
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

export function compareVersions(left, right) {
  const leftSegments = parseVersion(left);
  const rightSegments = parseVersion(right);
  for (let index = 0; index < Math.max(leftSegments.length, rightSegments.length); index += 1) {
    const difference = (leftSegments[index] ?? 0) - (rightSegments[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export async function recordExternalIntegration({ targetDir, name, platform, ownership, version = "unknown" }) {
  if (![name, platform, ownership].every((value) => typeof value === "string" && value.trim() !== "")) {
    throw new Error("External integration name, platform, and ownership are required.");
  }
  const state = await readManagedState(targetDir);
  const record = { name, platform, ownership, version };
  const retained = state.external_integrations.filter((entry) => entry.name !== name || entry.platform !== platform);
  return writeManagedState(targetDir, { ...state, external_integrations: [...retained, record] });
}

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

export async function applyExternalUpdate({ approved, nativeUpdate }) {
  if (approved !== true) throw new Error("Owner approval is required to update an external integration.");
  if (typeof nativeUpdate !== "function") throw new Error("A platform-native update action is required.");
  await nativeUpdate();
  return true;
}

async function readManagedEntries(skillRoot, platform) {
  const root = path.resolve(skillRoot);
  const [skillManifest, packageManifest] = await Promise.all([
    readJson(path.join(root, "bundled-skills.json")),
    readJson(path.join(root, "bundled-packages.json")),
  ]);
  const directSkills = (skillManifest.bundled_skills || []).flatMap((entry) => {
    const platformEntry = entry.platforms?.find((candidate) => candidate.platform === platform);
    return platformEntry ? [normalizeEntry(entry, platformEntry, "direct-skill")] : [];
  });
  const packages = (packageManifest.bundled_packages || []).flatMap((entry) => {
    const platformEntry = entry.platform_skills?.find((candidate) => candidate.platform === platform);
    return platformEntry ? [normalizeEntry(entry, platformEntry, "package")] : [];
  });
  return [...directSkills, ...packages];
}

function normalizeEntry(entry, platformEntry, kind) {
  if (!entry || typeof entry.name !== "string" || entry.name.trim() === "") throw new Error("Managed manifest entry requires a name.");
  if (typeof entry.version !== "string" || entry.version.trim() === "") throw new Error(`Managed manifest entry requires a version: ${entry.name}`);
  if (!platformEntry || typeof platformEntry.target_path !== "string" || platformEntry.target_path.trim() === "") throw new Error(`Managed manifest entry requires a target path: ${entry.name}`);
  return {
    name: entry.name,
    version: entry.version,
    kind,
    target_path: platformEntry.target_path,
    source_path: entry.source_path,
    overlay_path: platformEntry.overlay_path,
    offer_by_default: entry.default_install?.offer_by_default === true,
    write_paths: entry.default_install?.writes || [platformEntry.target_path],
  };
}

function defaultPackageInstaller(name) {
  if (name === "git-code-tracker") return installGitCodeTracker;
  throw new Error(`No managed installer is registered for package: ${name}`);
}

async function backupWriteRoots(targetDir, paths, stagingRoot) {
  const roots = [...new Set(paths.map((entry) => normalizeRelativePath(entry)))].sort((left, right) => left.length - right.length)
    .filter((candidate, index, values) => !values.slice(0, index).some((parent) => candidate.startsWith(`${parent}/`)));
  const records = [];
  for (const relativePath of roots) {
    const source = resolveInside(targetDir, relativePath, "package write path");
    const destination = path.join(stagingRoot, relativePath);
    const exists = await pathExists(source);
    if (exists) {
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(source, destination, { recursive: true });
    }
    records.push({ relativePath, exists });
  }
  return { stagingRoot, records };
}

async function restoreWriteRoots(targetDir, backup) {
  for (const record of [...backup.records].reverse()) {
    const target = resolveInside(targetDir, record.relativePath, "package write path");
    await rm(target, { recursive: true, force: true });
    if (record.exists) {
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(backup.stagingRoot, record.relativePath), target, { recursive: true });
    }
  }
}

function normalizeRelativePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

async function recordManagedInstall(targetDir, record) {
  const state = await readManagedState(targetDir);
  const retained = state.managed_skills.filter((entry) => entry.name !== record.name || entry.platform !== record.platform);
  const retainedDeclines = state.declined_install_offers.filter((entry) =>
    entry.name !== record.name || entry.kind !== record.kind || entry.platform !== record.platform
  );
  return writeManagedState(targetDir, {
    ...state,
    managed_skills: [...retained, record],
    declined_install_offers: retainedDeclines,
  });
}

function normalizeState(state, statePath) {
  if (!state || Array.isArray(state) || typeof state !== "object") throw new Error(`Invalid managed skill state: ${statePath}`);
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

function parseVersion(value) {
  if (typeof value !== "string" || !/^v?\d+(?:\.\d+)*$/.test(value)) throw new Error(`Invalid managed version: ${value}`);
  return value.replace(/^v/, "").split(".").map(Number);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function resolveInside(rootDir, relativePath, label) {
  const candidate = path.resolve(rootDir, relativePath);
  const relative = path.relative(rootDir, candidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Invalid ${label}: ${relativePath}`);
  return candidate;
}

function parseArgs(args) {
  const [command, targetDir, ...rest] = args;
  if (!command || !targetDir || !["check", "apply", "decline"].includes(command)) {
    throw new Error("Usage: node scripts/manage-managed-skills.mjs <check|apply|decline> <target-project> --platform <platform> [--name <name>] [--approved] [--confirmed] [--json]");
  }

  const options = { command, targetDir, platform: "", name: "", approved: false, confirmed: false, json: false, skillRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--approved") options.approved = true;
    else if (arg === "--confirmed") options.confirmed = true;
    else if (arg === "--json") options.json = true;
    else if (["--platform", "--name", "--skill-root"].includes(arg)) {
      const value = rest[index += 1];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === "--platform") options.platform = value;
      if (arg === "--name") options.name = value;
      if (arg === "--skill-root") options.skillRoot = path.resolve(value);
    } else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.platform) throw new Error("--platform is required");
  if (["apply", "decline"].includes(command) && !options.name) throw new Error(`--name is required for ${command}`);
  if (command === "apply" && !options.approved) throw new Error("--approved is required for apply");
  if (command === "decline" && !options.confirmed) throw new Error("--confirmed is required for decline");
  return options;
}

async function runCli(args) {
  const options = parseArgs(args);
  const result = options.command === "check"
    ? await inspectManagedUpdates(options)
    : options.command === "apply"
      ? await applyManagedUpdate(options)
      : await recordInstallOfferDecline(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (options.command === "check") console.log(result.managed.map((entry) => `${entry.name}: ${entry.state}`).join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`[managed-skills] ${error.message}`);
    process.exitCode = 1;
  });
}
