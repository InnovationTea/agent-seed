import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import tls from "node:tls";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ASSET_NAME = "agent-seed.zip";
const DEFAULT_CONFIG_PATH = path.join(".agents", "agent-seed.json");
const ENV_PROXY_REEXEC_MARKER = "AGENT_SEED_ENV_PROXY_REEXEC";
const PROXY_ENV_NAMES = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"];

export function compareVersions(left, right) {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

export function buildUpdatePlan({ currentVersion, latestRelease, assetName = DEFAULT_ASSET_NAME }) {
  if (!latestRelease || typeof latestRelease !== "object") {
    throw new Error("latestRelease must be an object");
  }

  const latestVersion = latestRelease.tag_name;
  if (typeof latestVersion !== "string" || latestVersion.trim() === "") {
    throw new Error("latest release is missing tag_name");
  }

  const assets = Array.isArray(latestRelease.assets) ? latestRelease.assets : [];
  const asset = assets.find((entry) => entry.name === assetName);
  if (!asset) {
    throw new Error(`latest release does not include ${assetName}`);
  }

  return {
    hasUpdate: compareVersions(latestVersion, currentVersion) > 0,
    currentVersion,
    latestVersion,
    releaseUrl: latestRelease.html_url || "",
    asset,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const configPath = path.resolve(options.config || DEFAULT_CONFIG_PATH);

  if (hasProxyConfigUpdate(options)) {
    await writeAgentSeedProxyConfig({
      configPath,
      proxy: {
        httpsProxy: options.setHttpsProxy,
        httpProxy: options.setHttpProxy,
        allProxy: options.setAllProxy,
        noProxy: options.setNoProxy,
      },
    });
    console.log(`agent-seed proxy config updated: ${configPath}`);
    return;
  }

  if (options.recordNetworkDenied) {
    await writeAgentSeedNetworkDeniedState({ configPath });
    console.log(`agent-seed update check deferred: ${configPath}`);
    return;
  }

  const agentSeedConfig = await readAgentSeedConfig(configPath);
  let env = await buildProxyEnvironmentWithSystemProxy({ env: process.env, config: agentSeedConfig });

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const defaultTargetDir = path.resolve(scriptDir, "..");
  const targetDir = path.resolve(options.target || defaultTargetDir);
  const versionMetadata = await readVersionMetadata(targetDir);
  const repository = options.repository || versionMetadata.repository;

  if (!repository) {
    throw new Error("Missing repository. Pass --repository owner/repo or use a packaged VERSION.json.");
  }

  const currentVersion = options.currentVersion || versionMetadata.version || "v0.0.0";
  let latestRelease;
  try {
    latestRelease = await fetchLatestRelease(repository, { env });
  } catch (error) {
    const retryEnv = await promptForProxyAfterNetworkError({
      error,
      configPath,
      env,
      json: options.json,
    });

    if (!retryEnv) {
      throw withProxyGuidance(error);
    }

    env = retryEnv;
    latestRelease = await fetchLatestRelease(repository, { env });
  }
  const updatePlan = buildUpdatePlan({
    currentVersion,
    latestRelease,
    assetName: options.assetName || DEFAULT_ASSET_NAME,
  });

  if (options.json) {
    console.log(JSON.stringify(updatePlan, null, 2));
  } else if (!updatePlan.hasUpdate) {
    console.log(`agent-seed is current (${currentVersion}).`);
  } else {
    console.log(`agent-seed update available: ${currentVersion} -> ${updatePlan.latestVersion}`);
    console.log(`Release: ${updatePlan.releaseUrl}`);
  }

  if (!options.apply || !updatePlan.hasUpdate) {
    return;
  }

  await applyUpdate({ targetDir, asset: updatePlan.asset, requestOptions: { env } });
  console.log(`agent-seed updated in ${targetDir}`);
}

export function buildProxyEnvironment(env, config = {}) {
  const proxy = config?.self_update?.proxy || {};
  const result = { ...env };

  applyProxyEnv(result, "HTTPS_PROXY", ["HTTPS_PROXY", "https_proxy"], proxy.https_proxy ?? proxy.httpsProxy);
  applyProxyEnv(result, "HTTP_PROXY", ["HTTP_PROXY", "http_proxy"], proxy.http_proxy ?? proxy.httpProxy);
  applyProxyEnv(result, "ALL_PROXY", ["ALL_PROXY", "all_proxy"], proxy.all_proxy ?? proxy.allProxy);
  applyProxyEnv(result, "NO_PROXY", ["NO_PROXY", "no_proxy"], proxy.no_proxy ?? proxy.noProxy);

  return result;
}

export async function buildProxyEnvironmentWithSystemProxy({
  env = process.env,
  config = {},
  cwd = process.cwd(),
  platform = process.platform,
  commandRunner = runCapture,
} = {}) {
  const result = buildProxyEnvironment(env, config);
  if (hasProxyEnvironment(result)) {
    return result;
  }

  const gitProxy = await readGitProxyConfig({ cwd, commandRunner });
  if (gitProxy) {
    return buildProxyEnvironment(result, {
      self_update: {
        proxy: {
          https_proxy: gitProxy,
        },
      },
    });
  }

  const windowsProxy = await readWindowsSystemProxyConfig({ platform, commandRunner });
  if (windowsProxy.httpsProxy || windowsProxy.noProxy) {
    return buildProxyEnvironment(result, {
      self_update: {
        proxy: {
          https_proxy: windowsProxy.httpsProxy,
          no_proxy: windowsProxy.noProxy,
        },
      },
    });
  }

  return result;
}

export async function writeAgentSeedProxyConfig({ configPath = DEFAULT_CONFIG_PATH, proxy }) {
  const config = await readAgentSeedConfig(configPath);
  const nextProxy = {
    ...(config.self_update?.proxy || {}),
    ...normalizeProxyConfig(proxy),
  };

  await writeAgentSeedConfig(configPath, {
    ...config,
    self_update: {
      ...(config.self_update || {}),
      proxy: nextProxy,
    },
  });
}

export async function writeAgentSeedNetworkDeniedState({ configPath = DEFAULT_CONFIG_PATH, now = new Date() } = {}) {
  const config = await readAgentSeedConfig(configPath);

  await writeAgentSeedConfig(configPath, {
    ...config,
    self_update: {
      ...(config.self_update || {}),
      last_check: {
        status: "deferred",
        reason: "network-denied",
        checked_at: now.toISOString(),
      },
    },
  });
}

export function getEnvProxyReexecArgs({
  argv = process.argv,
  execArgv = process.execArgv,
  env = process.env,
  allowedFlags = process.allowedNodeEnvironmentFlags,
} = {}) {
  if (env[ENV_PROXY_REEXEC_MARKER] === "1" || !hasProxyEnvironment(env)) {
    return null;
  }

  if (!allowedFlags?.has?.("--use-env-proxy")) {
    return null;
  }

  if (hasUseEnvProxyFlag(execArgv) || hasUseEnvProxyFlag(splitNodeOptions(env.NODE_OPTIONS))) {
    return null;
  }

  const scriptAndArgs = argv.slice(1);
  if (scriptAndArgs.length === 0) {
    return null;
  }

  return {
    nodeArgs: [...execArgv, "--use-env-proxy", ...scriptAndArgs],
    env: {
      ...env,
      [ENV_PROXY_REEXEC_MARKER]: "1",
    },
  };
}

export function isLikelyProxyNetworkError(error) {
  const code = error?.code || error?.cause?.code || "";
  const message = `${error?.message || ""} ${error?.cause?.message || ""}`;
  const proxyLikeCodes = new Set([
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "ENOTFOUND",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_SOCKET",
  ]);

  return proxyLikeCodes.has(code) || /ConnectTimeoutError|connect timeout|timed out|ENOTFOUND|getaddrinfo|api\.github\.com:443/i.test(message);
}

export function withProxyGuidance(error) {
  if (!isLikelyProxyNetworkError(error)) {
    return error;
  }

  const guided = new Error(
    [
      error.message,
      "",
      "agent-seed could not reach GitHub. If this network requires a proxy, configure one and retry:",
      "node scripts/update-agent-seed.mjs --set-https-proxy http://proxy.example:8080",
      "node scripts/update-agent-seed.mjs --set-no-proxy localhost,127.0.0.1",
    ].join("\n"),
    { cause: error },
  );
  guided.code = error.code;
  return guided;
}

export async function promptForProxyAfterNetworkError({
  error,
  configPath = DEFAULT_CONFIG_PATH,
  env = process.env,
  input = process.stdin,
  output = process.stderr,
  isInteractive = Boolean(input.isTTY && output.isTTY),
  json = false,
} = {}) {
  if (json || !isInteractive || !isLikelyProxyNetworkError(error) || hasProxyEnvironment(env)) {
    return null;
  }

  const readline = createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
  try {
    const proxyUrl = (
      await readline.question(
        "agent-seed could not reach GitHub. Enter HTTPS proxy URL to save and retry, or leave blank to fail: ",
      )
    ).trim();

    if (!proxyUrl) {
      return null;
    }

    await writeAgentSeedProxyConfig({
      configPath,
      proxy: {
        httpsProxy: proxyUrl,
      },
    });

    const config = await readAgentSeedConfig(configPath);
    return buildProxyEnvironment(env, config);
  } finally {
    readline.close();
  }
}

function applyProxyEnv(env, canonicalName, candidateNames, value) {
  if (typeof value !== "string" || value.trim() === "" || candidateNames.some((name) => env[name])) {
    return;
  }

  env[canonicalName] = value.trim();
}

function normalizeProxyConfig(proxy = {}) {
  const normalized = {};
  const mappings = [
    ["https_proxy", proxy.httpsProxy ?? proxy.https_proxy],
    ["http_proxy", proxy.httpProxy ?? proxy.http_proxy],
    ["all_proxy", proxy.allProxy ?? proxy.all_proxy],
    ["no_proxy", proxy.noProxy ?? proxy.no_proxy],
  ];

  for (const [key, value] of mappings) {
    if (typeof value === "string" && value.trim() !== "") {
      normalized[key] = value.trim();
    }
  }

  return normalized;
}

function hasProxyConfigUpdate(options) {
  return [options.setHttpsProxy, options.setHttpProxy, options.setAllProxy, options.setNoProxy].some(Boolean);
}

function hasProxyEnvironment(env) {
  return PROXY_ENV_NAMES.some((name) => typeof env[name] === "string" && env[name].trim() !== "");
}

function hasUseEnvProxyFlag(args) {
  return args.some((arg) => arg === "--use-env-proxy" || arg === "--use_env_proxy");
}

function splitNodeOptions(nodeOptions = "") {
  return nodeOptions
    .split(/\s+/)
    .map((option) => option.trim())
    .filter(Boolean);
}

function normalizeVersion(version) {
  return String(version || "")
    .trim()
    .replace(/^refs\/tags\//, "")
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function parseArgs(argv) {
  const options = {
    apply: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--repository") {
      options.repository = requireValue(argv, (index += 1), arg);
    } else if (arg === "--target") {
      options.target = requireValue(argv, (index += 1), arg);
    } else if (arg === "--current-version") {
      options.currentVersion = requireValue(argv, (index += 1), arg);
    } else if (arg === "--asset-name") {
      options.assetName = requireValue(argv, (index += 1), arg);
    } else if (arg === "--config") {
      options.config = requireValue(argv, (index += 1), arg);
    } else if (arg === "--set-https-proxy") {
      options.setHttpsProxy = requireValue(argv, (index += 1), arg);
    } else if (arg === "--set-http-proxy") {
      options.setHttpProxy = requireValue(argv, (index += 1), arg);
    } else if (arg === "--set-all-proxy") {
      options.setAllProxy = requireValue(argv, (index += 1), arg);
    } else if (arg === "--set-no-proxy") {
      options.setNoProxy = requireValue(argv, (index += 1), arg);
    } else if (arg === "--record-network-denied") {
      options.recordNetworkDenied = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(argv, index, optionName) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value`);
  }

  return value;
}

async function readAgentSeedConfig(configPath) {
  try {
    return JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeAgentSeedConfig(configPath, config) {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function readVersionMetadata(targetDir) {
  try {
    return JSON.parse(await readFile(path.join(targetDir, "VERSION.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function fetchLatestRelease(repository, requestOptions = {}) {
  const url = `https://api.github.com/repos/${repository}/releases/latest`;

  try {
    const response = await fetchWithProxy(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "agent-seed-updater",
      },
    }, requestOptions);

    if (!response.ok) {
      throw new Error(`GitHub latest release request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (nodeError) {
    return fetchJsonViaCurlFallback(url, requestOptions, nodeError);
  }
}

export async function applyUpdate({ targetDir, asset, requestOptions = {} }) {
  if (!asset.browser_download_url) {
    throw new Error(`Release asset ${asset.name} is missing browser_download_url`);
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-seed-update-"));
  const zipPath = path.join(tempDir, asset.name);
  const extractDir = path.join(tempDir, "expanded");
  const backupDir = path.join(tempDir, "backup");

  try {
    await downloadAsset(asset.browser_download_url, zipPath, requestOptions);
    await extractZip(zipPath, extractDir);
    await replaceDirectory({ sourceDir: extractDir, targetDir, backupDir });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function downloadAsset(downloadUrl, zipPath, requestOptions = {}) {
  if (downloadUrl.startsWith("file:")) {
    await cp(fileURLToPath(downloadUrl), zipPath, { force: true });
    return;
  }

  try {
    const response = await fetchWithProxy(downloadUrl, {
      headers: {
        "User-Agent": "agent-seed-updater",
      },
    }, requestOptions);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    await writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
    return;
  } catch (nodeError) {
    await downloadViaCurlFallback(downloadUrl, zipPath, requestOptions, nodeError);
  }
}

async function downloadViaCurlFallback(downloadUrl, zipPath, requestOptions = {}, nodeError = null) {
  const env = requestOptions.env || process.env;
  const commandRunner = requestOptions.commandRunner || runCapture;
  const proxyUrl = resolveProxyForUrl(downloadUrl, env);
  const args = ["-sS", "-L", "--max-time", "120", "-A", "agent-seed-updater", "-o", zipPath];

  if (proxyUrl) {
    args.push("-x", proxyUrl, "-k");
  }

  args.push(downloadUrl);

  try {
    await commandRunner("curl", args, { env });
  } catch (curlError) {
    throw wrapCurlFallbackError(curlError, nodeError);
  }
}

async function fetchJsonViaCurlFallback(url, requestOptions = {}, nodeError = null) {
  const env = requestOptions.env || process.env;
  const commandRunner = requestOptions.commandRunner || runCapture;
  const proxyUrl = resolveProxyForUrl(url, env);
  const args = ["-sS", "-L", "--max-time", "60", "-A", "agent-seed-updater", "-H", "Accept: application/vnd.github+json"];

  if (proxyUrl) {
    args.push("-x", proxyUrl, "-k");
  }

  args.push(url);

  let stdout;
  try {
    stdout = await commandRunner("curl", args, { env });
  } catch (curlError) {
    throw wrapCurlFallbackError(curlError, nodeError);
  }

  try {
    return JSON.parse(String(stdout || ""));
  } catch (parseError) {
    const wrapped = new Error(`curl fallback returned invalid JSON: ${parseError.message}`, { cause: parseError });
    wrapped.curlFailed = true;
    wrapped.nodeError = nodeError;
    throw wrapped;
  }
}

function wrapCurlFallbackError(curlError, nodeError) {
  const reason = String(curlError?.message || "").trim() || String(curlError?.code || "");
  const wrapped = new Error(
    [
      `curl fallback download also failed: ${reason}`,
      nodeError ? `prior Node download error: ${nodeError.message}` : "",
    ].filter(Boolean).join("\n"),
    { cause: curlError },
  );
  wrapped.code = curlError?.code;
  wrapped.curlFailed = true;
  wrapped.nodeError = nodeError;
  return wrapped;
}

async function fetchWithProxy(url, init = {}, { env = process.env, fetchImpl = fetch, maxRedirects = 5 } = {}) {
  if (fetchImpl !== fetch) {
    return fetchImpl(url, init);
  }

  const proxyUrl = resolveProxyForUrl(url, env);
  if (!proxyUrl) {
    return fetchImpl(url, init);
  }

  return fetchViaHttpProxy(url, init, { env, maxRedirects });
}

export function resolveProxyForUrl(url, env = process.env) {
  const requestUrl = new URL(url);
  const noProxy = env.NO_PROXY || env.no_proxy || "";
  if (matchesNoProxy(requestUrl.hostname, noProxy)) {
    return "";
  }

  const candidateNames =
    requestUrl.protocol === "https:"
      ? ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"]
      : ["HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"];

  for (const name of candidateNames) {
    if (typeof env[name] === "string" && env[name].trim() !== "") {
      return env[name].trim();
    }
  }

  return "";
}

function matchesNoProxy(hostname, noProxy) {
  if (typeof noProxy !== "string" || noProxy.trim() === "") {
    return false;
  }

  const host = hostname.toLowerCase();
  return noProxy
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => {
      if (entry === "*") {
        return true;
      }

      if (entry.startsWith(".")) {
        return host.endsWith(entry);
      }

      return host === entry || host.endsWith(`.${entry}`);
    });
}

async function fetchViaHttpProxy(url, init = {}, { env = process.env, maxRedirects = 5 } = {}) {
  const proxyUrl = resolveProxyForUrl(url, env);
  const response = await requestViaHttpProxy(url, init, proxyUrl);

  if (isRedirect(response.status) && response.headers.location && maxRedirects > 0) {
    const nextUrl = new URL(response.headers.location, url).href;
    return fetchViaHttpProxy(nextUrl, init, { env, maxRedirects: maxRedirects - 1 });
  }

  return response;
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

async function requestViaHttpProxy(url, init, proxyUrl) {
  const requestUrl = new URL(url);
  const proxy = new URL(proxyUrl);

  if (requestUrl.protocol !== "https:" || proxy.protocol !== "http:") {
    throw new Error("agent-seed proxy support currently requires an http:// proxy for https:// update URLs.");
  }

  const agent = createHttpProxyAgent(proxy);

  return new Promise((resolve, reject) => {
    const request = https.request(
      requestUrl,
      {
        method: init.method || "GET",
        headers: init.headers || {},
        agent,
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve(
            new BufferedResponse({
              status: response.statusCode || 0,
              statusText: response.statusMessage || "",
              headers: response.headers,
              body: Buffer.concat(chunks),
            }),
          );
        });
      },
    );

    request.setTimeout(30_000, () => {
      request.destroy(Object.assign(new Error("Request timed out"), { code: "ETIMEDOUT" }));
    });
    request.on("error", reject);
    request.end(init.body);
  });
}

function createHttpProxyAgent(proxy) {
  return new https.Agent({
    keepAlive: false,
    createConnection(options, callback) {
      const targetHost = options.hostname || options.host;
      const targetPort = options.port || 443;
      const headers = {
        Host: `${targetHost}:${targetPort}`,
      };

      if (proxy.username || proxy.password) {
        headers["Proxy-Authorization"] = `Basic ${Buffer.from(
          `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`,
        ).toString("base64")}`;
      }

      const connectRequest = http.request({
        host: proxy.hostname,
        port: proxy.port || 80,
        method: "CONNECT",
        path: `${targetHost}:${targetPort}`,
        headers,
      });

      let settled = false;
      const finish = (error, socket) => {
        if (settled) {
          return;
        }

        settled = true;
        callback(error, socket);
      };

      connectRequest.on("connect", (response, socket) => {
        if (response.statusCode !== 200) {
          socket.destroy();
          finish(new Error(`Proxy CONNECT failed: ${response.statusCode} ${response.statusMessage || ""}`.trim()));
          return;
        }

        const tlsSocket = tls.connect({
          socket,
          servername: targetHost,
        });
        tlsSocket.once("secureConnect", () => finish(null, tlsSocket));
        tlsSocket.once("error", (error) => finish(error));
      });
      connectRequest.once("error", (error) => finish(error));
      connectRequest.end();
    },
  });
}

class BufferedResponse {
  constructor({ status, statusText, headers, body }) {
    this.status = status;
    this.statusText = statusText;
    this.headers = headers;
    this.body = body;
  }

  get ok() {
    return this.status >= 200 && this.status < 300;
  }

  async json() {
    return JSON.parse(this.body.toString("utf8"));
  }

  async arrayBuffer() {
    return this.body.buffer.slice(this.body.byteOffset, this.body.byteOffset + this.body.byteLength);
  }
}

async function replaceDirectory({ sourceDir, targetDir, backupDir }) {
  await rm(backupDir, { recursive: true, force: true });
  await cp(targetDir, backupDir, { recursive: true, force: true });
  await rm(targetDir, { recursive: true, force: true });

  try {
    await cp(sourceDir, targetDir, { recursive: true, force: true });
  } catch (error) {
    await rm(targetDir, { recursive: true, force: true });
    await cp(backupDir, targetDir, { recursive: true, force: true });
    throw error;
  }
}

async function extractZip(zipPath, extractDir) {
  if (process.platform === "win32") {
    await run("powershell", [
      "-NoProfile",
      "-Command",
      "& { param($zipPath, $extractDir) Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force }",
      zipPath,
      extractDir,
    ]);
    return;
  }

  await run("unzip", ["-q", "-o", zipPath, "-d", extractDir]);
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", windowsHide: true, ...options });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      ...options,
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
        return;
      }

      const error = new Error(Buffer.concat(stderr).toString("utf8").trim() || `${command} exited with code ${code}`);
      error.code = code;
      reject(error);
    });
  });
}

async function readGitProxyConfig({ cwd = process.cwd(), commandRunner = runCapture } = {}) {
  const commands = [
    ["git", ["config", "--get-urlmatch", "http.proxy", "https://api.github.com/"]],
    ["git", ["config", "--get", "https.proxy"]],
    ["git", ["config", "--get", "http.proxy"]],
  ];

  for (const [command, args] of commands) {
    try {
      const value = (await commandRunner(command, args, { cwd })).trim();
      if (value) {
        return value;
      }
    } catch {
      // Git may be unavailable, outside a repository, or have no proxy configured.
    }
  }

  return "";
}

async function readWindowsSystemProxyConfig({ platform = process.platform, commandRunner = runCapture } = {}) {
  if (platform !== "win32") {
    return {};
  }

  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

  try {
    const proxyEnableOutput = await commandRunner("reg", ["query", key, "/v", "ProxyEnable"]);
    const proxyEnable = parseRegValue(proxyEnableOutput, "ProxyEnable");
    if (!/^0x1$/i.test(proxyEnable)) {
      return {};
    }

    const proxyServerOutput = await commandRunner("reg", ["query", key, "/v", "ProxyServer"]);
    const proxyServer = parseRegValue(proxyServerOutput, "ProxyServer");
    const httpsProxy = normalizeWindowsProxyServer(proxyServer);
    const noProxy = await readWindowsProxyOverride({ key, commandRunner });

    if (!httpsProxy && !noProxy) {
      return {};
    }

    return { httpsProxy, noProxy };
  } catch {
    return {};
  }
}

async function readWindowsProxyOverride({ key, commandRunner }) {
  try {
    const proxyOverrideOutput = await commandRunner("reg", ["query", key, "/v", "ProxyOverride"]);
    return normalizeWindowsProxyOverride(parseRegValue(proxyOverrideOutput, "ProxyOverride"));
  } catch {
    return "";
  }
}

function parseRegValue(output, name) {
  const line = String(output || "")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(name));

  if (!line) {
    return "";
  }

  const match = line.trim().match(/^\S+\s+REG_\S+\s+(.+)$/);
  return match ? match[1].trim() : "";
}

function normalizeWindowsProxyServer(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "";
  }

  const entries = value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const byScheme = new Map();

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex === -1) {
      byScheme.set("default", entry);
    } else {
      byScheme.set(entry.slice(0, separatorIndex).toLowerCase(), entry.slice(separatorIndex + 1));
    }
  }

  return normalizeProxyUrl(byScheme.get("https") || byScheme.get("http") || byScheme.get("default") || "");
}

function normalizeProxyUrl(value) {
  const proxy = String(value || "").trim();
  if (!proxy) {
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(proxy)) {
    return proxy;
  }

  return `http://${proxy}`;
}

function normalizeWindowsProxyOverride(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "";
  }

  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry && entry.toLowerCase() !== "<local>")
    .join(",");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
