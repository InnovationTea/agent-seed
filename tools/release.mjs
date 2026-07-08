import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_PACKAGE_NAME = "agent-seed";

export async function releaseSkill({
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  skillDir = path.join(rootDir, "skill"),
  outputDir = path.join(rootDir, "outputs"),
  packageName = DEFAULT_PACKAGE_NAME,
  version = process.env.GITHUB_REF_NAME || "local",
  repository = process.env.GITHUB_REPOSITORY || "",
  commit = process.env.GITHUB_SHA || "",
} = {}) {
  await assertDirectory(skillDir, "skill source");

  const expandedDir = path.join(outputDir, packageName);
  const zipPath = path.join(outputDir, `${packageName}.zip`);
  const releaseManifestPath = path.join(outputDir, `${packageName}-release.json`);

  await mkdir(outputDir, { recursive: true });
  await rm(expandedDir, { recursive: true, force: true });
  await rm(zipPath, { force: true });
  await rm(releaseManifestPath, { force: true });
  await cp(skillDir, expandedDir, { recursive: true });
  await writeVersionMetadata({
    filePath: path.join(expandedDir, "VERSION.json"),
    packageName,
    version,
    repository,
    commit,
    releaseManifestName: path.basename(releaseManifestPath),
  });
  await createZip(expandedDir, zipPath);
  const bundledSkillArtifacts = await releaseBundledDirectSkills({ skillDir, outputDir });
  await writeReleaseManifest({
    manifestPath: releaseManifestPath,
    outputDir,
    packageName,
    version,
    repository,
    commit,
    assetPaths: [zipPath, ...bundledSkillArtifacts.map((artifact) => artifact.zipPath)],
  });

  return { expandedDir, zipPath, releaseManifestPath, bundledSkillArtifacts };
}

async function writeVersionMetadata({ filePath, packageName, version, repository, commit, releaseManifestName }) {
  const metadata = {
    name: packageName,
    version,
    repository,
    commit,
    update: {
      release_manifest: releaseManifestName,
      primary_asset: `${packageName}.zip`,
      latest_release_api: repository ? `https://api.github.com/repos/${repository}/releases/latest` : "",
    },
  };

  await writeFile(filePath, `${JSON.stringify(metadata, null, 2)}\n`);
}

