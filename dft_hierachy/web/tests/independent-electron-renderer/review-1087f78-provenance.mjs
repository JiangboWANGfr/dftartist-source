// Byte provenance only; no implementation inspection or oracle generation.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const own = path.resolve(import.meta.dirname, "../../.."),
  product = path.resolve(process.env.HIER_B_PRODUCT_ROOT),
  main = path.resolve(process.env.HIER_B_MAIN_ROOT);
const fixed = "1087f78c19cb4e3400bb4093c575b51144c9c7e6",
  bBase = "7e96134aa4271729ebae7b6573bce124193b0484",
  freeze = "c99143c5baff94fbe1f41a5c3da77a0b70f475e9";
const git = (cwd, ...args) =>
    execFileSync("git", args, { cwd }).toString("utf8"),
  sha = (b) => createHash("sha256").update(b).digest("hex");
const rows = (cwd, revision) =>
  git(cwd, "ls-tree", "-rz", revision)
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf("\t"),
        [mode, , oid] = line.slice(0, at).split(" ");
      return { mode, oid, file: line.slice(at + 1) };
    });
const read = (cwd, row) =>
  row.mode === "120000"
    ? Buffer.from(fs.readlinkSync(path.join(cwd, row.file)))
    : fs.readFileSync(path.join(cwd, row.file));
function check(cwd, revision, excluded = []) {
  const pins = rows(cwd, revision)
    .filter((r) => !excluded.includes(r.file))
    .map((row) => {
      assert.ok(["100644", "100755", "120000"].includes(row.mode));
      const b = read(cwd, row);
      assert.equal(
        createHash("sha1")
          .update(Buffer.from(`blob ${b.length}\0`))
          .update(b)
          .digest("hex"),
        row.oid,
        row.file,
      );
      return { path: row.file, bytes: b.length, sha256: sha(b) };
    });
  return {
    files: pins.length,
    fingerprint: sha(Buffer.from(JSON.stringify(pins))),
  };
}
assert.equal(git(product, "rev-parse", "HEAD").trim(), fixed);
assert.equal(git(main, "rev-parse", "HEAD").trim(), fixed);
const ownOld = check(own, bBase),
  productTracked = check(product, fixed),
  mainTracked = check(main, fixed, ["docs/REVIEW_LOG.md"]);
const oldBInputs = rows(own, bBase).filter((r) =>
  r.file.startsWith("web/tests/independent"),
);
for (const row of oldBInputs)
  assert.deepEqual(read(product, row), read(own, row), row.file);
const beforeNames = new Set(
  rows(own, "44be464307b747ff177178943dace973c349ed71").map((r) => r.file),
);
const imported = rows(own, bBase).filter((r) => !beforeNames.has(r.file));
assert.equal(imported.length, 15);
const importedPins = imported.map((row) => {
  const b = read(own, row);
  assert.deepEqual(read(product, row), b, row.file);
  return { path: row.file, bytes: b.length, sha256: sha(b) };
});
const historical = JSON.parse(
  fs.readFileSync(
    path.join(own, "docs/m5_b_electron_renderer_freeze.json"),
    "utf8",
  ),
);
for (const pin of historical.frozenInputPins) {
  assert.equal(sha(fs.readFileSync(path.join(own, pin.path))), pin.sha256);
  assert.equal(sha(fs.readFileSync(path.join(product, pin.path))), pin.sha256);
}
const treePins = {};
for (const name of ["core", "protocol/schema"]) {
  const old = git(product, "rev-parse", `782c599:${name}`).trim(),
    current = git(product, "rev-parse", `${fixed}:${name}`).trim();
  assert.equal(current, old, name);
  treePins[name] = current;
}
assert.equal(
  git(product, "rev-parse", "782c599:web/package-lock.json").trim(),
  git(product, "rev-parse", `${fixed}:web/package-lock.json`).trim(),
);
const log = fs.readFileSync(path.join(main, "docs/REVIEW_LOG.md"));
const claimPrefix = {
  bytes: 1486741,
  sha256: "cee779bfb255e924372595c1ceee0ee1dd32e598063962fb8b4d1cc79db8fc9e",
};
assert.equal(sha(log.subarray(0, claimPrefix.bytes)), claimPrefix.sha256);
const untracked = git(main, "ls-files", "--others", "--exclude-standard", "-z")
  .split("\0")
  .filter(Boolean)
  .map((file) => {
    const b = fs.readFileSync(path.join(main, file));
    return { path: file, bytes: b.length, sha256: sha(b) };
  });
const sourcePins = [
  "docs/DESIGN.md",
  "web/contracts/electron/bridge.d.ts",
  "web/contracts/electron/renderer.d.ts",
  "web/packages/client/dist/index.d.ts",
  "web/packages/client/dist/node/index.d.ts",
  "web/packages/client/dist/electron/renderer.d.ts",
].map((file) => {
  const b = fs.readFileSync(path.join(product, file));
  return { path: file, bytes: b.length, sha256: sha(b) };
});
const thirdParty = [];
for (const name of [
  "slang",
  "catch2",
  "fmt",
  "mimalloc",
  "boost_regex",
  "tomlplusplus",
]) {
  const source = fs.realpathSync(
      path.join(main, "core/build/_deps", name + "-src"),
    ),
    hasGit = fs.existsSync(path.join(source, ".git"));
  const row = { name, source, git: hasGit };
  if (hasGit) {
    row.head = git(source, "rev-parse", "HEAD").trim();
    row.status = git(source, "status", "--porcelain=v1");
    assert.equal(row.status, "");
    row.describe = git(source, "describe", "--tags", "--always", "HEAD").trim();
  }
  thirdParty.push(row);
}
const executable = path.join(product, "core/build-b-review/hier"),
  coreBinary = fs.existsSync(executable)
    ? (() => {
        const b = fs.readFileSync(executable);
        return { path: executable, bytes: b.length, sha256: sha(b) };
      })()
    : null;
console.log(
  JSON.stringify(
    {
      kind: "B provenance only; not product semantics",
      fixed,
      freeze,
      bBase,
      ownOld,
      productTracked,
      mainTracked,
      oldBInputFiles: oldBInputs.length,
      importedPins,
      frozenInputPins: historical.frozenInputPins,
      sourcePins,
      treePins,
      claimPrefix,
      untracked,
      thirdParty,
      coreBinary,
      productStatus: git(product, "status", "--porcelain=v1"),
      mainStatus: git(main, "status", "--porcelain=v1"),
    },
    null,
    2,
  ),
);
