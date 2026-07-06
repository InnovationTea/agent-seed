import { spawn } from "node:child_process";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_PACKAGE_NAME = "agent-seed";

export async function releaseSkill({
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  skillDir = path.join(rootDir, "skill"),
  outputDir = path.join(rootDir, "outputs"),
  packageName = DEFAULT_PACKAGE_NAME,
} = {}) {
  await assertDirectory(skillDir, "skill source");

  const expandedDir = path.join(outputDir, packageName);
  const zipPath = path.join(outputDir, `${packageName}.zip`);

  await mkdir(outputDir, { recursive: true });
  await rm(expandedDir, { recursive: true, force: true });
  await rm(zipPath, { force: true });
  await cp(skillDir, expandedDir, { recursive: true });
  await createZip(expandedDir, zipPath);

  return { expandedDir, zipPath };
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
  releaseSkill()
    .then(({ expandedDir, zipPath }) => {
      console.log(`Expanded release: ${expandedDir}`);
      console.log(`Zip package: ${zipPath}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
