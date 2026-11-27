// Archive/provenance verification, not a model/runtime implementation or semantic pass.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, "../../.."),
  file = path.join(root, "docs/m5_b_instance_properties_freeze.json");
const bytes = fs.readFileSync(file),
  e = JSON.parse(bytes),
  sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(e.freezeCommit, "c3103c68ba555cc8c0a5b93365a22c5eabc73228");
const failing = new Set([
  "runtime-initial",
  "runtime-canonical",
  "runtime-final",
  "core-model-initial",
  "core-model-canonical",
  "core-model-final",
  "types-production-initial",
  "types-production-corrected",
  "types-production-final",
  "types-proposal-initial",
]);
const outputs = new Map();
let rawBytes = 0,
  gzipBytes = 0;
for (const r of e.records) {
  assert.equal(outputs.has(r.label), false);
  assert.equal(r.capture_complete, true);
  const zipped = Buffer.from(r.stdout_gzip_base64, "base64"),
    data = gunzipSync(zipped);
  assert.equal(data.length, r.stdout_bytes);
  assert.equal(sha(data), r.stdout_sha256);
  assert.equal(r.exit_code, failing.has(r.label) ? 1 : 0);
  outputs.set(r.label, data.toString());
  rawBytes += data.length;
  gzipBytes += zipped.length;
}
const object = (k) => {
  assert.ok(outputs.has(k), "missing " + k);
  return JSON.parse(outputs.get(k));
};
for (const [label, count] of [
  ["runtime-initial", 252],
  ["runtime-final", 252],
  ["core-model-initial", 5],
  ["core-model-final", 5],
]) {
  const r = object(label);
  assert.equal(r.exitCode, 1);
  assert.equal(r.stage, "production-export-capability");
  assert.equal(r.plannedCases, count);
  assert.equal(r.executedCases, 0);
  assert.equal(r.skippedCases, 0);
  assert.deepEqual(r.results, []);
}
for (const [a, b, n] of [
  ["inventory", "inventory-final-full", 252],
  ["core-inventory", "core-inventory-final-full", 5],
]) {
  assert.equal(outputs.get(a), outputs.get(b));
  const r = object(a);
  assert.equal(r.count, n);
  assert.equal(r.cases.length, n);
  assert.equal(new Set(r.cases.map((c) => c.id)).size, n);
  for (const c of r.cases) assert.ok(c.input && c.expected && c.basis);
}
assert.equal(object("inventory-final").runtimeInputs, 252);
assert.equal(object("inventory-final").realCoreModelInputs, 5);
const oldType = object("types-proposal-initial");
assert.equal(oldType.exitCode, 1);
assert.equal(oldType.positiveDiagnostics.length, 4);
const types = object("types-proposal-final");
assert.equal(types.exitCode, 0);
assert.deepEqual(types.positiveDiagnostics, []);
assert.equal(types.negativeCasesExecuted, 22);
assert.ok(types.negativeDiagnostics.length >= 22);
assert.equal(types.platformTypeDependencies, 0);
const production = object("types-production-final");
assert.equal(production.exitCode, 1);
assert.equal(production.negativeCasesExecuted, 0);
assert.equal(
  production.positiveDiagnostics.filter((d) => d.code === 2305).length,
  6,
);
for (const [label, count] of [
  ["fixture-core-controls-initial", 15],
  ["fixture-core-controls-final", 16],
]) {
  const output = outputs.get(label);
  for (const [key, value] of [
    ["tests", count],
    ["pass", count],
    ["fail", 0],
    ["skipped", 0],
    ["cancelled", 0],
    ["todo", 0],
  ])
    assert.match(output, new RegExp("^# " + key + " " + value + "$", "m"));
}
const regression = outputs.get("standard-independent-810");
assert.match(regression, /tests 810/);
assert.match(regression, /pass 810/);
for (const key of ["fail", "skipped", "cancelled", "todo"])
  assert.match(regression, new RegExp(key + " 0"));
assert.deepEqual(object("public-exports-detail"), {
  InstancePropertiesModel: "undefined",
  InstancePropertiesError: "undefined",
  TreeModel: "function",
  SelectionModel: "function",
});
const initialScope = object("scope-and-source-protection"),
  scope = object("final-serial-scope-audit");
assert.equal(
  initialScope.productClean,
  false,
  "retain the intermediate status observation",
);
assert.equal(scope.productClean, true);
assert.equal(scope.productStatus, "");
assert.equal(scope.protectedOldFiles, 454);
assert.equal(scope.productInputs, 303);
assert.equal(scope.productHead, e.productCommit);
assert.equal(initialScope.productInputMapSHA256, scope.productInputMapSHA256);
assert.deepEqual(scope.ownCoreProcesses, []);
assert.equal(scope.designSHA256, e.designSHA256);
assert.equal(
  scope.approved69SHA256,
  "9a992b3f6bd62f61fd5e4612736f1891712d258df18e9444d9009ce94cc7b90b",
);
for (const pin of e.sourcePins) {
  const blob = execFileSync("git", ["show", pin.commit + ":" + pin.path], {
    cwd: root,
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(sha(blob), pin.sha256, pin.path);
  if (pin.current)
    assert.equal(
      sha(fs.readFileSync(path.join(root, pin.path))),
      pin.sha256,
      pin.path,
    );
}
assert.equal(e.sourcePins.length, 20);
console.log(
  JSON.stringify({
    captures: e.records.length,
    rawBytes,
    gzipBytes,
    fixedSourcePins: e.sourcePins.length,
    freezeCommit: e.freezeCommit,
    runtimeInputs: 252,
    coreModelInputs: 5,
    typeNegativeCases: 22,
    fixtureSDKCoreControls: 16,
    oldRegression: 810,
    modelSemanticsExecuted: 0,
    original454Protected: true,
    product303IdentityPreserved: true,
    initialFailuresPreserved: true,
    sha256: sha(bytes),
  }),
);