async function writeReleaseManifest({ manifestPath, outputDir, packageName, version, repository, commit, assetPaths }) {
  const baseManifest = {
    schema_version: 1,
    name: packageName,
    version,
    repository,
    commit,
    generated_at: new Date().toISOString(),
    assets: await Promise.all(assetPaths.map((assetPath) => describeAsset(assetPath, outputDir))),
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(baseManifest, null, 2)}\n`);
  const manifestAsset = {
    name: path.basename(manifestPath),
    path: path.basename(manifestPath),
    size: manifestBytes.byteLength,
    sha256: hashBuffer(manifestBytes),
  };
  const finalManifest = {
    ...baseManifest,
    assets: [...baseManifest.assets, manifestAsset],
  };

  await writeFile(manifestPath, `${JSON.stringify(finalManifest, null, 2)}\n`);
}

async function describeAsset(assetPath, outputDir) {
  const content = await readFile(assetPath);

  return {
    name: path.basename(assetPath),
    path: path.relative(outputDir, assetPath).replaceAll(path.sep, "/"),
    size: content.byteLength,
    sha256: hashBuffer(content),
  };
}

function hashBuffer(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function releaseBundledDirectSkills({ skillDir, outputDir }) {
  const manifest = await readJsonIfExists(path.join(skillDir, "bundled-skills.json"));
  const bundledOutputDir = path.join(outputDir, "bundled-skills");

  await rm(bundledOutputDir, { recursive: true, force: true });

  if (!manifest) {
    return [];
  }

  const bundledSkills = Array.isArray(manifest.bundled_skills) ? manifest.bundled_skills : [];
  if (bundledSkills.length === 0) {
    return [];
  }

  await mkdir(bundledOutputDir, { recursive: true });

  const artifacts = [];

  for (const bundledSkill of bundledSkills) {
    const name = assertSafeArtifactName(bundledSkill.name, "bundled skill name");
    const sourceDir = resolveInside(skillDir, bundledSkill.source_path, `${name} source path`);
    const universalDir = path.join(bundledOutputDir, name);
    const universalZipPath = path.join(bundledOutputDir, `${name}.zip`);

    await assertDirectory(sourceDir, `${name} bundled skill source`);
    await cp(sourceDir, universalDir, { recursive: true });
    await createZip(universalDir, universalZipPath);
    artifacts.push({ name, platform: "universal", expandedDir: universalDir, zipPath: universalZipPath });

    const codexPlatform = bundledSkill.platforms?.find((platform) => platform.platform === "codex");
    if (!codexPlatform) {
      continue;
    }

    const codexDir = path.join(bundledOutputDir, `${name}-codex`);
    const codexZipPath = path.join(bundledOutputDir, `${name}-codex.zip`);

    await cp(sourceDir, codexDir, { recursive: true });

    if (codexPlatform.overlay_path) {
      const codexOverlayDir = resolveInside(skillDir, codexPlatform.overlay_path, `${name} Codex overlay path`);
      await assertDirectory(codexOverlayDir, `${name} Codex overlay`);
      await copyDirectoryContents(codexOverlayDir, codexDir);
    }

    await createZip(codexDir, codexZipPath);
    artifacts.push({ name, platform: "codex", expandedDir: codexDir, zipPath: codexZipPath });
  }

  return artifacts;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function assertSafeArtifactName(name, label) {
  if (typeof name !== "string" || name.trim() === "" || name.includes("/") || name.includes("\\")) {
    throw new Error(`Invalid ${label}: ${name}`);
  }

  return name;
}

function resolveInside(rootDir, relativePath, label) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    throw new Error(`Invalid ${label}: ${relativePath}`);
  }

  const resolvedPath = path.resolve(rootDir, relativePath);
  const relativeToRoot = path.relative(rootDir, resolvedPath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`${label} must stay inside skill source: ${relativePath}`);
  }

  return resolvedPath;
}

async function copyDirectoryContents(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });

  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    await cp(path.join(sourceDir, entry.name), path.join(targetDir, entry.name), { recursive: true, force: true });
  }
}

async function assertDirectory(directory, label) {
  try {
    const entry = await stat(directory);
    if (!entry.isDirectory()) {
      throw new Error(`${label} is not a directory: ${directory}`);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Missing ${label}: ${directory}`);
    }

    throw error;
  }
}

async function createZip(sourceDir, zipPath) {
  const command = [
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
  ];

  await run("powershell", command);
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
  releaseSkill(parseArgs(process.argv.slice(2)))
    .then(({ expandedDir, zipPath, releaseManifestPath, bundledSkillArtifacts }) => {
      console.log(`Expanded release: ${expandedDir}`);
      console.log(`Zip package: ${zipPath}`);
      console.log(`Release manifest: ${releaseManifestPath}`);
      for (const artifact of bundledSkillArtifacts) {
        console.log(`Bundled skill ${artifact.platform}: ${artifact.expandedDir}`);
        console.log(`Bundled skill zip ${artifact.platform}: ${artifact.zipPath}`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--root-dir") {
      options.rootDir = requireValue(argv, (index += 1), arg);
    } else if (arg === "--skill-dir") {
      options.skillDir = requireValue(argv, (index += 1), arg);
    } else if (arg === "--output-dir") {
      options.outputDir = requireValue(argv, (index += 1), arg);
    } else if (arg === "--package-name") {
      options.packageName = requireValue(argv, (index += 1), arg);
    } else if (arg === "--version") {
      options.version = requireValue(argv, (index += 1), arg);
    } else if (arg === "--repository") {
      options.repository = requireValue(argv, (index += 1), arg);
    } else if (arg === "--commit") {
      options.commit = requireValue(argv, (index += 1), arg);
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
