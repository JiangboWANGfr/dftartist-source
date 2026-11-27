// Evidence integrity/provenance only. Does not execute production UI.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, "../../../../..");
const artifact = path.join(root, "docs/m5_b_l02_raw_boundary.json");
const bytes = fs.readFileSync(artifact),
  e = JSON.parse(bytes);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const outputs = new Map();
let rawBytes = 0,
  gzipBytes = 0;
assert.equal(e.productCommit, "2ad2450d7135763a403b642468a682370c21f022");
assert.equal(e.finalInputCommit, "2665880b6eb621194e2b04f26a565bf7f59ad1cf");
for (const record of e.records) {
  assert.equal(record.capture_complete, true);
  assert.ok(record.command.length && record.cwd && record.utc);
  assert.equal(outputs.has(record.label), false);
  const gzip = Buffer.from(record.stdout_gzip_base64, "base64"),
    data = gunzipSync(gzip);
  assert.equal(data.length, record.stdout_bytes);
  assert.equal(sha(data), record.stdout_sha256);
  assert.equal(
    record.exit_code,
    record.label.startsWith("production-") ? 1 : 0,
  );
  rawBytes += data.length;
  gzipBytes += gzip.length;
  outputs.set(record.label, data.toString());
}
const object = (label) => {
  assert.ok(outputs.has(label), "missing " + label);
  return JSON.parse(outputs.get(label));
};
const initial = object("inventory-48"),
  manifest = object("inventory-canonical");
assert.equal(manifest.count, 48);
assert.equal(manifest.direct, 42);
assert.equal(manifest.late, 6);
assert.equal(new Set(manifest.cases.map((c) => c.id)).size, 48);
assert.deepEqual(
  initial.cases.map(({ covers, ...c }) => c),
  manifest.cases.map(({ covers, ...c }) => c),
  "metadata correction must not rewrite input/expected/basis/order",
);
for (const c of manifest.cases) {
  assert.ok(c.expected && c.basis && c.input);
  assert.ok(c.covers.every((id) => ["L02", "L03", "L04", "L05"].includes(id)));
}
for (const [label, count] of [
  ["adapter-initial", 20],
  ["adapter-canonical", 20],
  ["new20-original70-combined", 90],
]) {
  const output = outputs.get(label);
  assert.ok(output);
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
assert.match(outputs.get("standard-independent-810"), /tests 810/);
assert.match(outputs.get("standard-independent-810"), /pass 810/);
for (const key of ["fail", "skipped", "cancelled", "todo"])
  assert.match(outputs.get("standard-independent-810"), new RegExp(key + " 0"));
for (const label of [
  "browser-adapter-initial",
  "browser-adapter-final",
  "browser-controls-canonical",
]) {
  const r = object(label);
  assert.equal(r.kind, "L02-browser-adapter-controls-only");
  assert.equal(r.executedControls, 14);
  assert.equal(r.executedProductionCases, 0);
  assert.equal(r.skippedCases, 0);
  assert.equal(r.results.length, 14);
  assert.equal(r.productionCapable, false);
  assert.equal(r.exitCode, 0);
  for (const c of r.results) {
    assert.equal(c.pass, true);
    assert.deepEqual(c.observation, {
      rawIdentity: true,
      rawProbes: 0,
      realCommit: true,
      productionUI: false,
    });
  }
  assert.deepEqual(r.cleanupErrors, []);
  assert.equal(r.browserDisconnected, true);
  assert.equal(r.serverStopped, true);
  assert.equal(r.portRebound, true);
  assert.deepEqual(r.buildWarnings, []);
}
for (const label of [
  "production-initial",
  "production-final",
  "production-canonical",
]) {
  const r = object(label);
  assert.equal(r.exitCode, 1);
  assert.equal(r.stage, "production-export-capability");
  assert.equal(r.productionCapable, false);
  assert.equal(r.plannedProductionCases, 48);
  assert.equal(r.executedProductionCases, 0);
  assert.equal(r.executedControls, 0);
  assert.equal(r.skippedCases, 0);
  assert.deepEqual(r.results, []);
  assert.deepEqual(r.cleanupErrors, []);
  assert.equal(r.browserDisconnected, true);
  assert.equal(r.serverStopped, true);
  assert.equal(r.portRebound, true);
}
const old140 = Buffer.from(outputs.get("original-140-inventory"));
assert.equal(old140.length, 42609);
assert.equal(
  sha(old140),
  "6f2333cf262f6a74e1675780d708bc32bba598850491eb3ade7c1791a7fb832d",
);
assert.equal(object("inputs-canonical").originalBFilesUnchanged, 442);
assert.equal(object("original-coverage-95").executableCases, 140);
const history = object("original-c79-history");
assert.equal(history.historicalRunsNotRewritten, true);
assert.deepEqual(
  history.results.map((r) => r.explicitCurrentDifferences.length),
  [4, 2, 0],
);
for (const pin of e.sourcePins) {
  const git = execFileSync("git", ["show", pin.commit + ":" + pin.path], {
    cwd: root,
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(sha(git), pin.sha256, "fixed source " + pin.path);
  if (pin.current)
    assert.equal(
      sha(fs.readFileSync(path.join(root, pin.path))),
      pin.sha256,
      "current source " + pin.path,
    );
}
const identity = object("source-303-identity");
assert.equal(identity.head, e.productCommit);
assert.equal(identity.status, "");
assert.deepEqual(identity.current, identity.committed);
assert.equal(Object.keys(identity.current).length, 303);
for (const [file, expected] of Object.entries(identity.current)) {
  const blob = execFileSync("git", ["show", e.productCommit + ":" + file], {
    cwd: root,
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(sha(blob), expected, "fixed product source " + file);
}
assert.deepEqual(identity.binaries, e.binariesAtStart);
const scope = object("scope-prefix-and-resources");
assert.equal(scope.sharedLogPrefix.preserved, true);
assert.equal(scope.sourceClean, true);
assert.deepEqual(scope.ownCoreProcesses, []);
assert.equal(scope.sourceHead, e.productCommit);
assert.equal(scope.currentDesignSHA256, e.designSHA256);
assert.equal(
  scope.approved67SHA256,
  "6a2ec54ba597429c4b3b171cea4af826f337cbd8343bccd644d263ff82d2601c",
);
console.log(
  JSON.stringify({
    captures: e.records.length,
    rawBytes,
    gzipBytes,
    fixedSourcePins: e.sourcePins.length,
    originalBFilesUnchanged: 442,
    productInputs: 303,
    canonicalControls: {
      node: 20,
      browser: 14,
      combinedRegression: 90,
      standard: 810,
    },
    frozenProductionInputs: 48,
    productionSemanticsExecuted: 0,
    original140Unchanged: true,
    sourceAndRawArchiveVerified: true,
    sha256: sha(bytes),
  }),
);
