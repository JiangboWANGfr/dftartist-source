// C-84 provenance/overlay audit: bytes only, never runtime-derived expectations.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const own = path.resolve(import.meta.dirname, "../../..");
const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT);
const space = path.resolve(process.env.HIER_B_SPACE_ROOT);
const main = path.resolve(process.env.HIER_B_MAIN_ROOT);
const fixed = "fd08ae787ba9f3c85ef83408a5d7fcb96b6af082";
const base = "e65a0329b190ab3228d40f6ef1aa7adca6df0689";
const target = "web/tests/independent-transport-sharing/compatibility.test.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const gitRaw = (root, ...args) =>
  execFileSync("git", args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const git = (root, ...args) =>
  gitRaw(root, ...args)
    .toString()
    .trimEnd();
function verify(root, revision, exclude = []) {
  const pins = git(root, "ls-tree", "-rz", revision)
    .split("\0")
    .filter(Boolean)
    .map((l) => {
      const at = l.indexOf("\t"),
        [mode, , oid] = l.slice(0, at).split(" ");
      return { mode, oid, file: l.slice(at + 1) };
    })
    .filter((r) => !exclude.includes(r.file))
    .map((r) => {
      const b =
        r.mode === "120000"
          ? Buffer.from(fs.readlinkSync(path.join(root, r.file)))
          : fs.readFileSync(path.join(root, r.file));
      assert.equal(
        createHash("sha1")
          .update(Buffer.from(`blob ${b.length}\0`))
          .update(b)
          .digest("hex"),
        r.oid,
        r.file,
      );
      return { path: r.file, bytes: b.length, sha256: sha(b) };
    });
  return {
    files: pins.length,
    fingerprint: sha(Buffer.from(JSON.stringify(pins))),
  };
}
for (const r of [product, space, main])
  assert.equal(git(r, "rev-parse", "HEAD"), fixed);
assert.equal(git(product, "status", "--porcelain"), "");
assert.equal(git(space, "status", "--porcelain").trim(), "M " + target);
const original = gitRaw(own, "show", base + ":" + target);
const before =
  'new URL(\n            "../independent-client-identity/verify-types.mjs",\n            import.meta.url,\n          ).pathname';
const after =
  'fileURLToPath(\n            new URL(\n              "../independent-client-identity/verify-types.mjs",\n              import.meta.url,\n            ),\n          )';
assert.equal(original.toString().split(before).length, 2);
const expected = Buffer.from(
  original
    .toString()
    .replace(
      'import { execFileSync } from "node:child_process";',
      'import { execFileSync } from "node:child_process";\nimport { fileURLToPath } from "node:url";',
    )
    .replace(before, after),
);
const corrected = fs.readFileSync(path.join(own, target));
assert.deepEqual(
  corrected,
  expected,
  "only native-path conversion/import, no oracle edit",
);
assert.deepEqual(fs.readFileSync(path.join(space, target)), corrected);
assert.deepEqual(fs.readFileSync(path.join(product, target)), original);
const marker = 'test(\n  "B sharing S03';
assert.ok(original.toString().includes(marker));
assert.equal(
  original.toString().slice(original.toString().indexOf(marker)),
  corrected.toString().slice(corrected.toString().indexOf(marker)),
);
const pin = (root, file) => {
  const b = fs.readFileSync(path.join(root, file));
  return { path: file, bytes: b.length, sha256: sha(b) };
};
const result = {
  kind: "B-C84-byte-overlay-NOT-semantics",
  fixed,
  base,
  target,
  original: { bytes: original.length, sha256: sha(original) },
  corrected: { bytes: corrected.length, sha256: sha(corrected) },
  productTracked: verify(product, fixed),
  overlayTracked: verify(space, fixed, [target]),
  mainTracked: verify(main, fixed, ["docs/REVIEW_LOG.md"]),
  ownOriginalExceptAdaptation: verify(own, base, [target]),
  s03ToS09Unchanged: true,
  overlayPaths: [target],
};
result.historyPins = ["compatibility.test.mjs", "realm-controls.mjs"].map(
  (name) =>
    pin(
      own,
      "web/tests/independent-transport-sharing/history/pre-identity/" + name,
    ),
);
result.untracked = git(main, "ls-files", "--others", "--exclude-standard", "-z")
  .split("\0")
  .filter(Boolean)
  .map((f) => pin(main, f));
const log = fs.readFileSync(path.join(main, "docs/REVIEW_LOG.md")),
  bytes = Number(process.env.HIER_B_LOG_PREFIX_BYTES),
  digest = process.env.HIER_B_LOG_PREFIX_SHA256;
assert.equal(sha(log.subarray(0, bytes)), digest);
result.log = {
  bytes: log.length,
  sha256: sha(log),
  prefixBytes: bytes,
  prefixSha256: digest,
  originalPrefixPreserved: true,
};
const paths = [
  "web/tests/independent-source-gates/c84-paths.mjs",
  "web/tests/independent-source-gates/c84-audit.mjs",
  "docs/plans/C84-path-adaptation-independent.md",
  target,
];
result.inputPins = paths.map((f) => pin(own, f));
result.productionRootsUnchanged = true;
console.log(JSON.stringify(result, null, 2));
