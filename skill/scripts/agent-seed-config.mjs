import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const SHARED_CONFIG_FILE = path.join(".agents", "agent-seed.json");
export const LOCAL_CONFIG_FILE = path.join(".agents", "agent-seed.local.json");

const SHARED_SELF_UPDATE_KEYS = new Set(["check_on_start", "check_interval_hours", "update_mode"]);
const LOCAL_SELF_UPDATE_KEYS = new Set(["proxy", "last_check"]);
const KNOWN_TOP_LEVEL_KEYS = new Set([
  "schema_version",
  "minimum_agent_seed_version",
  "knowledge_asset_write_mode",
  "self_update",
  "installation",
  "install_prompt_history",
  "legacy_unclassified",
]);

export async function readAgentSeedFiles(targetDir) {
  const root = path.resolve(targetDir);
  const shared = await readJsonIfExists(path.join(root, SHARED_CONFIG_FILE));
  const local = await readJsonIfExists(path.join(root, LOCAL_CONFIG_FILE));
  return {
    shared: shared || {},
    local: local || {},
    legacy: shared && isLegacyConfig(shared) ? shared : null,
  };
}

export function resolveAgentSeedConfig({ shared = {}, local = {} } = {}) {
  const sharedSelfUpdate = pickObjectKeys(shared.self_update, SHARED_SELF_UPDATE_KEYS);
  const localSelfUpdate = pickObjectKeys(local.self_update, LOCAL_SELF_UPDATE_KEYS);
  const effective = {
    ...pickDefined({
      schema_version: shared.schema_version,
      minimum_agent_seed_version: shared.minimum_agent_seed_version,
      knowledge_asset_write_mode: shared.knowledge_asset_write_mode,
      installation: local.installation,
      install_prompt_history: local.install_prompt_history,
    }),
    self_update: {
      ...sharedSelfUpdate,
      ...localSelfUpdate,
    },
  };
  if (Object.keys(effective.self_update).length === 0) delete effective.self_update;
  return effective;
}

export function splitLegacyAgentSeedConfig(legacy, installedVersion) {
  if (!isPlainObject(legacy)) throw new Error("Invalid legacy Agent Seed config.");
  const baseline = selectInitialBaseline(legacy.minimum_agent_seed_version, installedVersion);
  const sharedSelfUpdate = pickObjectKeys(legacy.self_update, SHARED_SELF_UPDATE_KEYS);
  const localSelfUpdate = pickObjectKeys(legacy.self_update, LOCAL_SELF_UPDATE_KEYS);
  const shared = {
    schema_version: 2,
    minimum_agent_seed_version: baseline,
    ...pickDefined({ knowledge_asset_write_mode: legacy.knowledge_asset_write_mode }),
  };
  if (Object.keys(sharedSelfUpdate).length > 0) shared.self_update = sharedSelfUpdate;

  const local = {
    schema_version: 1,
    ...pickDefined({
      installation: legacy.installation,
      install_prompt_history: legacy.install_prompt_history,
    }),
  };
  if (Object.keys(localSelfUpdate).length > 0) local.self_update = localSelfUpdate;

  const unclassified = {};
  for (const [key, value] of Object.entries(legacy)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) unclassified[key] = value;
  }
  const unknownSelfUpdate = {};
  for (const [key, value] of Object.entries(isPlainObject(legacy.self_update) ? legacy.self_update : {})) {
    if (!SHARED_SELF_UPDATE_KEYS.has(key) && !LOCAL_SELF_UPDATE_KEYS.has(key)) unknownSelfUpdate[key] = value;
  }
  if (Object.keys(unknownSelfUpdate).length > 0) unclassified.self_update = unknownSelfUpdate;
  if (isPlainObject(legacy.legacy_unclassified)) Object.assign(unclassified, legacy.legacy_unclassified);
  if (Object.keys(unclassified).length > 0) local.legacy_unclassified = unclassified;
  return { shared, local };
}

