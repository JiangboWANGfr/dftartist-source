// Read-only A runtime archive verification. This does not rerun product tests.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
const inputs = args.includes("--inputs");
const paths = args.filter((arg) => arg !== "--inputs");
assert.ok(paths.length <= 1);
const archive = JSON.parse(
  readFileSync(
    resolve(
      root,
      paths[0] ?? "docs/m5_source_confirmation_runtime_a_verification.json",
    ),
    "utf8",
  ),
);
function unpack(block) {
  const bytes = gunzipSync(Buffer.from(block.gzipBase64, "base64"));
  assert.equal(bytes.length, block.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), block.sha256);
  return bytes;
}
assert.equal(archive.kind, "A30 source confirmation runtime evidence");
assert.equal(archive.productionImplemented, true);
assert.equal(archive.independentRuntimeAccepted, false);
assert.equal(archive.c94ClosureOwner, "C");
assert.equal(archive.c94ClosedByA, false);
assert.equal(archive.m5Complete, false);
const captures = new Map();
for (const capture of archive.captures) {
  assert.ok(!captures.has(capture.label));
  captures.set(capture.label, {
    ...capture,
    out: unpack(capture.stdout).toString(),
    err: unpack(capture.stderr).toString(),
  });
}
const materials = new Map();
for (const material of archive.materials) {
  assert.ok(!materials.has(material.name));
  const bytes = unpack(material.content);
  materials.set(material.name, bytes);
  if (inputs && material.repoPath)
    assert.deepEqual(
      readFileSync(resolve(root, material.repoPath)),
      bytes,
      material.name,
    );
}
for (const label of [
  "c94-after",
  "c94-types",
  "b30-archive",
  "b30-controls",
  "runtime-build",
  "b-runtime-after",
  "b-types-after",
  "b-facility",
  "a-core",
  "a-q1",
  "full-check",
  "format-check",
  "diff-check",
  "audit",
]) {
  assert.equal(captures.get(label)?.exitCode, 0, label);
}
const json = (label) => JSON.parse(captures.get(label).out);
const oldBrand = json("c94-before");
assert.equal(captures.get("c94-before").exitCode, 1);
assert.deepEqual(oldBrand.diagnostics, []);
assert.ok(oldBrand.exports.includes("sourceCandidateActionBrand"));
const fixedBrand = json("c94-after");
assert.ok(!fixedBrand.exports.includes("sourceCandidateActionBrand"));
assert.deepEqual(
  fixedBrand.diagnostics.map((d) => d.code).sort(),
  [2724, 2741],
);
const proposal = json("c94-types");
assert.equal(proposal.negatives, 23);
assert.equal(proposal.positiveDiagnostics, 0);
const before = json("b-runtime-before"),
  after = json("b-runtime-after");
assert.equal(captures.get("b-runtime-before").exitCode, 1);
assert.deepEqual(
  [before.planned, before.executed, before.passed, before.blocked],
  [121, 0, 0, 121],
);
assert.deepEqual(
  [
    after.planned,
    after.executed,
    after.passed,
    after.failed,
    after.blocked,
    after.skipped,
  ],
  [121, 121, 121, 0, 0, 0],
);
assert.equal(after.results.length, 121);
assert.ok(after.results.every((row) => row.pass));
assert.equal(captures.get("b-types-before").exitCode, 1);
assert.equal(json("b-types-before").executedNegative, 0);
const types = json("b-types-after");
assert.deepEqual(
  [
    types.plannedNegative,
    types.executedNegative,
    types.blockedNegative,
    types.skipped,
  ],
  [37, 37, 0, 0],
);
assert.deepEqual(types.positive, []);
assert.equal(types.results.length, 37);
for (const [label, count] of [
  ["b-facility", 6],
  ["a-q1", 6],
  ["a-core", 2],
]) {
  const text = captures.get(label).out;
  assert.match(text, new RegExp("tests " + count));
  assert.match(text, new RegExp("pass " + count));
  for (const status of ["fail", "cancelled", "skipped", "todo"])
    assert.match(text, new RegExp(status + " 0"));
}
const full = captures.get("full-check").out;
assert.match(full, /=== all checks passed/);
assert.match(
  full,
  /M5: independent source confirmation behavior and public types/,
);
assert.match(full, /M5: source confirmation real SDK\/Node\/Core integration/);
for (const [config, count] of [
  ["build", 78],
  ["build-debug", 81],
  ["build-asan", 83],
]) {
  assert.match(
    materials.get("core/" + config + "/ctest.log").toString(),
    new RegExp("100% tests passed, 0 tests failed out of " + count),
  );
}
const baseline = JSON.parse(materials.get("baseline.json").toString());
const audit = JSON.parse(materials.get("audit-result.json").toString());
assert.equal(Object.keys(baseline.files).length, 1214);
for (const name of audit.strictUnchanged)
  assert.deepEqual(audit.files[name], baseline.files[name], name);
assert.equal(audit.changedDeclarations.length, 3);
assert.equal(audit.finalImportBlobs.length, 16);
assert.equal(audit.imports.length, 2);
for (const item of audit.imports)
  assert.equal(item.sourceRawDelta, item.targetRawDelta);
assert.deepEqual(audit.logPrefix, baseline.files["docs/REVIEW_LOG.md"]);
assert.equal(audit.logUnstaged, true);
for (const warnings of Object.values(audit.buildWarnings))
  assert.deepEqual(warnings, []);
console.log(
  JSON.stringify({
    archiveVerified: true,
    currentProductExecutions: 0,
    captures: captures.size,
    materials: materials.size,
    inputsChecked: inputs,
    historicalRuntime: 121,
    historicalPublicTypes: 37,
    historicalCoreConfigurations: [78, 81, 83],
    independentRuntimeAccepted: false,
    c94ClosureOwner: "C",
    m5Complete: false,
  }),
);
