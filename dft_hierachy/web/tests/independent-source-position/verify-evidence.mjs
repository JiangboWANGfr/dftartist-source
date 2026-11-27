// Historical B12 receipts/inputs only; never executes product queryAt semantics.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../../..");
const archive = JSON.parse(
  fs.readFileSync(path.join(root, "docs/m5_b_source_position_freeze.json")),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(
  archive.product.commit,
  "42a92564d5d407aa537960f4738ec8aab7775aa8",
);
assert.equal(
  archive.product.designSha256,
  "ab758f1a52725f2e76c5d7b9b1719e4e86c46840922aabda56574d01139f52d5",
);
assert.equal(
  archive.tests.initialFreeze,
  "4a068f94ca17928af3ccc69ea4fdf2ea75030de9",
);
assert.equal(
  archive.tests.finalFreeze,
  "00f126b93dfe66f0bcaff50f7d0ba617c6a39c0c",
);
const captures = new Map(),
  raws = new Map();
const expectedRed = new Set([
  "b12_model_initial_red",
  "b12_core_initial_red",
  "b12_types_initial_red",
  "b12_facilities_and_legacy",
  "b12_final_model_red",
  "b12_final_core_red",
  "b12_final_types_red",
  "b12_final_protection",
]);
let blocks = 0,
  rawBytes = 0,
  gzipBytes = 0;
function unpack(encoded, bytes, hash) {
  const compressed = Buffer.from(encoded, "base64"),
    raw = gunzipSync(compressed);
  assert.equal(raw.length, bytes);
  assert.equal(sha(raw), hash);
  blocks++;
  rawBytes += raw.length;
  gzipBytes += compressed.length;
  return raw;
}
assert.equal(archive.captures.length, 33);
for (const c of archive.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(c.command.length && c.cwd && !Number.isNaN(Date.parse(c.utc)));
  assert.equal(captures.has(c.name), false);
  captures.set(c.name, c);
  raws.set(
    c.name,
    unpack(c.stdout_gzip_base64, c.stdout_bytes, c.stdout_sha256).toString(),
  );
  assert.equal(c.exit_code, expectedRed.has(c.name) ? 1 : 0, c.name);
}
assert.ok([...expectedRed].every((n) => captures.has(n)));
const json = (n) => JSON.parse(raws.get(n));
for (const [name, n] of [
  ["b12_model_initial_red", 258],
  ["b12_final_model_red", 258],
  ["b12_core_initial_red", 11],
  ["b12_final_core_red", 11],
]) {
  const r = json(name);
  assert.equal(r.planned, n);
  assert.equal(r.executed, 0);
  assert.equal(r.skipped, 0);
  assert.equal(r.passed, 0);
  assert.equal(r.failed, 0);
  assert.deepEqual(r.results, []);
  assert.equal(r.stage, "public-queryAt-capability");
  assert.match(r.error.message, /missing public SourceDocumentModel\.queryAt/);
}
for (const name of ["b12_types_initial_red", "b12_final_types_red"]) {
  const r = json(name);
  assert.equal(r.plannedNegative, 32);
  assert.equal(r.executedNegative, 0);
  assert.equal(r.skipped, 0);
  assert.deepEqual(
    r.positive.map((d) => d.code),
    [2305, 2305, 2339],
  );
}
for (const [name, n] of [
  ["b12_proposal_type_controls", 32],
  ["b12_original_source_types", 34],
]) {
  const r = json(name);
  assert.deepEqual(r.positive, []);
  assert.equal(r.executedNegative, n);
  assert.equal(r.skipped, 0);
  assert.equal(r.results.length, n);
  assert.ok(
    r.results.every((x) =>
      x.diagnostics.some((d) => ![2305, 2307].includes(d.code)),
    ),
  );
}
const old = json("b12_original_source_regression");
assert.equal(old.executed, 306);
assert.equal(old.passed, 306);
assert.equal(old.failed, 0);
assert.equal(old.skipped, 0);
assert.equal(old.results.length, 306);
assert.ok(old.results.every((x) => x.pass));
for (const [name, total, pass, fail] of [
  ["b12_facilities_and_legacy", 10, 7, 3],
  ["b12_final_controls", 13, 13, 0],
]) {
  const raw = raws.get(name);
  for (const [field, n] of [
    ["tests", total],
    ["pass", pass],
    ["fail", fail],
    ["skipped", 0],
    ["cancelled", 0],
  ])
    assert.match(raw, new RegExp("(?:ℹ|#) " + field + " " + n + "(?:\\n|$)"));
}
assert.match(
  raws.get("b12_final_protection"),
  /ENOENT[\s\S]*packages\/protocol\/package\.json/,
);
const protection = json("b12_final_protection_corrected");
assert.deepEqual(
  protection.protectedRoots.map((r) => r.protectedFiles),
  [911, 613, 893],
);
assert.equal(protection.mainDeclarationsPreserved, 41);
assert.equal(protection.productDeclarationsMatchMain, 41);
assert.equal(protection.originalLog.preserved, true);
assert.deepEqual(protection.productOverlay, []);
assert.equal(protection.nativeBuilt, false);
assert.equal(protection.unchangedNewFiles.length, 10);
assert.deepEqual(archive.publicPins, protection.publicPins);
assert.equal(archive.publicPins.length, 50);
assert.equal(json("b12_import_and_product_provenance").BImportedFiles, 6);
const collections = [
  ["b12_model_inventory", 258],
  ["b12_final_core_inventory", 11],
  ["b12_type_inventory", 32],
];
for (const [name, n] of collections) {
  const r = json(name);
  assert.equal(r.count, n);
  assert.equal(r.cases.length, n);
  assert.equal(new Set(r.cases.map((x) => x.id)).size, n);
}
assert.equal(
  json("b12_final_collection_counts").inventorySha256,
  "4d24bbc7bb3ed9bd5046b097622e4e6162c5ccba9603752b2d4ecb5fbe4eaa81",
);
for (const [commitName, attempts] of [
  [
    "b12_freeze_commit",
    [
      "b12_model_initial_red",
      "b12_core_initial_red",
      "b12_types_initial_red",
      "b12_facilities_and_legacy",
    ],
  ],
  [
    "b12_adapter_commit",
    [
      "b12_final_model_red",
      "b12_final_core_red",
      "b12_final_types_red",
      "b12_final_controls",
    ],
  ],
])
  for (const name of attempts)
    assert.ok(
      Date.parse(captures.get(name).utc) >
        Date.parse(captures.get(commitName).utc),
    );
let inputs = 0;
for (const m of archive.materials) {
  const b = unpack(m.gzip_base64, m.bytes, m.sha256);
  if (process.argv.includes("--inputs") && m.root === "B-tests") {
    const actual = m.git
      ? execFileSync("git", ["show", m.git + ":" + m.path], { cwd: root })
      : fs.readFileSync(path.join(root, m.path));
    assert.equal(sha(actual), m.sha256, m.path);
    inputs++;
  }
}
let productFiles = 0;
if (process.argv.includes("--product")) {
  assert.ok(
    process.env.HIER_B_PRODUCT_ROOT,
    "explicit historical product required",
  );
  const product = fs.realpathSync(process.env.HIER_B_PRODUCT_ROOT);
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: product,
      encoding: "utf8",
    }).trim(),
    archive.product.commit,
  );
  const initial = json("b12_initial_protection");
  for (const p of initial.roots[2].files) {
    const b = fs.readFileSync(path.join(product, p.file));
    assert.equal(b.length, p.bytes, p.file);
    assert.equal(sha(b), p.sha256, p.file);
    productFiles++;
  }
  for (const p of archive.publicPins) {
    const b = fs.readFileSync(path.join(product, p.file));
    assert.equal(b.length, p.bytes, p.file);
    assert.equal(sha(b), p.sha256, p.file);
    productFiles++;
  }
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], {
      cwd: product,
      encoding: "utf8",
    }).trim(),
    "",
  );
}
console.log(
  JSON.stringify({
    archiveVerified: true,
    captures: captures.size,
    materials: archive.materials.length,
    pins: archive.publicPins.length,
    blocks,
    rawBytes,
    gzipBytes,
    checkedInputs: inputs,
    checkedProductFiles: productFiles,
    initialControls: { pass: 7, fail: 3 },
    finalControls: { pass: 13, fail: 0 },
    queryAtPlanned: { model: 258, core: 11, types: 32 },
    queryAtSemanticExecuted: 0,
    queryAtSkipped: 0,
    oldSourceModelPassed: 306,
    oldSourceTypeNegatives: 34,
    proposalTypeControls: 32,
    semanticsExecutedByThisVerifier: 0,
  }),
);
