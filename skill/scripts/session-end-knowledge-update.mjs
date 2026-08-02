import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CHILD_SESSION_ENV = "AGENT_SEED_SESSION_END_CHILD";
const DEFAULT_WRITE_MODE = "full-access";
const SUPPORTED_PLATFORMS = new Set(["claude-code", "codeagent-cli"]);

export function resolveSessionEndPolicy(config = {}) {
  return {
    sessionEndKnowledgeUpdate: config.session_end_knowledge_update !== false,
    knowledgeAssetWriteMode: config.knowledge_asset_write_mode || DEFAULT_WRITE_MODE,
  };
}

export function shouldSkipRecursiveSession(env = process.env) {
  return env[CHILD_SESSION_ENV] === "1";
}

export function buildKnowledgePrompt({ projectRoot, transcriptPath }) {
  return [
    "Perform a knowledge-only Agent Seed update for this project.",
    `Project root: ${projectRoot}`,
    `Session transcript: ${transcriptPath}`,
    "Read the transcript and extract only durable, project-reusable engineering knowledge.",
    "Update only the bounded Reusable Knowledge section in AGENTS.md.",
    "If there is no durable knowledge, make no file changes.",
    "You must not change source code, tests, dependencies, hooks, platform settings, or external integrations.",
    "Never copy credentials, tokens, cookies, personal data, or one-off incident chatter.",
    "Do not write any other file and do not install or invoke another agent.",
  ].join("\n");
}

export function buildChildProcessSpec({ platform, projectRoot, transcriptPath }) {
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error(`Unsupported session-end platform: ${platform}`);
  }

  const command = platform === "codeagent-cli" ? "codeagent-cli" : "claude";
  return {
    command,
    args: [
      "--print",
      "--output-format",
      "text",
      "--permission-mode",
      "dontAsk",
      "--tools",
      "Read,Edit",
      "--add-dir",
      projectRoot,
      "--add-dir",
      path.dirname(transcriptPath),
      buildKnowledgePrompt({ projectRoot, transcriptPath }),
    ],
  };
}

function resolveExecutable(command) {
  if (process.platform === "win32" && !path.extname(command)) {
    return `${command}.cmd`;
  }
  return command;
}

async function readProjectConfig(projectRoot) {
  const configPath = path.join(projectRoot, ".agents", "agent-seed.json");
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw new Error(`Cannot read ${configPath}: ${error.message}`);
  }
}

function candidatePath(projectRoot) {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  return path.join(projectRoot, ".agents", "session-summaries", `${timestamp}.md`);
}

async function writeCandidate(projectRoot, reason) {
  const outputPath = candidatePath(projectRoot);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    [
      "# Session Knowledge Candidate",
      "",
      "- Status: pending-owner-review",
      "- Source: Claude-compatible SessionEnd hook",
      `- Reason: ${reason}`,
      "- Next action: invoke Agent Seed explicitly and confirm any reusable knowledge before updating AGENTS.md or agents.d/.",
      "",
    ].join("\n"),
    "utf8",
  );
  return outputPath;
}

async function readHookInput() {
  if (process.stdin.isTTY) {
    return {};
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--platform") options.platform = argv[++index];
    if (value === "--project") options.projectRoot = argv[++index];
    if (value === "--transcript") options.transcriptPath = argv[++index];
    if (value === "--json") options.json = true;
  }
  return options;
}

export async function runSessionEndKnowledgeUpdate({ argv = process.argv.slice(2), env = process.env, stdinInput } = {}) {
  if (shouldSkipRecursiveSession(env)) {
    return { status: "skipped", reason: "recursive-child-session" };
  }

  const options = parseArgs(argv);
  const hookInput = stdinInput ?? await readHookInput();
  const projectRoot = path.resolve(options.projectRoot || hookInput.cwd || process.cwd());
  const platform = options.platform || hookInput.platform || "claude-code";
  const transcriptPath = options.transcriptPath || hookInput.transcript_path || "";
  const config = await readProjectConfig(projectRoot);
  const policy = resolveSessionEndPolicy(config);

  if (!policy.sessionEndKnowledgeUpdate) {
    return { status: "skipped", reason: "disabled" };
  }

  if (policy.knowledgeAssetWriteMode !== "full-access") {
    const outputPath = await writeCandidate(projectRoot, "knowledge_asset_write_mode is not full-access");
    return { status: "candidate", outputPath };
  }

  if (!transcriptPath) {
    const outputPath = await writeCandidate(projectRoot, "SessionEnd input did not provide transcript_path");
    return { status: "candidate", outputPath };
  }

  const spec = buildChildProcessSpec({ platform, projectRoot, transcriptPath });
  const result = spawnSync(resolveExecutable(spec.command), spec.args, {
    cwd: projectRoot,
    env: { ...env, [CHILD_SESSION_ENV]: "1" },
    stdio: "ignore",
    timeout: 120_000,
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    const reason = result.error?.message || `child exited with status ${result.status}`;
    const outputPath = await writeCandidate(projectRoot, reason);
    return { status: "candidate", outputPath, reason };
  }

  return { status: "updated", platform };
}

async function main() {
  const result = await runSessionEndKnowledgeUpdate();
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    process.stdout.write(`${result.status}\n`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
