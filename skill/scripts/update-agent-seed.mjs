import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ASSET_NAME = "agent-seed.zip";

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
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const defaultTargetDir = path.resolve(scriptDir, "..");
  const targetDir = path.resolve(options.target || defaultTargetDir);
  const versionMetadata = await readVersionMetadata(targetDir);
  const repository = options.repository || versionMetadata.repository;

  if (!repository) {
    throw new Error("Missing repository. Pass --repository owner/repo or use a packaged VERSION.json.");
  }

  const currentVersion = options.currentVersion || versionMetadata.version || "v0.0.0";
  const latestRelease = await fetchLatestRelease(repository);
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

  await applyUpdate({ targetDir, asset: updatePlan.asset });
  console.log(`agent-seed updated in ${targetDir}`);
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

async function fetchLatestRelease(repository) {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "agent-seed-updater",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub latest release request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function applyUpdate({ targetDir, asset }) {
  if (!asset.browser_download_url) {
    throw new Error(`Release asset ${asset.name} is missing browser_download_url`);
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "agent-seed-update-"));
  const zipPath = path.join(tempDir, asset.name);
  const extractDir = path.join(tempDir, "expanded");
  const backupDir = path.join(tempDir, "backup");

  try {
    await downloadAsset(asset.browser_download_url, zipPath);
    await extractZip(zipPath, extractDir);
    await replaceDirectory({ sourceDir: extractDir, targetDir, backupDir });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function downloadAsset(downloadUrl, zipPath) {
  if (downloadUrl.startsWith("file:")) {
    await cp(fileURLToPath(downloadUrl), zipPath, { force: true });
    return;
  }

  const response = await fetch(downloadUrl, {
    headers: {
      "User-Agent": "agent-seed-updater",
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  await writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
}

async function replaceDirectory({ sourceDir, targetDir, backupDir }) {
  await rm(backupDir, { recursive: true, force: true });
  await rename(targetDir, backupDir);

  try {
    await cp(sourceDir, targetDir, { recursive: true, force: true });
  } catch (error) {
    await rm(targetDir, { recursive: true, force: true });
    await rename(backupDir, targetDir);
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

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", windowsHide: true });

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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
