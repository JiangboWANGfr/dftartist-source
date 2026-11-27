// B6 byte identity only: no implementation reading or output-derived oracle.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const own = path.resolve(import.meta.dirname, "../../../.."),
  main = path.resolve(process.env.HIER_B_MAIN_ROOT),
  product = path.resolve(process.env.HIER_B_PRODUCT_ROOT);
const fixed = "e4ba060767a3a53d19198b0214ca1f7d1690cc49",
  base = "4dafc5555e9e6b73bb1b31b3ad23a0f7c6e01133",
  previous = "ccbef3f78c16c84463850255c65e5889a42bb321";
const maintained =
  "web/tests/independent-transport-sharing/compatibility.test.mjs";
const git = (root, ...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trimEnd(),
  sha = (b) => createHash("sha256").update(b).digest("hex");
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
      return { path: row.file, bytes: b.length, sha256: sha(b) };
    });
  return {
    files: pins.length,
    fingerprint: sha(Buffer.from(JSON.stringify(pins))),
  };
}
assert.equal(git(product, "rev-parse", "HEAD"), fixed);
assert.equal(git(main, "rev-parse", "HEAD"), fixed);
const audit = {
  kind: "B6-fixed-source-protection-NOT-semantics",
  fixed,
  base,
  ownOld: verify(own, base, [maintained]),
  productTracked: verify(product, fixed, [maintained]),
  mainTracked: verify(main, fixed, ["docs/REVIEW_LOG.md"]),
};
audit.nativeTrees = {};
for (const dir of ["core", "protocol"]) {
  const before = git(main, "rev-parse", previous + ":" + dir),
    after = git(main, "rev-parse", fixed + ":" + dir);
  assert.equal(after, before);
  audit.nativeTrees[dir] = after;
}
const inputs = rows(own, base).filter((r) =>
  r.file.startsWith("web/tests/independent"),
);
for (const row of inputs.filter((r) => r.file !== maintained))
  assert.deepEqual(read(product, row), read(own, row), row.file);
audit.originalBInputs = inputs.length;
const historical = fs.readFileSync(
    path.join(
      own,
      "web/tests/independent-transport-sharing/history/pre-identity/compatibility.test.mjs",
    ),
  ),
  original = execFileSync("git", ["show", base + ":" + maintained], {
    cwd: own,
  });
assert.deepEqual(historical, original, "original S01/S02 full source retained");
const active = fs.readFileSync(path.join(own, maintained)),
  actual = fs.readFileSync(path.join(product, maintained));
assert.ok(
  actual.equals(original) || actual.equals(active),
  "only original or explicitly maintained B compatibility input allowed",
);
audit.activeCompatibility = {
  path: maintained,
  originalSha256: sha(original),
  historicalSha256: sha(historical),
  ownSha256: sha(active),
  productSha256: sha(actual),
  productUsesMaintained: actual.equals(active),
};
const prior = new Set(
    rows(own, "fc989a2c7d2a04fa94807281fe80b097754ef69a").map((r) => r.file),
  ),
  imported = rows(own, base).filter((r) => !prior.has(r.file));
assert.equal(imported.length, 19);
audit.sourceImportPins = imported.map((row) => {
  const b = read(own, row);
  assert.deepEqual(read(product, row), b, row.file);
  return { path: row.file, bytes: b.length, sha256: sha(b) };
});
audit.untracked = git(main, "ls-files", "--others", "--exclude-standard", "-z")
  .split("\0")
  .filter(Boolean)
  .map((file) => {
    const b = fs.readFileSync(path.join(main, file));
    return { path: file, bytes: b.length, sha256: sha(b) };
  });
const log = fs.readFileSync(path.join(main, "docs/REVIEW_LOG.md"));
audit.log = { bytes: log.length, sha256: sha(log) };
if (process.env.HIER_B_LOG_PREFIX_BYTES) {
  const n = Number(process.env.HIER_B_LOG_PREFIX_BYTES);
  assert.equal(sha(log.subarray(0, n)), process.env.HIER_B_LOG_PREFIX_SHA256);
  audit.log.originalPrefixPreserved = true;
}
const design = fs.readFileSync(path.join(product, "docs/DESIGN.md"));
assert.equal(
  sha(design),
  "cc4c0b0c86729718933c206ae0758e4917bbe50f6267aad50ee32e4d673c86a7",
);
audit.designSha256 = sha(design);
console.log(JSON.stringify(audit, null, 2));
