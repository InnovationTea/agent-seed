import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { inspectManagedUpdates } from "./manage-managed-skills.mjs";

const execFileAsync = promisify(execFile);

export async function runAgentSeedPreflight({
  skillRoot,
  targetDir,
  platform,
  skipSelfUpdate = false,
  runSelfUpdate = runSelfUpdateCheck,
  inspectManaged = inspectManagedUpdates,
}) {
  const result = { agent_seed: { state: "unknown" }, managed: [], external: [], errors: [] };

  const selfUpdateSkipReason = skipSelfUpdate
    ? "conversation-skip"
    : await getConfiguredSelfUpdateSkipReason(targetDir);
  if (selfUpdateSkipReason) {
    result.agent_seed = { state: "skipped", reason: selfUpdateSkipReason };
  } else {
    try {
      const update = await runSelfUpdate({ skillRoot, targetDir });
      const baselineState = update.baseline?.state;
      result.agent_seed = {
        state: baselineState === "version-incompatible"
          ? "version-incompatible"
          : baselineState === "unconfigured"
            ? "unknown"
          : update.hasUpdate
            ? "update-available"
            : baselineState === "baseline-refresh-available"
              ? "baseline-refresh-available"
              : "current",
        current_version: update.currentVersion,
        available_version: update.latestVersion,
        ...(update.baseline?.minimum_version ? { minimum_version: update.baseline.minimum_version } : {}),
        cached: update.cached === true,
      };
    } catch (error) {
      result.errors.push({ source: "agent-seed", message: error.message });
    }
  }

  try {
    const managed = await inspectManaged({ skillRoot, targetDir, platform });
    result.managed = managed.managed;
    result.external = managed.external;
  } catch (error) {
    result.errors.push({ source: "managed-skills", message: error.message });
  }

  return result;
}

async function getConfiguredSelfUpdateSkipReason(targetDir) {
  try {
    const configPath = path.join(path.resolve(targetDir), ".agents", "agent-seed.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    return config.self_update?.check_on_start === false ? "check-on-start-disabled" : "";
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

export async function runSelfUpdateCheck({ skillRoot, targetDir }) {
  const script = path.join(path.resolve(skillRoot), "scripts", "update-agent-seed.mjs");
  const config = path.join(path.resolve(targetDir), ".agents", "agent-seed.json");
  const { stdout } = await execFileAsync(process.execPath, [script, "--json", "--target", skillRoot, "--config", config], {
    cwd: path.resolve(targetDir),
    windowsHide: true,
  });
  return JSON.parse(stdout);
}

function parseArgs(args) {
  const [targetDir, ...rest] = args;
  if (!targetDir) {
    throw new Error("Usage: node scripts/check-agent-seed-updates.mjs <target-project> --platform <platform> [--skill-root <agent-seed-root>] [--skip-self-update] [--json]");
  }

  const options = {
    targetDir: path.resolve(targetDir),
    platform: "",
    skillRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    skipSelfUpdate: false,
    json: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--skip-self-update") {
      options.skipSelfUpdate = true;
    } else if (["--platform", "--skill-root"].includes(arg)) {
      const value = rest[index += 1];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === "--platform") options.platform = value;
      if (arg === "--skill-root") options.skillRoot = path.resolve(value);
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!options.platform) throw new Error("--platform is required");
  return options;
}

async function runCli(args) {
  const options = parseArgs(args);
  const result = await runAgentSeedPreflight(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const lines = [];
  if (result.agent_seed.state === "update-available") {
    lines.push(`agent-seed: update-available (${result.agent_seed.current_version} -> ${result.agent_seed.available_version})`);
  } else if (result.agent_seed.state === "version-incompatible") {
    lines.push(`agent-seed: version-incompatible (${result.agent_seed.current_version} < ${result.agent_seed.minimum_version})`);
  } else if (result.agent_seed.state === "baseline-refresh-available") {
    lines.push(`agent-seed: baseline-refresh-available (${result.agent_seed.minimum_version} -> ${result.agent_seed.current_version})`);
  } else if (result.agent_seed.state === "unknown") {
    lines.push("agent-seed: unknown (missing or invalid version baseline evidence)");
  }
  for (const entry of result.managed.filter((candidate) => !["current", "declined-current-version"].includes(candidate.state))) {
    lines.push(`${entry.name}: ${entry.state}`);
  }
  for (const error of result.errors) {
    lines.push(`${error.source}: unknown (${error.message})`);
  }
  if (lines.length > 0) console.log(lines.join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(`[agent-seed-updater] ${error.message}`);
    process.exitCode = 1;
  });
}
