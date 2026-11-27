// B evidence/provenance verifier. This never runs or substitutes a product model.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const archive = path.join(root, "docs/m5_b_source_candidates_freeze.json");
const a = JSON.parse(fs.readFileSync(archive, "utf8")),
  sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(a.product.commit, "61db0b26d90f6017d040a63eb06361c9bb3c4b14");
assert.equal(
  a.contract.sha256,
  "0fd34f932a8b3d6f6bbc367f64c8eaf0afb0697c3ec971f2d3ade05a53a6fa52",
);
assert.equal(a.freeze.original, "88e2e2a565600f55617c70864cb824df72976d4b");
assert.equal(a.freeze.final, "e5118800c8f3f07fcc0238539ab0e39bc1fd7554");
const captures = new Map(),
  decoded = new Map();
let blocks = 0,
  rawBytes = 0,
  gzipBytes = 0;
for (const c of a.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(Array.isArray(c.command) && c.command.length);
  assert.ok(c.cwd && c.utc);
  assert.equal(captures.has(c.name), false);
  const zipped = Buffer.from(c.stdout_gzip_base64, "base64"),
    b = gunzipSync(zipped);
  assert.equal(b.length, c.stdout_bytes);
  assert.equal(sha(b), c.stdout_sha256);
  captures.set(c.name, c);
  decoded.set(c.name, b.toString("utf8"));
  blocks++;
  rawBytes += b.length;
  gzipBytes += zipped.length;
}
const get = (name) => {
  assert.ok(captures.has(name), name);
  return JSON.parse(decoded.get(name));
};
const reds = [
  "b10_model_initial_red",
  "b10_model_core_initial_red",
  "b10_types_initial_red",
  "b10_sdk_facilities",
  "b10_model_final_red",
  "b10_model_core_final_red",
  "b10_types_final_red",
];
for (const c of a.captures)
  assert.equal(c.exit_code, reds.includes(c.name) ? 1 : 0, c.name);
for (const [name, count] of [
  ["b10_model_initial_red", 281],
  ["b10_model_final_red", 281],
  ["b10_model_core_initial_red", 13],
  ["b10_model_core_final_red", 13],
]) {
  const r = get(name);
  assert.equal(r.planned, count);
  assert.equal(r.executed, 0);
  assert.equal(r.passed, 0);
  assert.equal(r.failed, 0);
  assert.equal(r.skipped, 0);
  assert.equal(r.stage, "public-export-capability");
  assert.equal(r.results.length, 0);
  assert.match(r.error.message, /missing public SourceCandidatesModel/);
}
for (const name of ["b10_types_initial_red", "b10_types_final_red"]) {
  const r = get(name);
  assert.equal(r.plannedNegative, 47);
  assert.equal(r.executedNegative, 0);
  assert.equal(r.skipped, 0);
  assert.equal(r.stage, "positive-public-types");
  assert.ok(
    r.positive.some(
      (d) => d.code === 2305 && d.message.includes("SourceCandidatesModel"),
    ),
  );
}
for (const [name, count] of [
  ["b10_real_sdk_core_controls", 12],
  ["b10_real_sdk_core_controls_final", 12],
  ["b10_original_source_regression", 306],
  ["b10_original_source_core_regression", 14],
]) {
  const r = get(name);
  assert.equal(r.executed, count);
  assert.equal(r.passed, count);
  assert.equal(r.failed, 0);
  assert.equal(r.skipped, 0);
  assert.equal(r.results.length, count);
  assert.ok(r.results.every((x) => x.pass === true));
}
for (const [name, count] of [
  ["b10_proposal_type_controls", 47],
  ["b10_original_source_type_regression", 34],
]) {
  const r = get(name);
  assert.deepEqual(r.positive, []);
  assert.equal(r.executedNegative, count);
  assert.equal(r.results.length, count);
  assert.ok(
    r.results.every((x) =>
      x.diagnostics.some((d) => ![2305, 2307].includes(d.code)),
    ),
  );
}
for (const [name, pass, fail] of [
  ["b10_sdk_facilities", 5, 1],
  ["b10_sdk_facilities_final", 6, 0],
]) {
  const text = decoded.get(name);
  assert.match(text, /(?:ℹ|#) tests 6/);
  assert.match(text, new RegExp("(?:ℹ|#) pass " + pass));
  assert.match(text, new RegExp("(?:ℹ|#) fail " + fail));
  assert.match(text, /(?:ℹ|#) skipped 0/);
}
const inv = get("b10_freeze_inventory"),
  core = get("b10_freeze_core_inventory");
assert.equal(inv.count, 281);
assert.equal(core.count, 13);
assert.equal(new Set([...inv.cases, ...core.cases].map((x) => x.id)).size, 294);
for (const c of [...inv.cases, ...core.cases])
  assert.ok(c.input !== undefined && c.expected && c.basis);
let inputs = 0;
for (const m of a.materials) {
  const zipped = Buffer.from(m.gzip_base64, "base64"),
    b = gunzipSync(zipped);
  assert.equal(b.length, m.bytes);
  assert.equal(sha(b), m.sha256);
  if (process.argv.includes("--inputs")) {
    assert.equal(
      sha(fs.readFileSync(path.join(root, m.path))),
      m.sha256,
      m.path,
    );
    inputs++;
  }
  blocks++;
  rawBytes += b.length;
  gzipBytes += zipped.length;
}
const init = get("b10_initial_protection"),
  protection = get("b10_protection_after_tests");
assert.deepEqual(
  protection.protected.map((r) => r.protectedFiles),
  [873, 589, 855],
);
assert.equal(protection.declarations, 37);
assert.equal(protection.productNoTrackedOverlay, "");
assert.equal(protection.mainStaged, "");
assert.equal(protection.binary.bytes, 9326184);
assert.equal(
  protection.binary.sha256,
  "1e5b6f05e8716fc7cdf45124eb17a9fe1dbf26bb6a2046374799bb7ed4186590",
);
let productFiles = 0;
if (process.argv.includes("--product")) {
  assert.ok(process.env.HIER_B_PRODUCT_ROOT);
  const product = fs.realpathSync(process.env.HIER_B_PRODUCT_ROOT);
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: product,
      encoding: "utf8",
    }).trim(),
    a.product.commit,
  );
  for (const f of init.roots[2].files) {
    assert.equal(
      sha(fs.readFileSync(path.join(product, f.file))),
      f.sha256,
      f.file,
    );
    productFiles++;
  }
  for (const f of a.productPins)
    assert.equal(
      sha(fs.readFileSync(path.join(product, f.path))),
      f.sha256,
      f.path,
    );
  assert.equal(
    execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
      cwd: product,
      encoding: "utf8",
    }),
    "",
  );
}
assert.equal(a.productPins.filter((p) => p.path.endsWith(".d.ts")).length, 38); // 37 generated + isolated proposal.
console.log(
  JSON.stringify(
    {
      kind: "archive/input/provenance-verifier-NOT-product-semantics",
      captures: captures.size,
      materials: a.materials.length,
      productPins: a.productPins.length,
      blocks,
      rawBytes,
      gzipBytes,
      inputsVerified: inputs,
      productFilesVerified: productFiles,
      originalFailureRetained: true,
      modelCasesExecuted: 0,
      coreModelCasesExecuted: 0,
    },
    null,
    2,
  ),
);
