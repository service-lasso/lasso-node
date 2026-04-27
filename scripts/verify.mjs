import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageNode } from "./package.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.env.TARGET_PLATFORM ?? process.platform;
const version = process.env.NODE_VERSION ?? "v24.15.0";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      ...options,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}\n${stdout}\n${stderr}`));
      }
    });
  });
}

const artifact = await packageNode(platform, version);
const verifyRoot = path.join(repoRoot, "output", "verify", version, platform);
const extractRoot = path.join(verifyRoot, "extract");
const binary = platform === "win32" ? "node.exe" : "bin/node";
const binaryPath = path.join(extractRoot, binary);

await rm(verifyRoot, { recursive: true, force: true });
await mkdir(extractRoot, { recursive: true });
await run("tar", ["-xf", artifact, "-C", extractRoot]);

const packageMetadata = JSON.parse(
  await readFile(path.join(extractRoot, "SERVICE-LASSO-PACKAGE.json"), "utf8"),
);
if (
  packageMetadata.serviceId !== "@node" ||
  packageMetadata.upstream?.repo !== "nodejs/node" ||
  packageMetadata.upstream?.version !== version ||
  packageMetadata.packagedBy !== "service-lasso/lasso-node" ||
  packageMetadata.platform !== platform
) {
  throw new Error(`Unexpected package metadata: ${JSON.stringify(packageMetadata)}`);
}

const nodeVersion = await run(binaryPath, ["--version"], { cwd: extractRoot });
if (nodeVersion.stdout.trim() !== version) {
  throw new Error(`Expected ${version}, got ${nodeVersion.stdout.trim()}`);
}

console.log(`[lasso-node] verification passed for ${version} on ${platform}`);
