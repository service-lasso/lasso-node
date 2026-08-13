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

  const legacyEndpointFields = [
    "ports",
    "portmapping",
    "urls",
    "serviceport",
    "serviceportsecondary",
    "serviceportconsole",
    "serviceportdebug",
  ].filter((field) => Object.hasOwn(manifest, field));
  if (legacyEndpointFields.length > 0) {
    throw new Error(`service.json must use endpoints[] instead of legacy endpoint fields: ${legacyEndpointFields.join(", ")}`);
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

  if (!Array.isArray(manifest.endpoints) || manifest.endpoints.length === 0) {
    throw new Error("service.json must declare canonical endpoints[] entries for service interfaces and resources.");
  }

  const endpointIds = new Set();
  for (const endpoint of manifest.endpoints) {
    if (!endpoint || typeof endpoint !== "object") {
      throw new Error("Each service.json endpoint must be an object.");
    }
    if (typeof endpoint.id !== "string" || !/^[a-z][a-z0-9_]*$/.test(endpoint.id)) {
      throw new Error(`Endpoint id must be selector-safe lower snake case: ${JSON.stringify(endpoint.id)}`);
    }
    if (endpointIds.has(endpoint.id)) {
      throw new Error(`Duplicate service.json endpoint id: ${endpoint.id}`);
    }
    endpointIds.add(endpoint.id);

    const variableBlocks = ["env", "globalenv", "export", "exports"].filter((field) => Object.hasOwn(endpoint, field));
    if (variableBlocks.length > 0) {
      throw new Error(`Endpoint ${endpoint.id} must not contain variable blocks: ${variableBlocks.join(", ")}`);
    }
  }

  const docsEndpoint = manifest.endpoints.find((endpoint) => endpoint.id === "docs");
  if (
    !docsEndpoint ||
    docsEndpoint.kind !== "url" ||
    docsEndpoint.url !== "https://nodejs.org" ||
    docsEndpoint.exposure !== "public"
  ) {
    throw new Error("service.json must expose the Node.js documentation link as canonical endpoint docs.");
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