export async function migrateAgentSeedConfig({ targetDir, installedVersion } = {}) {
  const files = await readAgentSeedFiles(targetDir);
  if (!files.legacy) return { status: "current", shared: files.shared, local: files.local };

  const split = splitLegacyAgentSeedConfig(files.legacy, installedVersion);
  const local = mergeLocalState(split.local, files.local);
  await writeJsonAtomic(path.join(path.resolve(targetDir), LOCAL_CONFIG_FILE), local);
  await writeJsonAtomic(path.join(path.resolve(targetDir), SHARED_CONFIG_FILE), split.shared);
  return { status: "migrated", shared: split.shared, local };
}

export async function writeSharedAgentSeedConfig({ targetDir, config }) {
  if (!isPlainObject(config)) throw new Error("Shared Agent Seed config must be an object.");
  await writeJsonAtomic(path.join(path.resolve(targetDir), SHARED_CONFIG_FILE), config);
}

export async function writeLocalAgentSeedState({ targetDir, patch }) {
  if (!isPlainObject(patch)) throw new Error("Local Agent Seed state patch must be an object.");
  const localPath = path.join(path.resolve(targetDir), LOCAL_CONFIG_FILE);
  const current = (await readJsonIfExists(localPath)) || {};
  const next = mergeLocalState(current, { schema_version: 1, ...patch });
  await writeJsonAtomic(localPath, next);
  return next;
}

function isLegacyConfig(config) {
  if (config.schema_version !== 2) return true;
  if (config.installation !== undefined || config.install_prompt_history !== undefined) return true;
  const selfUpdate = isPlainObject(config.self_update) ? config.self_update : {};
  return [...LOCAL_SELF_UPDATE_KEYS].some((key) => selfUpdate[key] !== undefined);
}

function mergeLocalState(base, override) {
  const baseHistory = Array.isArray(base.install_prompt_history) ? base.install_prompt_history : [];
  const overrideHistory = Array.isArray(override.install_prompt_history) ? override.install_prompt_history : [];
  const history = deduplicate([...baseHistory, ...overrideHistory]);
  const result = {
    ...base,
    ...override,
    schema_version: 1,
    self_update: {
      ...(isPlainObject(base.self_update) ? base.self_update : {}),
      ...(isPlainObject(override.self_update) ? override.self_update : {}),
    },
    legacy_unclassified: {
      ...(isPlainObject(base.legacy_unclassified) ? base.legacy_unclassified : {}),
      ...(isPlainObject(override.legacy_unclassified) ? override.legacy_unclassified : {}),
    },
  };
  if (history.length > 0) result.install_prompt_history = history;
  else delete result.install_prompt_history;
  if (Object.keys(result.self_update).length === 0) delete result.self_update;
  if (Object.keys(result.legacy_unclassified).length === 0) delete result.legacy_unclassified;
  return result;
}

function selectInitialBaseline(existing, installed) {
  const existingVersion = normalizeVersion(existing);
  const installedVersion = normalizeVersion(installed);
  if (!installedVersion) throw new Error("A valid installed Agent Seed version is required for migration.");
  if (!existingVersion) return installedVersion;
  return compareVersions(existingVersion, installedVersion) >= 0 ? existingVersion : installedVersion;
}

function normalizeVersion(value) {
  if (typeof value !== "string" || !/^v?\d+(?:\.\d+)*$/.test(value)) return "";
  return value.startsWith("v") ? value : `v${value}`;
}

function compareVersions(left, right) {
  const leftParts = left.replace(/^v/, "").split(".").map(Number);
  const rightParts = right.replace(/^v/, "").split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function pickObjectKeys(value, keys) {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, entry]) => keys.has(key) && entry !== undefined));
}

function pickDefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function deduplicate(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = JSON.stringify(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readJsonIfExists(filePath) {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8"));
    if (!isPlainObject(value)) throw new Error(`Invalid Agent Seed JSON object: ${filePath}`);
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    JSON.parse(await readFile(tempPath, "utf8"));
    await rename(tempPath, filePath);
  } finally {
    await rm(tempPath, { force: true });
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
