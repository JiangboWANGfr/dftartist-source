import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  access,
  cp,
  mkdir,
  symlink,
  stat,
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const web = fileURLToPath(new URL("../", import.meta.url));
const pack = path.join(web, "apps/demo/pack.mjs");
function rejected(args, message) {
  const result = spawnSync(process.execPath, [pack, ...args], { cwd: web, encoding: "utf8" });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, message);
}

test("pack rejects an existing external directory and preserves its contents", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "hier-pack-existing-"));
  try {
    const sentinel = path.join(directory, "user-content.txt");
    await writeFile(sentinel, "keep this delivery\n");
    rejected(["--output", directory], /EEXIST/);
    assert.equal(await readFile(sentinel, "utf8"), "keep this delivery\n");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("pack refuses to create an output inside the repository", async () => {
  const directory = path.join(web, ".pack-rejected-" + process.pid);
  await assert.rejects(access(directory), { code: "ENOENT" });
  rejected(["--output", directory], /outside the repository/);
  await assert.rejects(access(directory), { code: "ENOENT" });
});

test("pack requires one explicit absolute output", () => {
  rejected([], /Usage:/);
  rejected(["--output", "relative-delivery"], /absolute path/);
});

test("pack builds from current sources without publishing or changing stale shared output", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "hier-pack-stale-"));
  const fixture = path.join(directory, "workspace", "web");
  const output = path.join(directory, "consumer space 中文");
  let completed = false;
  try {
    await mkdir(fixture, { recursive: true });
    for (const file of [
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "tsconfig.base.json",
      "packages",
      "apps/demo",
      "scripts/build-layout-assets.mjs",
    ])
      await cp(path.join(web, file), path.join(fixture, file), { recursive: true });
    await symlink(path.join(web, "node_modules"), path.join(fixture, "node_modules"), "dir");
    const stale = [];
    for (const name of ["protocol-types", "client", "viewmodel", "views"]) {
      for (const suffix of ["js", "d.ts"]) {
        const file = path.join(fixture, "packages", name, "dist", "obsolete-output." + suffix);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, "export const obsolete = 1;\n");
        stale.push({
          file,
          bytes: await readFile(file),
          mtimeNs: (await stat(file, { bigint: true })).mtimeNs,
        });
      }
    }
    const source = path.join(fixture, "packages/client/src/index.ts");
    await writeFile(
      source,
      (await readFile(source, "utf8")) + '\nexport const packageSourceMarker = "current source";\n',
    );
    const result = spawnSync("npm", ["run", "pack:demo", "--", "--output", output], {
      cwd: fixture,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH,
      },
      timeout: 60_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(result.error, undefined, result.stderr);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const delivery = JSON.parse(await readFile(path.join(output, "delivery.json"), "utf8"));
    assert.equal(delivery.tarballs.length, 4);
    for (const item of delivery.tarballs) {
      const listing = spawnSync("tar", ["-tzf", path.join(output, item.file)], {
        encoding: "utf8",
      });
      assert.equal(listing.status, 0, listing.stderr);
      assert.doesNotMatch(listing.stdout, /obsolete-output|__layering_probe__/);
      assert.doesNotMatch(listing.stdout, /\.tsbuildinfo/);
      assert.match(listing.stdout, /package\/dist\/index\.js/);
      assert.match(listing.stdout, /package\/dist\/index\.d\.ts/);
      await assert.rejects(
        access(path.join(output, "node_modules", item.name, "dist", "obsolete-output.js")),
        { code: "ENOENT" },
      );
    }
    for (const suffix of ["js", "d.ts"])
      assert.match(
        await readFile(path.join(output, "node_modules/@hier/client/dist/index." + suffix), "utf8"),
        /packageSourceMarker = "current source"/,
      );
    await assert.rejects(access(path.join(output, ".package-build")), { code: "ENOENT" });
    for (const entry of stale) {
      assert.deepEqual(await readFile(entry.file), entry.bytes);
      assert.equal((await stat(entry.file, { bigint: true })).mtimeNs, entry.mtimeNs);
    }
    completed = true;
  } finally {
    // Keep the complete input and delivery on a regression failure for diagnosis.
    if (completed) await rm(directory, { recursive: true });
    else console.error("Preserved failed package fixture:", directory);
  }
});
