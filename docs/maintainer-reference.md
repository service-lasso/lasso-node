# lasso-node

`lasso-node` is the canonical Service Lasso service repo for packaging Node.js as a release-backed runtime provider.

The repo does not fork Node.js. It downloads official Node.js distribution archives, wraps them in Service Lasso-compatible platform archives, and publishes those archives from protected `main` pushes using the project version pattern:

```text
yyyy.m.d-<shortsha>
```

This repo is public. It is not marked as a GitHub template today; app templates should consume the released `service.json` pattern rather than clone this packaging repo.

## Release Assets

Each release publishes Node `v22.23.3`, Node `v24.15.0` and Node `v25.9.0` archives for each supported platform:

- `lasso-node-v22.23.3-win32.zip`
- `lasso-node-v22.23.3-linux.tar.gz`
- `lasso-node-v22.23.3-darwin.tar.gz`
- `lasso-node-v24.15.0-win32.zip`
- `lasso-node-v24.15.0-linux.tar.gz`
- `lasso-node-v24.15.0-darwin.tar.gz`
- `lasso-node-v25.9.0-win32.zip`
- `lasso-node-v25.9.0-linux.tar.gz`
- `lasso-node-v25.9.0-darwin.tar.gz`
- `service.json`
- `SHA256SUMS.txt`

The released `service.json` selects Node `v24.15.0` as the default provider version. Apps that need Node `v25.9.0` can copy the manifest and change the platform asset names to the matching `v25.9.0` archives.

## Release Contract

Release tags use the Service Lasso version pattern:

```text
yyyy.m.d-<shortsha>
```

The released `service.json` keeps `artifact.source.channel` set to `latest` so new consumers can track the newest Node provider packaging release intentionally. Core `service-lasso` may pin a specific release tag in its own baseline manifest after verification.

Each platform archive contains the official Node.js distribution contents plus `SERVICE-LASSO-PACKAGE.json`.

`SERVICE-LASSO-PACKAGE.json` records:

- Service Lasso service id: `@node`
- upstream repo: `nodejs/node`
- upstream Node.js version
- upstream asset name
- packaging repo: `service-lasso/lasso-node`
- target platform and architecture

`SHA256SUMS.txt` records checksums for all platform archives and the released `service.json`.

## Local Verification

```powershell
npm test
```

This packages the current platform for Node `v24.15.0` by default, extracts the archive, verifies package metadata, and runs `node --version` from the extracted payload.

To verify another packaged version:

```powershell
$env:NODE_VERSION = "v25.9.0"
npm test
```

## Service Lasso Contract

The service manifest declares:

- provider role with no managed daemon start requirement
- canonical `healthchecks[]` process readiness with stable `node-version` id
- canonical `endpoints[]` metadata for the public Node.js documentation URL
- native archive acquisition from GitHub releases
- Node `v24.15.0` as the default runtime artifact
- `NODE_ENV`, `NODE`, and `NODE_HOME` provider/global environment hints
- `NODE` resolves from `${SERVICE_ARTIFACT_COMMAND}` and `NODE_HOME` resolves
  from `${SERVICE_ARTIFACT_ROOT}`, so consumers use the exact acquired artifact
  selected by Service Lasso
- process/provider health using `node --version`
- no legacy `ports`, `portmapping`, or `urls` authoring surfaces

## Node22 compatibility channel

For an Intel macOS 11 consumer, copy the provider manifest, set `version` to `v22.23.3`, select the matching Node22 asset names, and pin `artifact.source.channel` to the exact qualified release tag. No local replacement of acquired bytes is part of this flow. Node24 remains the default. All shipped distributions target x64; arm64 is not qualified by these assets.

The [official Node22 build contract](https://github.com/nodejs/node/blob/v22.23.3/BUILDING.md) specifies macOS x64 binaries built with minimum OS 11.0. This binary compatibility does not extend vendor support to an end-of-life operating system. Qualification on actual macOS 11.7.11 is recorded separately from hosted macOS runner tests.

Before extraction the packager validates fresh and cached upstream bytes against the exact official version `SHASUMS256.txt` entry. Package metadata records the upstream SHA-256 and checksum URL. Verification runs extracted `node --version` plus filesystem, cryptography, and local HTTP probes. Source candidates and published assets remain separate acceptance boundaries (SPEC-001 N22-1–N22-4; issue #13).
