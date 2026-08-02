import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildKnowledgePrompt,
  buildChildProcessSpec,
  resolveSessionEndPolicy,
  runSessionEndKnowledgeUpdate,
  shouldSkipRecursiveSession,
} from "../skill/scripts/session-end-knowledge-update.mjs";

test("session-end policy defaults to enabled knowledge-only full access", () => {
  const policy = resolveSessionEndPolicy({});

  assert.equal(policy.sessionEndKnowledgeUpdate, true);
  assert.equal(policy.knowledgeAssetWriteMode, "full-access");
});

test("session-end child process uses Claude-compatible CLI names and restricted tools", () => {
  const spec = buildChildProcessSpec({
    platform: "codeagent-cli",
    projectRoot: "D:\\repo",
    transcriptPath: "D:\\sessions\\transcript.jsonl",
  });

  assert.equal(spec.command, "codeagent-cli");
  assert.ok(spec.args.includes("--print"));
  assert.ok(spec.args.includes("--tools"));
  assert.ok(spec.args.includes("Read,Edit"));
  assert.ok(spec.args.includes("--permission-mode"));
  assert.ok(spec.args.includes("dontAsk"));
});

test("session-end prompt limits the child agent to reusable AGENTS.md knowledge", () => {
  const prompt = buildKnowledgePrompt({
    projectRoot: "D:\\repo",
    transcriptPath: "D:\\sessions\\transcript.jsonl",
  });

  assert.match(prompt, /AGENTS\.md/);
  assert.match(prompt, /must not change source code/i);
  assert.match(prompt, /credentials/i);
  assert.match(prompt, /transcript\.jsonl/);
});

test("recursive child sessions are skipped", () => {
  assert.equal(shouldSkipRecursiveSession({ AGENT_SEED_SESSION_END_CHILD: "1" }), true);
  assert.equal(shouldSkipRecursiveSession({}), false);
});

test("default session-end policy is ready for a knowledge-only child update", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "agent-seed-session-end-"));

  try {
    await mkdir(path.join(projectRoot, ".agents"), { recursive: true });
    await writeFile(
      path.join(projectRoot, ".agents", "agent-seed.json"),
      JSON.stringify({ knowledge_asset_write_mode: "ask-each-change" }),
    );
    const result = await runSessionEndKnowledgeUpdate({
      argv: ["--platform", "claude-code"],
      env: {},
      stdinInput: {
        cwd: projectRoot,
        transcript_path: path.join(projectRoot, "transcript.jsonl"),
      },
    });

    assert.notEqual(result.status, "skipped");
    const content = await readFile(result.outputPath, "utf8");
    assert.match(content, /pending-owner-review/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
