// Hash-only audit; never inspect A implementation to derive expectations.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const own = path.resolve(import.meta.dirname, "../../.."),
  main = path.resolve(process.env.HIER_B_MAIN_ROOT),
  product = path.resolve(process.env.HIER_B_PRODUCT_ROOT);
const fixed = "ccbef3f78c16c84463850255c65e5889a42bb321",
  base = "fc989a2c7d2a04fa94807281fe80b097754ef69a",
  accepted = "f936a33876656246ccea172c4c9447ff59f9983f";
const git = (cwd, ...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trimEnd(),
  hash = (b) => createHash("sha256").update(b).digest("hex");
const rows = (root, revision) =>
  git(root, "ls-tree", "-rz", revision)
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf("\t"),
        [mode, , oid] = line.slice(0, at).split(" ");
      return { mode, oid, file: line.slice(at + 1) };
    });
const read = (root, row) =>
  row.mode === "120000"
    ? Buffer.from(fs.readlinkSync(path.join(root, row.file)))
    : fs.readFileSync(path.join(root, row.file));
function verify(root, revision, excluded = []) {
  const pins = rows(root, revision)
    .filter((r) => !excluded.includes(r.file))
    .map((row) => {
      const b = read(root, row);
      assert.equal(
        createHash("sha1")
          .update(Buffer.from(`blob ${b.length}\0`))
          .update(b)
          .digest("hex"),
        row.oid,
        row.file,
      );
      return { path: row.file, bytes: b.length, sha256: hash(b) };
    });
  return {
    files: pins.length,
    fingerprint: hash(Buffer.from(JSON.stringify(pins))),
  };
}
assert.equal(git(product, "rev-parse", "HEAD"), fixed);
assert.equal(
  git(main, "rev-parse", "HEAD"),
  fixed,
  "moving shared tree must be reported, not silently followed",
);
const audit = {
  kind: "B5-byte-provenance-NOT-product-execution",
  fixed,
  bBase: base,
  ownOld: verify(own, base),
  productTracked: verify(product, fixed),
  mainTracked: verify(main, fixed, ["docs/REVIEW_LOG.md"]),
};
audit.runtimeTreeIdentity = {};
for (const directory of ["core", "protocol", "web/packages"]) {
  const before = git(main, "rev-parse", `${accepted}:${directory}`),
    after = git(main, "rev-parse", `${fixed}:${directory}`);
  assert.equal(after, before);
  audit.runtimeTreeIdentity[directory] = after;
}
audit.stableRoutingIdentity = {};
for (const file of ["web/package.json", "check.sh"]) {
  const before = git(main, "rev-parse", `${accepted}:${file}`),
    after = git(main, "rev-parse", `${fixed}:${file}`);
  assert.equal(after, before);
  audit.stableRoutingIdentity[file] = after;
}
const oldB = rows(own, base).filter((r) =>
  r.file.startsWith("web/tests/independent"),
);
for (const row of oldB)
  assert.deepEqual(read(product, row), read(own, row), row.file);
audit.preservedOldBInputs = oldB.length;
const prior = new Set(
    rows(own, "8d60981103008398c236e8ae7150117c8e553e44").map((r) => r.file),
  ),
  newB = rows(own, base).filter((r) => !prior.has(r.file));
assert.equal(newB.length, 11);
audit.importPins = newB.map((row) => {
  const b = read(own, row);
  assert.deepEqual(read(product, row), b, row.file);
  return { path: row.file, bytes: b.length, sha256: hash(b) };
});
audit.untracked = git(main, "ls-files", "--others", "--exclude-standard", "-z")
  .split("\0")
  .filter(Boolean)
  .map((file) => {
    const b = fs.readFileSync(path.join(main, file));
    return { path: file, bytes: b.length, sha256: hash(b) };
  });
const log = fs.readFileSync(path.join(main, "docs/REVIEW_LOG.md"));
audit.log = { bytes: log.length, sha256: hash(log) };
if (process.env.HIER_B_LOG_PREFIX_BYTES) {
  const n = Number(process.env.HIER_B_LOG_PREFIX_BYTES);
  assert.equal(hash(log.subarray(0, n)), process.env.HIER_B_LOG_PREFIX_SHA256);
  audit.log.originalPrefixPreserved = true;
}
const design = fs.readFileSync(path.join(product, "docs/DESIGN.md"));
assert.equal(
  hash(design),
  "09023b2c435211890f9c2c120487da8dba706da1894142c08df50407e33d7497",
);
audit.designSha256 = hash(design);
console.log(JSON.stringify(audit, null, 2));
