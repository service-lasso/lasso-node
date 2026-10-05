import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyUpstreamChecksum } from "./package.mjs";
const bytes = Buffer.from("official distribution fixture");
const hash = createHash("sha256").update(bytes).digest("hex");
const asset = "node-v22.23.3-darwin-x64.tar.gz";
test("exact official archive entry validates", () => {
  assert.equal(verifyUpstreamChecksum(bytes, `${hash}  ${asset}\n`, asset), hash);
});
test("corrupt cached bytes and ambiguous checksum authority fail closed", () => {
  const line = `${hash}  ${asset}\n`;
  assert.throws(() => verifyUpstreamChecksum(Buffer.from("changed"), line, asset), /mismatch/);
  for (const sums of ["", line + line, `bad  ${asset}\n`]) {
    assert.throws(() => verifyUpstreamChecksum(bytes, sums, asset), /one valid official checksum/);
  }
});
