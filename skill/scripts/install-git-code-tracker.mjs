import { execFile } from "node:child_process";
import { access, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ARCHIVE_PATH = path.join(scriptDir, "..", "packages", "git-code-tracker", "ai-commit-statistic-skill-v1.0.3.zip");

const PLATFORMS = {
  opencode: {
    sourcePath: path.join(".opencode", "skills", "ai-code-tracker"),
    targetPath: path.join(".opencode", "skills", "ai-code-tracker"),
  },
  claude: {
    sourcePath: path.join(".claude", "skills", "ai-code-tracker"),
    targetPath: path.join(".claude", "skills", "ai-code-tracker"),
  },
  "codeagent-cli": {
    sourcePath: path.join(".cac", "skills", "ai-code-tracker"),
    targetPath: path.join(".cac", "skills", "ai-code-tracker"),
  },
};

export async function selectPlatforms({ targetDir, platform, env = process.env }) {
  const explicitPlatform = normalizePlatform(platform);
  if (explicitPlatform) {
    return explicitPlatform === "all" ? Object.keys(PLATFORMS) : [explicitPlatform];
  }

  const runtimePlatform = detectRuntimePlatform(env);
  if (runtimePlatform) {
    return [runtimePlatform];
  }

  const projectPlatforms = await detectProjectPlatforms(targetDir);
  if (projectPlatforms.length === 1) {
    return projectPlatforms;
  }

  throw new Error("Unable to determine a single target platform. Re-run with --platform <opencode|claude|codeagent-cli|all>.");
}

export async function installGitCodeTracker({
  targetDir = process.cwd(),
  platform,
  env = process.env,
  archivePath = DEFAULT_ARCHIVE_PATH,
} = {}) {
  const resolvedTargetDir = path.resolve(targetDir);
  const resolvedArchivePath = path.resolve(archivePath);
  await assertFile(resolvedArchivePath, "release asset");

  const platforms = await selectPlatforms({ targetDir: resolvedTargetDir, platform, env });
  for (const selectedPlatform of platforms) {
    await installPlatform({
      targetDir: resolvedTargetDir,
      platform: selectedPlatform,
      env,
      archivePath: resolvedArchivePath,
    });
  }

  return { targetDir: resolvedTargetDir, platforms };
}

async function installPlatform({ targetDir, platform, env, archivePath }) {
  const config = PLATFORMS[platform];
  const stagingDir = await mkdtemp(path.join(tmpdir(), "agent-seed-git-code-tracker-"));

  try {
    await extractArchive(archivePath, stagingDir);

    const sourceDir = path.join(stagingDir, config.sourcePath);
    await assertDirectory(sourceDir, `${platform} skill in release asset`);

    const targetSkillDir = path.join(targetDir, config.targetPath);
    await rm(targetSkillDir, { recursive: true, force: true });
    await cp(sourceDir, targetSkillDir, { recursive: true });

    const installScript = path.join(targetSkillDir, "scripts", "install.js");
    const installEnv = { ...env, AI_CODE_TRACKER_PROCESS_TREE: platform };
    await execFileAsync(process.execPath, [installScript], { cwd: targetDir, env: installEnv });
    await execFileAsync(process.execPath, [installScript, "--check"], { cwd: targetDir, env: installEnv });
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

async function extractArchive(archivePath, destinationDir) {
  const command = [
    "-NoProfile",
    "-Command",
    [
      "& { param($archivePath, $destinationDir)",
      "Expand-Archive -LiteralPath $archivePath -DestinationPath $destinationDir -Force",
      "}",
    ].join("; "),
    archivePath,
    destinationDir,
  ];

  await execFileAsync("powershell", command, { windowsHide: true });
}

function normalizePlatform(value) {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized === "opencode") {
    return "opencode";
  }
  if (normalized === "claude" || normalized === "claude-code") {
    return "claude";
  }
  if (normalized === "codeagent-cli" || normalized === "codeagent" || normalized === "cac") {
    return "codeagent-cli";
  }
  if (normalized === "all") {
    return "all";
  }

  throw new Error(`Unsupported platform: ${value}`);
}

function detectRuntimePlatform(env) {
  return normalizePlatform(
    env.AGENT_SEED_PLATFORM ||
      env.AI_AGENT_PLATFORM ||
      (env.CLAUDE_CODE || env.CLAUDE_CODE_SESSION ? "claude" : "") ||
      (env.CAC_SESSION || env.CODEAGENT_CLI || env.CODEAGENT_SESSION ? "codeagent-cli" : "") ||
      (env.OPENCODE_SESSION ? "opencode" : ""),
  );
}

async function detectProjectPlatforms(targetDir) {
  const detected = [];
  for (const [platform, marker] of [
    ["opencode", ".opencode"],
    ["claude", ".claude"],
    ["codeagent-cli", ".cac"],
  ]) {
    try {
      await access(path.join(targetDir, marker));
      detected.push(platform);
    } catch {}
  }
  return detected;
}

async function assertFile(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

async function assertDirectory(directoryPath, label) {
  try {
    await access(directoryPath);
  } catch {
    throw new Error(`Missing ${label}: ${directoryPath}`);
  }
}

function parseArgs(args) {
  let targetDir = null;
  let platform = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--platform") {
      platform = args[index += 1];
      if (!platform) {
        throw new Error("--platform requires a value");
      }
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new Error("Usage: node scripts/install-git-code-tracker.mjs [target-project] [--platform <opencode|claude|codeagent-cli|all>]");
    }
    if (!targetDir) {
      targetDir = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }

  return { targetDir: targetDir ?? process.cwd(), platform };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  installGitCodeTracker(parseArgs(process.argv.slice(2)))
    .then(({ platforms }) => console.log(`git-code-tracker installed for ${platforms.join(", ")}`))
    .catch((error) => {
      console.error(`[git-code-tracker] ${error.message}`);
      process.exitCode = 1;
    });
}
