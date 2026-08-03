import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { inspectManagedUpdates } from "./manage-managed-skills.mjs";

const execFileAsync = promisify(execFile);

export async function runAgentSeedPreflight({
  skillRoot,
  targetDir,
  platform,
  runSelfUpdate = runSelfUpdateCheck,
  inspectManaged = inspectManagedUpdates,
}) {
  const result = { agent_seed: { state: "unknown" }, managed: [], external: [], errors: [] };

  try {
    const update = await runSelfUpdate({ skillRoot, targetDir });
    result.agent_seed = {
      state: update.hasUpdate ? "update-available" : "current",
      current_version: update.currentVersion,
      available_version: update.latestVersion,
      cached: update.cached === true,
    };
  } catch (error) {
    result.errors.push({ source: "agent-seed", message: error.message });
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
    throw new Error("Usage: node scripts/check-agent-seed-updates.mjs <target-project> --platform <platform> [--skill-root <agent-seed-root>] [--json]");
  }

  const options = {
    targetDir: path.resolve(targetDir),
    platform: "",
    skillRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    json: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--json") {
      options.json = true;
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
