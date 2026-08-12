import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageNode, verifyPortableSymlinks } from "./package.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platform = process.env.TARGET_PLATFORM ?? process.platform;
const version = process.env.NODE_VERSION ?? "v24.15.0";

function assertServiceManifestContract(manifest) {
  if (Object.hasOwn(manifest, "healthcheck")) {
    throw new Error("service.json must use healthchecks[] instead of singular healthcheck.");
  }

  const invalidTcpAliases = ["tcphost", "tcpport"].filter((field) => Object.hasOwn(manifest, field));
  if (invalidTcpAliases.length > 0) {
    throw new Error(`service.json must not use TCP alias fields: ${invalidTcpAliases.join(", ")}`);
  }

  if (!Array.isArray(manifest.healthchecks) || manifest.healthchecks.length === 0) {
    throw new Error("service.json must declare a non-empty healthchecks[] array.");
  }

  const ids = new Set();
  for (const check of manifest.healthchecks) {
    if (!check || typeof check !== "object") {
      throw new Error("Each service.json healthcheck must be an object.");
    }
    const invalidCheckTcpAliases = ["tcphost", "tcpport"].filter((field) => Object.hasOwn(check, field));
    if (invalidCheckTcpAliases.length > 0) {
      throw new Error(`service.json healthchecks must not use TCP alias fields: ${invalidCheckTcpAliases.join(", ")}`);
    }
    if (typeof check.id !== "string" || check.id.trim() === "") {
      throw new Error("Each service.json healthcheck must declare a stable id.");
    }
    if (ids.has(check.id)) {
      throw new Error(`Duplicate service.json healthcheck id: ${check.id}`);
    }
    ids.add(check.id);
  }

  const nodeVersionCheck = manifest.healthchecks.find((check) => check.id === "node-version");
  if (!nodeVersionCheck || nodeVersionCheck.type !== "process") {
    throw new Error('service.json must include a process healthcheck with id "node-version".');
  }
}

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

const serviceManifest = JSON.parse(await readFile(path.join(repoRoot, "service.json"), "utf8"));
assertServiceManifestContract(serviceManifest);

const artifact = await packageNode(platform, version);
const verifyRoot = path.join(repoRoot, "output", "verify", version, platform);
const extractRoot = path.join(verifyRoot, "extract");
const binary = platform === "win32" ? "node.exe" : "bin/node";
const binaryPath = path.join(extractRoot, binary);

await rm(verifyRoot, { recursive: true, force: true });
await mkdir(extractRoot, { recursive: true });
await run("tar", ["-xf", artifact, "-C", extractRoot]);
const portableLinks = await verifyPortableSymlinks(extractRoot);

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

console.log(
  `[lasso-node] verification passed for ${version} on ${platform}; ${portableLinks.symlinkCount} portable symlinks verified`,
);
