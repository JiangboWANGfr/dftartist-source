// B7: byte/provenance checks only; never interpret product implementation as an oracle.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const own = path.resolve(import.meta.dirname, "../../..");
const main = path.resolve(process.env.HIER_B_MAIN_ROOT);
const product = path.resolve(process.env.HIER_B_PRODUCT_ROOT);
const fixed = "fd08ae787ba9f3c85ef83408a5d7fcb96b6af082";
const prior = "e4ba060767a3a53d19198b0214ca1f7d1690cc49";
const base = "d07131c00c4813eadf88618c55ad842620be414e";
const gitBytes = (root, ...args) =>
  execFileSync("git", args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const git = (root, ...args) =>
  gitBytes(root, ...args)
    .toString()
    .trimEnd();
const sha = (b) => createHash("sha256").update(b).digest("hex");
function rows(root, revision) {
  return git(root, "ls-tree", "-rz", revision)
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf("\t"),
        [mode, , oid] = line.slice(0, at).split(" ");
      return { mode, oid, file: line.slice(at + 1) };
    });
}
function read(root, row) {
  return row.mode === "120000"
    ? Buffer.from(fs.readlinkSync(path.join(root, row.file)))
    : fs.readFileSync(path.join(root, row.file));
}
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
assert.equal(
  git(product, "status", "--porcelain"),
  "",
  "pure fixed product test tree",
);
const result = {
  kind: "B7-fixed-import-wiring-protection-NOT-product-semantics",
  fixed,
  prior,
  base,
  productTracked: verify(product, fixed),
  mainTracked: verify(main, fixed, ["docs/REVIEW_LOG.md"]),
  ownOriginal: verify(own, base),
};
result.productionTrees = {};
for (const dir of ["core", "protocol"]) {
  const before = git(product, "rev-parse", prior + ":" + dir),
    after = git(product, "rev-parse", fixed + ":" + dir);
  assert.equal(after, before, dir);
  result.productionTrees[dir] = after;
}
const packageChanges = git(
  product,
  "diff-tree",
  "--no-commit-id",
  "--name-only",
  "-r",
  prior,
  fixed,
  "--",
  "web/packages",
)
  .split("\n")
  .filter(Boolean);
assert.deepEqual(packageChanges, ["web/packages/client/README.md"]);
result.packageDocumentationOnlyChanges = packageChanges;
result.imports = [];
const imported = new Set();
for (const [b, a] of [
  ["053b5add7acf50335ddc25d4167e623d812df142", "a99d44d"],
  ["aad11d6c5a2b1540d47465b50ee430ba9c846013", "f3c49ce"],
  ["d07131c00c4813eadf88618c55ad842620be414e", "9501273"],
]) {
  const before = gitBytes(own, "diff", "--binary", "--full-index", b + "^", b);
  const after = gitBytes(
    product,
    "diff",
    "--binary",
    "--full-index",
    a + "^",
    a,
  );
  assert.deepEqual(after, before, "whole B import patch unchanged");
  const files = git(own, "diff-tree", "--no-commit-id", "--name-only", "-r", b)
    .split("\n")
    .filter(Boolean);
  files.forEach((f) => imported.add(f));
  result.imports.push({
    b,
    a: git(product, "rev-parse", a),
    bytes: before.length,
    sha256: sha(before),
    files,
  });
}
assert.equal(imported.size, 17);
const pinned = new Set([
  ...imported,
  "AGENTS.md",
  "docs/DESIGN.md",
  "docs/VALIDATION.md",
  "docs/plans/M5-source-gate-closeout.md",
  "web/package.json",
  "check.sh",
  "web/scripts/run-client-identity-tests.mjs",
  "web/scripts/run-source-document-tests.mjs",
]);
const originalSource = rows(
  own,
  "6838e4cec4a1f6b08624f2f8bb8d2a742a4ce99d",
).filter((r) => r.file.startsWith("web/tests/independent-source-document/"));
assert.equal(originalSource.length, 15);
for (const r of originalSource) {
  assert.deepEqual(
    read(product, r),
    gitBytes(own, "show", "6838e4cec4a1f6b08624f2f8bb8d2a742a4ce99d:" + r.file),
    r.file,
  );
  pinned.add(r.file);
}
result.originalSourceFiles = originalSource.length;
for (const file of imported)
  assert.deepEqual(
    fs.readFileSync(path.join(product, file)),
    gitBytes(own, "show", base + ":" + file),
    file,
  );
assert.deepEqual(
  fs.readFileSync(path.join(product, "check.sh")),
  gitBytes(product, "show", prior + ":check.sh"),
);
result.pins = [...pinned].sort().map((file) => {
  const b = fs.readFileSync(path.join(product, file));
  return { path: file, bytes: b.length, sha256: sha(b) };
});
assert.equal(
  result.pins.find((p) => p.path === "docs/DESIGN.md").sha256,
  "75e20f5b0637515f103c1cfdf508db227c155570c58baded3ec0de17011788a5",
);
result.untracked = git(main, "ls-files", "--others", "--exclude-standard", "-z")
  .split("\0")
  .filter(Boolean)
  .map((file) => {
    const b = fs.readFileSync(path.join(main, file));
    return { path: file, bytes: b.length, sha256: sha(b) };
  });
const log = fs.readFileSync(path.join(main, "docs/REVIEW_LOG.md"));
const prefixBytes = Number(process.env.HIER_B_LOG_PREFIX_BYTES);
assert.ok(Number.isSafeInteger(prefixBytes) && prefixBytes > 0);
assert.equal(
  sha(log.subarray(0, prefixBytes)),
  process.env.HIER_B_LOG_PREFIX_SHA256,
);
result.log = {
  bytes: log.length,
  sha256: sha(log),
  prefixBytes,
  prefixSha256: process.env.HIER_B_LOG_PREFIX_SHA256,
  originalPrefixPreserved: true,
};
if (process.argv.includes("--declarations")) {
  const oldRoot = "/tmp/hier-b-orch6-source.v992hyw6/source";
  const declarations = [];
  function visit(dir) {
    for (const item of fs.readdirSync(path.join(product, dir), {
      withFileTypes: true,
    })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) visit(file);
      else if (file.endsWith(".d.ts")) {
        const b = fs.readFileSync(path.join(product, file));
        assert.deepEqual(b, fs.readFileSync(path.join(oldRoot, file)), file);
        declarations.push({ path: file, bytes: b.length, sha256: sha(b) });
      }
    }
  }
  for (const name of fs.readdirSync(path.join(product, "web/packages"))) {
    const dir = "web/packages/" + name + "/dist";
    if (fs.existsSync(path.join(product, dir))) visit(dir);
  }
  assert.equal(declarations.length, 37);
  result.unchangedDeclarations = declarations;
}
console.log(JSON.stringify(result, null, 2));
