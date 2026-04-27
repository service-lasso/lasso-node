# lasso-node

`lasso-node` is the canonical Service Lasso service repo for packaging Node.js as a release-backed runtime provider.

The repo does not fork Node.js. It downloads official Node.js distribution archives, wraps them in Service Lasso-compatible platform archives, and publishes those archives from protected `main` pushes using the project version pattern:

```text
yyyy.m.d-<shortsha>
```

This repo is public. It is not marked as a GitHub template today; app templates should consume the released `service.json` pattern rather than clone this packaging repo.

## Release Assets

Each release publishes Node `v24.15.0` and Node `v25.9.0` archives for each supported platform:

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
- native archive acquisition from GitHub releases
- Node `v24.15.0` as the default runtime artifact
- `NODE_ENV`, `NODE`, and `NODE_HOME` provider/global environment hints
- process/provider health using `node --version`
