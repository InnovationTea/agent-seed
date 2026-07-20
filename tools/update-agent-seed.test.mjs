import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const updaterScriptUrl = pathToFileURL(path.join(process.cwd(), "skill", "scripts", "update-agent-seed.mjs")).href;

function importUpdater(cacheKey = "") {
  return import(cacheKey ? `${updaterScriptUrl}?${cacheKey}=${Date.now()}` : updaterScriptUrl);
}

function futureDeadline() {
  return new Date(Date.now() + 60_000).toISOString();
}

test("agent-seed updater compares release versions and extracts the agent-seed asset", async () => {
  const updater = await importUpdater();
  const latestRelease = {
    tag_name: "v2.0.0",
    html_url: "https://github.com/owner/agent-seed/releases/tag/v2.0.0",
    assets: [
      {
        name: "agent-seed-release.json",
        browser_download_url: "https://example.invalid/agent-seed-release.json",
      },
      {
        name: "agent-seed.zip",
        browser_download_url: "https://example.invalid/agent-seed.zip",
      },
    ],
  };

  assert.equal(updater.compareVersions("v2.0.0", "v1.9.9") > 0, true);
  assert.equal(updater.compareVersions("v1.2.0", "v1.2.0"), 0);
  assert.equal(updater.compareVersions("v1.2.0", "v1.2.1") < 0, true);

  const update = updater.buildUpdatePlan({
    currentVersion: "v1.0.0",
    latestRelease,
    assetName: "agent-seed.zip",
  });

  assert.equal(update.hasUpdate, true);
  assert.equal(update.currentVersion, "v1.0.0");
  assert.equal(update.latestVersion, "v2.0.0");
  assert.equal(update.asset.name, "agent-seed.zip");
  assert.equal(update.releaseUrl, latestRelease.html_url);
});

test("agent-seed updater opts into Node env proxy support when proxy variables are configured", async () => {
  const updater = await importUpdater("proxy");
  const reexec = updater.getEnvProxyReexecArgs({
    argv: ["C:\\node\\node.exe", "C:\\agent-seed\\scripts\\update-agent-seed.mjs", "--json"],
    execArgv: ["--trace-warnings"],
    env: {
      HTTPS_PROXY: "http://proxy.example:8080",
    },
    allowedFlags: new Set(["--use-env-proxy"]),
  });

  assert.deepEqual(reexec, {
    nodeArgs: ["--trace-warnings", "--use-env-proxy", "C:\\agent-seed\\scripts\\update-agent-seed.mjs", "--json"],
    env: {
      HTTPS_PROXY: "http://proxy.example:8080",
      AGENT_SEED_ENV_PROXY_REEXEC: "1",
    },
  });
});

test("agent-seed updater does not reexec when env proxy support is already active or unnecessary", async () => {
  const updater = await importUpdater("proxy-skip");

  assert.equal(
    updater.getEnvProxyReexecArgs({
      argv: ["node", "update-agent-seed.mjs", "--json"],
      execArgv: ["--use-env-proxy"],
      env: {
        HTTPS_PROXY: "http://proxy.example:8080",
      },
      allowedFlags: new Set(["--use-env-proxy"]),
    }),
    null,
  );
  assert.equal(
    updater.getEnvProxyReexecArgs({
      argv: ["node", "update-agent-seed.mjs", "--json"],
      execArgv: [],
      env: {},
      allowedFlags: new Set(["--use-env-proxy"]),
    }),
    null,
  );
});

