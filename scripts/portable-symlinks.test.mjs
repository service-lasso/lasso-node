import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyPortableSymlinks } from "./package.mjs";

const skipSymlinkFixtures = process.platform === "win32";

test("relative package symlinks remain confined after relocation", { skip: skipSymlinkFixtures }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lasso-node-portable-links-"));
  const packageRoot = path.join(tempRoot, "original", "payload");
  const relocatedRoot = path.join(tempRoot, "relocated", "payload");

  try {
    await mkdir(path.join(packageRoot, "bin"), { recursive: true });
    await mkdir(path.join(packageRoot, "lib", "node_modules", "corepack", "dist"), { recursive: true });
    await writeFile(path.join(packageRoot, "lib", "node_modules", "corepack", "dist", "corepack.js"), "fixture\n");
    await symlink(
      path.join("..", "lib", "node_modules", "corepack", "dist", "corepack.js"),
      path.join(packageRoot, "bin", "corepack"),
    );

    assert.deepEqual(await verifyPortableSymlinks(packageRoot), { symlinkCount: 1 });

    await mkdir(path.dirname(relocatedRoot), { recursive: true });
    await rename(packageRoot, relocatedRoot);
    assert.deepEqual(await verifyPortableSymlinks(relocatedRoot), { symlinkCount: 1 });
    assert.equal(await readFile(path.join(relocatedRoot, "bin", "corepack"), "utf8"), "fixture\n");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("package symlink audit rejects absolute, escaping, broken, and cyclic links", { skip: skipSymlinkFixtures }, async (t) => {
  const cases = [
    {
      name: "absolute",
      target: ({ outsidePath }) => outsidePath,
      expected: /absolute target/,
    },
    {
      name: "escaping",
      target: () => path.join("..", "outside.txt"),
      expected: /escapes the package root/,
    },
    {
      name: "broken",
      target: () => "missing.txt",
      expected: /broken or cyclic/,
    },
    {
      name: "cyclic",
      target: () => "cycle-b",
      expected: /broken or cyclic/,
      prepare: async ({ packageRoot }) => symlink("cycle-a", path.join(packageRoot, "cycle-b")),
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const tempRoot = await mkdtemp(path.join(os.tmpdir(), `lasso-node-${fixture.name}-link-`));
      const packageRoot = path.join(tempRoot, "payload");
      const outsidePath = path.join(tempRoot, "outside.txt");

      try {
        await mkdir(packageRoot, { recursive: true });
        await writeFile(outsidePath, "outside\n");
        await fixture.prepare?.({ packageRoot, outsidePath });
        await symlink(
          fixture.target({ packageRoot, outsidePath }),
          path.join(packageRoot, fixture.name === "cyclic" ? "cycle-a" : "link"),
        );
        await assert.rejects(() => verifyPortableSymlinks(packageRoot), fixture.expected);
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    });
  }
});
