import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeVersion = process.env.NODE_VERSION ?? "v24.15.0";
const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;

const targets = {
  win32: {
    upstreamPlatform: "win-x64",
    upstreamExt: "zip",
    archiveType: "zip",
    binary: "node.exe",
    command: ".\\node.exe",
  },
  linux: {
    upstreamPlatform: "linux-x64",
    upstreamExt: "tar.xz",
    archiveType: "tar.gz",
    binary: "bin/node",
    command: "./bin/node",
  },
  darwin: {
    upstreamPlatform: "darwin-x64",
    upstreamExt: "tar.gz",
    archiveType: "tar.gz",
    binary: "bin/node",
    command: "./bin/node",
  },
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function versionedAssetName(version, platform, archiveType) {
  return `lasso-node-${version}-${platform}.${archiveType === "zip" ? "zip" : "tar.gz"}`;
}

async function download(url, destination) {
  if (existsSync(destination)) {
    return;
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "service-lasso-lasso-node-packager",
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, bytes);
}

async function compressPackage(packageRoot, outputPath, archiveType) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });

  if (archiveType === "zip") {
    run("powershell", [
      "-NoLogo",
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path ${JSON.stringify(path.join(packageRoot, "*"))} -DestinationPath ${JSON.stringify(outputPath)} -Force`,
    ]);
    return outputPath;
  }

  run("tar", ["-czf", outputPath, "-C", packageRoot, "."]);
  return outputPath;
}

export async function packageNode(platform = targetPlatform, version = nodeVersion) {
  const target = targets[platform];
  if (!target) {
    throw new Error(`Unsupported target platform: ${platform}`);
  }

  if (!/^v\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Expected Node.js version like "v24.15.0", got "${version}".`);
  }

  const upstreamRootName = `node-${version}-${target.upstreamPlatform}`;
  const upstreamAsset = `${upstreamRootName}.${target.upstreamExt}`;
  const upstreamUrl = `https://nodejs.org/dist/${version}/${upstreamAsset}`;
  const vendorRoot = path.join(repoRoot, "vendor", version, platform);
  const outputRoot = path.join(repoRoot, "output", "package", version, platform);
  const extractRoot = path.join(outputRoot, "extract");
  const packageRoot = path.join(outputRoot, "payload");
  const upstreamArchive = path.join(vendorRoot, upstreamAsset);
  const assetName = versionedAssetName(version, platform, target.archiveType);
  const outputPath = path.join(repoRoot, "dist", assetName);

  await mkdir(vendorRoot, { recursive: true });
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(extractRoot, { recursive: true });
  await mkdir(packageRoot, { recursive: true });

  await download(upstreamUrl, upstreamArchive);
  run("tar", ["-xf", upstreamArchive, "-C", extractRoot]);

  const extractedDistributionRoot = path.join(extractRoot, upstreamRootName);
  const binaryPath = path.join(extractedDistributionRoot, target.binary);
  if (!existsSync(binaryPath)) {
    throw new Error(`Expected Node.js binary was not found at ${binaryPath}`);
  }

  await cp(extractedDistributionRoot, packageRoot, { recursive: true });
  if (target.archiveType !== "zip") {
    await chmod(path.join(packageRoot, target.binary), 0o755);
  }

  await writeFile(
    path.join(packageRoot, "SERVICE-LASSO-PACKAGE.json"),
    `${JSON.stringify(
      {
        serviceId: "@node",
        upstream: {
          repo: "nodejs/node",
          version,
          asset: upstreamAsset,
          url: upstreamUrl,
        },
        packagedBy: "service-lasso/lasso-node",
        platform,
        arch: "x64",
        command: target.command,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await compressPackage(packageRoot, outputPath, target.archiveType);
  console.log(`[lasso-node] packaged ${outputPath}`);
  return outputPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await packageNode();
}