test("agent-seed updater persists proxy settings in the unified local config", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-proxy-config-"));

  try {
    const updater = await importUpdater("proxy-config");
    const configPath = path.join(rootDir, ".agents", "agent-seed.json");

    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify(
        {
          knowledge_asset_write_mode: "agent-approve",
        },
        null,
        2,
      )}\n`,
    );

    await updater.writeAgentSeedProxyConfig({
      configPath,
      proxy: {
        httpsProxy: "http://proxy.example:8080",
        noProxy: "localhost,127.0.0.1",
      },
    });

    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(config.knowledge_asset_write_mode, "agent-approve");
    assert.equal(config.self_update.proxy.https_proxy, "http://proxy.example:8080");
    assert.equal(config.self_update.proxy.no_proxy, "localhost,127.0.0.1");

    const env = updater.buildProxyEnvironment({}, config);
    assert.equal(env.HTTPS_PROXY, "http://proxy.example:8080");
    assert.equal(env.NO_PROXY, "localhost,127.0.0.1");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed updater falls back to Git proxy config when no updater proxy is configured", async () => {
  const updater = await importUpdater("git-proxy");
  const calls = [];

  const env = await updater.buildProxyEnvironmentWithSystemProxy({
    env: {},
    config: {},
    commandRunner: async (command, args) => {
      calls.push([command, args]);
      return "http://git.proxy.example:8080\n";
    },
  });

  assert.equal(env.HTTPS_PROXY, "http://git.proxy.example:8080");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["git", ["config", "--get-urlmatch", "http.proxy", "https://api.github.com/"]]);
});

test("agent-seed updater keeps explicit proxy config ahead of Git proxy config", async () => {
  const updater = await importUpdater("git-proxy-precedence");
  let commandCalled = false;

  const env = await updater.buildProxyEnvironmentWithSystemProxy({
    env: {},
    config: {
      self_update: {
        proxy: {
          https_proxy: "http://configured.proxy.example:8080",
        },
      },
    },
    commandRunner: async () => {
      commandCalled = true;
      return "http://git.proxy.example:8080\n";
    },
  });

  assert.equal(env.HTTPS_PROXY, "http://configured.proxy.example:8080");
  assert.equal(commandCalled, false);
});

test("agent-seed updater falls back to Windows system proxy when Git proxy is not configured", async () => {
  const updater = await importUpdater("windows-proxy");
  const calls = [];

  const env = await updater.buildProxyEnvironmentWithSystemProxy({
    env: {},
    config: {},
    platform: "win32",
    commandRunner: async (command, args) => {
      calls.push([command, args]);
      if (command === "git") {
        throw Object.assign(new Error("not configured"), { code: 1 });
      }

      if (args.includes("ProxyEnable")) {
        return [
          "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
          "    ProxyEnable    REG_DWORD    0x1",
        ].join("\n");
      }

      if (args.includes("ProxyServer")) {
        return [
          "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
          "    ProxyServer    REG_SZ    http=system.proxy.example:8080;https=secure.proxy.example:8443",
        ].join("\n");
      }

      if (args.includes("ProxyOverride")) {
        return [
          "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
          "    ProxyOverride    REG_SZ    localhost;127.0.0.1;<local>",
        ].join("\n");
      }

      return "";
    },
  });

  assert.equal(env.HTTPS_PROXY, "http://secure.proxy.example:8443");
  assert.equal(env.NO_PROXY, "localhost,127.0.0.1");
  assert.ok(calls.some(([command, args]) => command === "reg" && args.includes("ProxyServer")));
});

test("agent-seed updater ignores disabled Windows system proxy", async () => {
  const updater = await importUpdater("windows-proxy-disabled");

  const env = await updater.buildProxyEnvironmentWithSystemProxy({
    env: {},
    config: {},
    platform: "win32",
    commandRunner: async (command, args) => {
      if (command === "git") {
        throw Object.assign(new Error("not configured"), { code: 1 });
      }

      if (args.includes("ProxyEnable")) {
        return [
          "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
          "    ProxyEnable    REG_DWORD    0x0",
        ].join("\n");
      }

      return "";
    },
  });

  assert.equal(env.HTTPS_PROXY, undefined);
});

test("agent-seed updater identifies likely missing-proxy network failures", async () => {
  const updater = await importUpdater("proxy-error");

  assert.equal(
    updater.isLikelyProxyNetworkError(
      Object.assign(new Error("ConnectTimeoutError: Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
    ),
    true,
  );
  assert.equal(updater.isLikelyProxyNetworkError(Object.assign(new Error("getaddrinfo ENOTFOUND api.github.com"), { code: "ENOTFOUND" })), true);
  assert.equal(updater.isLikelyProxyNetworkError(new Error("GitHub latest release request failed: 404 Not Found")), false);
});

test("agent-seed updater prompts for a proxy after proxy-like network failure and persists it", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-proxy-prompt-"));

  try {
    const updater = await importUpdater("proxy-prompt");
    const configPath = path.join(rootDir, ".agents", "agent-seed.json");

    const nextEnv = await updater.promptForProxyAfterNetworkError({
      error: Object.assign(new Error("ConnectTimeoutError: Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
      configPath,
      env: {},
      input: Readable.from(["http://proxy.example:8080\n"]),
      output: new PassThrough(),
      isInteractive: true,
    });

    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(config.self_update.proxy.https_proxy, "http://proxy.example:8080");
    assert.equal(nextEnv.HTTPS_PROXY, "http://proxy.example:8080");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed updater gives proxy guidance without prompting in json mode", async () => {
  const updater = await importUpdater("proxy-guidance");
  const originalError = Object.assign(new Error("ConnectTimeoutError: Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" });

  const prompted = await updater.promptForProxyAfterNetworkError({
    error: originalError,
    configPath: path.join(tmpdir(), "agent-seed-json-proxy.json"),
    env: {},
    input: Readable.from(["http://proxy.example:8080\n"]),
    output: new PassThrough(),
    isInteractive: true,
    json: true,
  });
  const guidedError = updater.withProxyGuidance(originalError);

  assert.equal(prompted, null);
  assert.match(guidedError.message, /--set-https-proxy/);
});

test("agent-seed updater records denied network checks as deferred local state", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-network-denied-"));

  try {
    const updater = await importUpdater("network-denied");
    const configPath = path.join(rootDir, ".agents", "agent-seed.json");

    await updater.writeAgentSeedNetworkDeniedState({
      configPath,
      now: new Date("2026-07-10T00:00:00.000Z"),
    });

    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(config.self_update.last_check.status, "deferred");
    assert.equal(config.self_update.last_check.reason, "network-denied");
    assert.equal(config.self_update.last_check.checked_at, "2026-07-10T00:00:00.000Z");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed updater verifies advertised asset digests before extraction", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-digest-"));

  try {
    const updater = await importUpdater("asset-digest");
    const zipPath = path.join(rootDir, "agent-seed.zip");
    await writeFile(zipPath, "release bytes\n");
    const digest = createHash("sha256").update("release bytes\n").digest("hex");

    await updater.verifyAssetDigest(zipPath, { digest: `sha256:${digest}` });
    await assert.rejects(
      updater.verifyAssetDigest(zipPath, { digest: `sha256:${"0".repeat(64)}` }),
      /digest mismatch/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed updater records queued updates in unified local state", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-queued-state-"));

  try {
    const updater = await importUpdater("queued-state");
    const configPath = path.join(rootDir, ".agents", "agent-seed.json");

    await updater.writeAgentSeedUpdateState({
      configPath,
      status: "queued",
      reason: "windows-directory-locked",
      currentVersion: "v0.2.11",
      latestVersion: "v0.2.12",
      now: new Date("2026-07-19T00:00:00.000Z"),
    });

    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.deepEqual(config.self_update.last_check, {
      status: "queued",
      reason: "windows-directory-locked",
      current_version: "v0.2.11",
      latest_version: "v0.2.12",
      checked_at: "2026-07-19T00:00:00.000Z",
    });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed updater queues a locked Windows replacement and helper completes it", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-deferred-update-"));

  try {
    const updater = await importUpdater("deferred-update");
    const sourceDir = path.join(rootDir, "new-skill");
    const targetDir = path.join(rootDir, "target-skill");
    const stageRoot = path.join(rootDir, "stages");
    const configPath = path.join(rootDir, ".agents", "agent-seed.json");
    const zipPath = path.join(rootDir, "agent-seed.zip");
    const launches = [];

    await mkdir(sourceDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(sourceDir, "SKILL.md"), "---\nname: agent-seed\n---\n");
    await writeFile(path.join(sourceDir, "VERSION.json"), '{"version":"v0.2.12"}\n');
    await writeFile(path.join(targetDir, "SKILL.md"), "old skill\n");
    await writeFile(path.join(targetDir, "stale.txt"), "old file\n");
    await createTestZip(sourceDir, zipPath);

    const queued = await updater.applyUpdate({
      targetDir,
      asset: { name: "agent-seed.zip", browser_download_url: pathToFileURL(zipPath).href },
      configPath,
      currentVersion: "v0.2.11",
      latestVersion: "v0.2.12",
      platform: "win32",
      stageRoot,
      replace: async () => {
        throw Object.assign(new Error("directory is busy"), { code: "EBUSY" });
      },
      launcher: (command, args, options) => {
        launches.push({ command, args, options });
        return { unref() {} };
      },
    });

    assert.equal(queued.status, "queued");
    assert.equal(launches.length, 1);
    assert.equal(await readFile(path.join(queued.stagePath, "expanded", "VERSION.json"), "utf8"), '{"version":"v0.2.12"}\n');

    await updater.runDeferredUpdate({
      stagePath: queued.stagePath,
      sleep: async () => {},
    });

    assert.equal(await readFile(path.join(targetDir, "VERSION.json"), "utf8"), '{"version":"v0.2.12"}\n');
    await assert.rejects(readFile(path.join(targetDir, "stale.txt"), "utf8"), /ENOENT/);
    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(config.self_update.last_check.status, "updated");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed updater restores the prior skill when installed version verification fails", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-version-rollback-"));

  try {
    const updater = await importUpdater("version-rollback");
    const sourceDir = path.join(rootDir, "new-skill");
    const targetDir = path.join(rootDir, "target-skill");
    const zipPath = path.join(rootDir, "agent-seed.zip");

    await mkdir(sourceDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(sourceDir, "SKILL.md"), "new skill\n");
    await writeFile(path.join(sourceDir, "VERSION.json"), '{"version":"v0.2.13"}\n');
    await writeFile(path.join(targetDir, "SKILL.md"), "old skill\n");
    await writeFile(path.join(targetDir, "VERSION.json"), '{"version":"v0.2.11"}\n');
    await createTestZip(sourceDir, zipPath);

    await assert.rejects(
      updater.applyUpdate({
        targetDir,
        asset: { name: "agent-seed.zip", browser_download_url: pathToFileURL(zipPath).href },
        latestVersion: "v0.2.12",
        platform: "win32",
        stageRoot: path.join(rootDir, "stages"),
      }),
      /Installed update version mismatch/,
    );

    assert.equal(await readFile(path.join(targetDir, "SKILL.md"), "utf8"), "old skill\n");
    assert.equal(await readFile(path.join(targetDir, "VERSION.json"), "utf8"), '{"version":"v0.2.11"}\n');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed updater does not queue ordinary Windows permission errors", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-permission-error-"));

  try {
    const updater = await importUpdater("permission-error");
    const sourceDir = path.join(rootDir, "new-skill");
    const targetDir = path.join(rootDir, "target-skill");
    const zipPath = path.join(rootDir, "agent-seed.zip");

    await mkdir(sourceDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(sourceDir, "SKILL.md"), "new skill\n");
    await createTestZip(sourceDir, zipPath);

    await assert.rejects(
      updater.applyUpdate({
        targetDir,
        asset: { name: "agent-seed.zip", browser_download_url: pathToFileURL(zipPath).href },
        platform: "win32",
        stageRoot: path.join(rootDir, "stages"),
        replace: async () => {
          throw Object.assign(new Error("access denied"), { code: "EPERM" });
        },
        launcher: () => {
          throw new Error("ordinary permission failures must not launch a helper");
        },
      }),
      /access denied/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed deferred helper does not replace a newer installed version", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-no-downgrade-"));

  try {
    const updater = await importUpdater("no-downgrade");
    const stageDir = path.join(rootDir, "stage");
    const targetDir = path.join(rootDir, "target-skill");
    await mkdir(path.join(stageDir, "expanded"), { recursive: true });
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(stageDir, "expanded", "VERSION.json"), '{"version":"v0.2.12"}\n');
    await writeFile(path.join(targetDir, "VERSION.json"), '{"version":"v0.2.13"}\n');
    await writeFile(path.join(targetDir, "SKILL.md"), "newer skill\n");
    await writeFile(path.join(stageDir, "update-stage.json"), `${JSON.stringify({
      status: "queued",
      targetDir,
      sourceDir: path.join(stageDir, "expanded"),
      backupDir: path.join(stageDir, "backup"),
      latestVersion: "v0.2.12",
      deadlineAt: futureDeadline(),
    })}\n`);

    const result = await updater.runDeferredUpdate({ stagePath: stageDir });

    assert.equal(result.status, "superseded");
    assert.equal(await readFile(path.join(targetDir, "SKILL.md"), "utf8"), "newer skill\n");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed deferred helper records timeout failures and retains diagnostics", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-timeout-"));

  try {
    const updater = await importUpdater("timeout");
    const stageDir = path.join(rootDir, "stage");
    const configPath = path.join(rootDir, ".agents", "agent-seed.json");
    await mkdir(stageDir, { recursive: true });
    await writeFile(path.join(stageDir, "update-stage.json"), `${JSON.stringify({
      status: "queued",
      targetDir: path.join(rootDir, "target-skill"),
      sourceDir: path.join(stageDir, "expanded"),
      backupDir: path.join(stageDir, "backup"),
      configPath,
      currentVersion: "v0.2.11",
      latestVersion: "v0.2.12",
      deadlineAt: "2026-07-18T00:00:00.000Z",
    })}\n`);

    await assert.rejects(
      updater.runDeferredUpdate({
        stagePath: stageDir,
        now: () => new Date("2026-07-19T00:00:00.000Z"),
        replace: async () => {
          throw Object.assign(new Error("directory is busy"), { code: "EBUSY" });
        },
      }),
      /Timed out waiting for update lock/,
    );

    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(config.self_update.last_check.reason, "lock-timeout");
    assert.match(await readFile(path.join(stageDir, "update.log"), "utf8"), /replacement failed/);
    const stage = JSON.parse(await readFile(path.join(stageDir, "update-stage.json"), "utf8"));
    assert.equal(stage.status, "failed");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed deferred helper rechecks superseded state before retrying", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-superseded-retry-"));

  try {
    const updater = await importUpdater("superseded-retry");
    const stageDir = path.join(rootDir, "stage");
    const recordPath = path.join(stageDir, "update-stage.json");
    const stage = {
      status: "queued",
      targetDir: path.join(rootDir, "target-skill"),
      sourceDir: path.join(stageDir, "expanded"),
      backupDir: path.join(stageDir, "backup"),
      latestVersion: "v0.2.12",
      deadlineAt: futureDeadline(),
    };
    let replaceCalls = 0;

    await mkdir(stageDir, { recursive: true });
    await writeFile(recordPath, `${JSON.stringify(stage)}\n`);

    const result = await updater.runDeferredUpdate({
      stagePath: stageDir,
      now: () => new Date("2026-07-19T00:00:00.000Z"),
      replace: async () => {
        replaceCalls += 1;
        throw Object.assign(new Error("directory is busy"), { code: "EBUSY" });
      },
      sleep: async () => {
        await writeFile(recordPath, `${JSON.stringify({ ...stage, status: "superseded" })}\n`);
      },
    });

    assert.equal(result.status, "superseded");
    assert.equal(replaceCalls, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed updater replaces the target directory without stale files", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-update-replace-"));

  try {
    const updater = await importUpdater("replace");
    const sourceDir = path.join(rootDir, "new-skill");
    const targetDir = path.join(rootDir, "target-skill");
    const zipPath = path.join(rootDir, "agent-seed.zip");

    await mkdir(sourceDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(sourceDir, "SKILL.md"), "---\nname: agent-seed\n---\n");
    await writeFile(path.join(targetDir, "stale.txt"), "old file\n");
    await writeFile(path.join(targetDir, "SKILL.md"), "old skill\n");
    await createTestZip(sourceDir, zipPath);

    await updater.applyUpdate({
      targetDir,
      asset: {
        name: "agent-seed.zip",
        browser_download_url: pathToFileURL(zipPath).href,
      },
      platform: "linux",
    });

    assert.equal(await readFile(path.join(targetDir, "SKILL.md"), "utf8"), "---\nname: agent-seed\n---\n");
    await assert.rejects(readFile(path.join(targetDir, "stale.txt"), "utf8"), /ENOENT/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed updater falls back to curl when Node download fails behind a proxy", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-curl-fallback-"));

  try {
    const updater = await importUpdater("curl-fallback");
    const zipPath = path.join(rootDir, "agent-seed.zip");
    const calls = [];

    await updater.downloadAsset(
      "https://github.com/InnovationTea/agent-seed/releases/download/v0.2.10/agent-seed.zip",
      zipPath,
      {
        env: { HTTPS_PROXY: "http://127.0.0.1:1" },
        fetchImpl: async () => {
          throw Object.assign(new Error("fetch failed"), { code: "ECONNRESET" });
        },
        commandRunner: async (command, args) => {
          calls.push([command, args]);
          await writeFile(zipPath, "curl-downloaded\n");
          return "";
        },
      },
    );

    assert.equal(await readFile(zipPath, "utf8"), "curl-downloaded\n");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "curl");
    assert.deepEqual(calls[0][1], [
      "-sS",
      "-L",
      "--max-time",
      "120",
      "-A",
      "agent-seed-updater",
      "-o",
      zipPath,
      "-x",
      "http://127.0.0.1:1",
      "-k",
      "https://github.com/InnovationTea/agent-seed/releases/download/v0.2.10/agent-seed.zip",
    ]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed updater curl fallback omits proxy flags without a proxy env", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-curl-no-proxy-"));

  try {
    const updater = await importUpdater("curl-no-proxy");
    const zipPath = path.join(rootDir, "agent-seed.zip");
    const calls = [];

    await updater.downloadAsset(
      "https://github.com/InnovationTea/agent-seed/releases/download/v0.2.10/agent-seed.zip",
      zipPath,
      {
        env: {},
        fetchImpl: async () => {
          throw Object.assign(new Error("fetch failed"), { code: "ECONNRESET" });
        },
        commandRunner: async (command, args) => {
          calls.push([command, args]);
          await writeFile(zipPath, "direct-curl\n");
          return "";
        },
      },
    );

    assert.equal(await readFile(zipPath, "utf8"), "direct-curl\n");
    assert.equal(calls[0][1].includes("-x"), false);
    assert.equal(calls[0][1].includes("-k"), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed updater raises combined error when curl fallback also fails", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-seed-curl-fail-"));

  try {
    const updater = await importUpdater("curl-fail");
    const zipPath = path.join(rootDir, "agent-seed.zip");

    await assert.rejects(
      updater.downloadAsset(
        "https://github.com/InnovationTea/agent-seed/releases/download/v0.2.10/agent-seed.zip",
        zipPath,
        {
          env: {},
          fetchImpl: async () => {
            throw Object.assign(new Error("fetch failed"), { code: "ECONNRESET" });
          },
          commandRunner: async () => {
            throw Object.assign(new Error("curl: (7) Failed to connect"), { code: 7 });
          },
        },
      ),
      (error) => {
        assert.equal(error.curlFailed, true);
        assert.match(error.message, /curl fallback download also failed/);
        assert.match(error.message, /prior Node download error: fetch failed/);
        assert.equal(error.code, 7);
        return true;
      },
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("agent-seed updater fetchLatestRelease falls back to curl when Node request fails", async () => {
  const updater = await importUpdater("release-curl");
  const calls = [];

  const release = await updater.fetchLatestRelease("InnovationTea/agent-seed", {
    env: { HTTPS_PROXY: "http://127.0.0.1:1" },
    fetchImpl: async () => {
      throw Object.assign(new Error("fetch failed"), { code: "ECONNRESET" });
    },
    commandRunner: async (command, args) => {
      calls.push([command, args]);
      return JSON.stringify({ tag_name: "v9.9.9", assets: [{ name: "agent-seed.zip", browser_download_url: "https://example/zip" }] });
    },
  });

  assert.equal(release.tag_name, "v9.9.9");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "curl");
  assert.equal(calls[0][1].includes("-x"), true);
  assert.equal(calls[0][1].includes("-k"), true);
  assert.equal(calls[0][1].includes("Accept: application/vnd.github+json"), true);
});


async function createTestZip(sourceDir, zipPath) {
  await execFileAsync("powershell", [
    "-NoProfile",
    "-Command",
    [
      "& { param($sourceDir, $zipPath)",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
      "[System.IO.Compression.ZipFile]::CreateFromDirectory($sourceDir, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)",
      "}",
    ].join(" "),
    sourceDir,
    zipPath,
  ]);
}
