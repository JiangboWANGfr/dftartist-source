// Integrity/provenance only: hashes bytes without using product implementation as an oracle.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const own = path.resolve(import.meta.dirname, "../../.."),
  product = path.resolve(process.env.HIER_B_PRODUCT_ROOT),
  main = path.resolve(process.env.HIER_B_MAIN_ROOT);
const base = "44be464307b747ff177178943dace973c349ed71",
  freeze = "c99143c5baff94fbe1f41a5c3da77a0b70f475e9",
  productSHA = "782c599f710bd73a7e1be1cb38a4dca7786831bd";
const git = (cwd, ...args) => execFileSync("git", args, { cwd });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function entries(cwd, revision) {
  return git(cwd, "ls-tree", "-rz", revision)
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((row) => {
      const split = row.indexOf("\t"),
        [mode, , oid] = row.slice(0, split).split(" ");
      return { mode, oid, file: row.slice(split + 1) };
    });
}
function bytes(cwd, row) {
  const filename = path.join(cwd, row.file);
  return row.mode === "120000"
    ? Buffer.from(fs.readlinkSync(filename))
    : fs.readFileSync(filename);
}
function unchanged(cwd, revision, exclude = []) {
  const rows = entries(cwd, revision).filter(
    (row) => !exclude.includes(row.file),
  );
  for (const row of rows) {
    assert.ok(
      row.mode === "100644" || row.mode === "100755" || row.mode === "120000",
    );
    const value = bytes(cwd, row),
      oid = createHash("sha1")
        .update(Buffer.from(`blob ${value.length}\0`))
        .update(value)
        .digest("hex");
    assert.equal(oid, row.oid, row.file);
  }
  return rows.length;
}
assert.equal(git(product, "rev-parse", "HEAD").toString().trim(), productSHA);
assert.equal(git(main, "rev-parse", "HEAD").toString().trim(), productSHA);
const oldBOwnFilesUnchanged = unchanged(own, base),
  fixedProductFilesUnchanged = unchanged(product, productSHA),
  mainNonLogTrackedFilesUnchanged = unchanged(main, productSHA, [
    "docs/REVIEW_LOG.md",
  ]);
const frozenInputPins = entries(own, freeze)
  .filter((row) =>
    row.file.startsWith("web/tests/independent-electron-renderer/"),
  )
  .map((row) => {
    const value = bytes(own, row);
    assert.equal(
      createHash("sha1")
        .update(Buffer.from(`blob ${value.length}\0`))
        .update(value)
        .digest("hex"),
      row.oid,
      row.file,
    );
    return {
      path: row.file,
      bytes: value.length,
      sha256: sha(value),
      gitBlob: row.oid,
    };
  });
assert.equal(frozenInputPins.length, 10);
const design = fs.readFileSync(path.join(product, "docs/DESIGN.md")),
  text = design.toString("utf8");
const section = Buffer.from(
  text.slice(text.indexOf("### 6.8 "), text.indexOf("### 6.9 ")),
);
assert.equal(section.length, 14082);
assert.equal(
  sha(section),
  "04e0a644951850188eff5db8b250308009e1ad9beae055137b949efbaf28abcf",
);
const specificationPins = [
  "docs/DESIGN.md",
  "web/contracts/electron/bridge.d.ts",
  "web/contracts/electron/renderer.d.ts",
].map((file) => {
  const value = fs.readFileSync(path.join(product, file));
  return { path: file, bytes: value.length, sha256: sha(value) };
});
const log = fs.readFileSync(path.join(main, "docs/REVIEW_LOG.md"));
assert.equal(
  sha(log.subarray(0, 1455136)),
  "2efc8c2331c2cbe7e4966466f6bc5c4e7491c54626363c6f8f10dd7395abd7a1",
);
const mainUntrackedAtAudit = git(
  main,
  "ls-files",
  "--others",
  "--exclude-standard",
  "-z",
)
  .toString()
  .split("\0")
  .filter(Boolean)
  .map((file) => {
    const value = fs.readFileSync(path.join(main, file));
    return { path: file, bytes: value.length, sha256: sha(value) };
  });
console.log(
  JSON.stringify(
    {
      kind: "B integrity only; no product semantics or implementation-derived oracle",
      base,
      freeze,
      productSHA,
      own,
      product,
      oldBOwnFilesUnchanged,
      fixedProductFilesUnchanged,
      mainNonLogTrackedFilesUnchanged,
      frozenInputPins,
      specificationPins,
      section68: { bytes: section.length, sha256: sha(section) },
      claimLogPrefix: {
        bytes: 1455136,
        sha256:
          "2efc8c2331c2cbe7e4966466f6bc5c4e7491c54626363c6f8f10dd7395abd7a1",
      },
      mainUntrackedAtAudit,
      productStatus: git(product, "status", "--porcelain=v1").toString(),
      mainStatus: git(main, "status", "--porcelain=v1").toString(),
    },
    null,
    2,
  ),
);
