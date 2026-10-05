import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
assert.equal(process.arch, "x64");
const directory = await mkdtemp(path.join(os.tmpdir(), "lasso-node-runtime-"));
const server = createServer((request, response) => response.end("managed-node-runtime-ok"));
try {
  await writeFile(path.join(directory, "probe.txt"), "fixture");
  assert.equal(await readFile(path.join(directory, "probe.txt"), "utf8"), "fixture");
  assert.equal(createHash("sha256").update("fixture").digest("hex").length, 64);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}`);
  assert.equal(await response.text(), "managed-node-runtime-ok");
  console.log(JSON.stringify({version: process.version, platform: process.platform, arch: process.arch, osRelease: os.release(), filesystem: "pass", crypto: "pass", http: "pass"}));
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, {recursive: true, force: true});
}
