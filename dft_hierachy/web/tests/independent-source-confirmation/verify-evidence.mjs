// B metadata-only archive verifier. Imports inventories, never test run/boot.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { cases } from "./cases.mjs";
import "./boundaries.mjs";
import { questions } from "./questions.mjs";
import { negatives } from "./types.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const at = process.argv.indexOf("--archive"),
  file =
    at >= 0
      ? process.argv[at + 1]
      : path.join(root, "docs/m5_b_source_confirmation_freeze.json"),
  raw = fs.readFileSync(file),
  a = JSON.parse(raw);
const sha = (b) => createHash("sha256").update(b).digest("hex");
function unpack(x, key = "gzip_base64", bytes = "bytes", hash = "sha256") {
  assert.equal(typeof x[key], "string");
  const b = gunzipSync(Buffer.from(x[key], "base64"));
  assert.equal(b.length, x[bytes]);
  assert.equal(sha(b), x[hash]);
  return b;
}
assert.equal(a.format, "B30-source-confirmation-freeze-v1");
assert.equal(a.product, "ecbe0380045491db031ad20bf84735bbbfe8496d");
assert.equal(a.freeze, "0a83e08b8339b2d594597ebd161d5428212f3129");
assert.equal(a.base, "c8792cec85bb54c9ea3399151d0b64e0f5c4563a");
assert.equal(a.status, "frozen-awaiting-production-implementation");
assert.equal(a.productionPassed, false);
assert.equal(a.m5Complete, false);
assert.equal(a.coreOrElectronE2E, false);
assert.equal(a.notFullGate, true);
assert.equal(a.cReviewOwner, "C");
assert.equal(a.cContractDecision, "not asserted by B");
assert.equal(a.captures.length, 43);
assert.equal(new Set(a.captures.map((c) => c.name)).size, a.captures.length);
const outputs = new Map();
for (const c of a.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(c.command.length && c.cwd && c.utc);
  assert.ok(c.seconds >= 0);
  outputs.set(
    c.name,
    unpack(c, "stdout_gzip_base64", "stdout_bytes", "stdout_sha256"),
  );
}
const capture = (n) => {
  const c = a.captures.find((c) => c.name === n);
  assert.ok(c, n);
  return c;
};
const out = (n) => {
  assert.ok(outputs.has(n), n);
  return JSON.parse(outputs.get(n));
};
assert.equal(a.materials.length, 81);
assert.equal(new Set(a.materials.map((m) => m.label)).size, 81);
const materials = new Map(a.materials.map((m) => [m.label, unpack(m)]));
const material = (n) => {
  assert.ok(materials.has(n), n);
  return materials.get(n);
};
assert.equal(sha(material("product/docs/DESIGN.md")), a.oracle.designSha256);
assert.equal(
  a.oracle.designSha256,
  "1e2345280834df49b3aeb63b9e0541b01ab20b4bff6c7ebf7ae3771f93d82e61",
);
assert.equal(a.inputs.length, 11);
assert.equal(new Set(a.inputs.map((m) => m.file)).size, 11);
for (const i of a.inputs) {
  const b = unpack(i);
  assert.deepEqual(b, material("B-input/" + i.file));
  if (process.argv.includes("--inputs"))
    assert.deepEqual(fs.readFileSync(path.join(root, i.file)), b);
}
assert.deepEqual(
  a.inventory.cases,
  cases.map(({ run, ...v }) => v),
);
assert.equal(a.inventory.count, 121);
assert.equal(cases.length, 121);
assert.deepEqual(a.inventory.questions, questions);
assert.equal(questions.length, 6);
assert.equal(a.summary.questions, 6);
assert.equal(negatives.length, 37);
const runtime = out("freeze-runtime-baseline");
assert.deepEqual(a.summary.runtime, runtime);
assert.equal(capture("freeze-runtime-baseline").exit_code, 1);
assert.equal(runtime.stage, "public-capability");
for (const [k, v] of Object.entries({
  planned: 121,
  executed: 0,
  passed: 0,
  failed: 0,
  blocked: 121,
  skipped: 0,
  exitCode: 1,
}))
  assert.equal(runtime[k], v, k);
assert.deepEqual(runtime.results, []);
assert.match(
  runtime.error.message,
  /missing production SourceNavigationModel\.createCandidateAction/,
);
const types = out("freeze-types-baseline");
assert.deepEqual(a.summary.types, types);
assert.equal(capture("freeze-types-baseline").exit_code, 1);
assert.ok(types.positive.some((d) => d.code === 2724 || d.code === 2339));
assert.equal(types.executedNegative, 0);
assert.equal(types.blockedNegative, 37);
assert.equal(types.stage, "positive");
assert.deepEqual(types.results, []);
const prop = out("freeze-types-proposal");
assert.deepEqual(a.summary.proposalTypes, prop);
assert.equal(capture("freeze-types-proposal").exit_code, 0);
assert.deepEqual(prop.positive, []);
assert.equal(prop.executedNegative, 37);
assert.equal(prop.blockedNegative, 0);
assert.equal(prop.skipped, 0);
assert.deepEqual(
  prop.results.map((r) => r.id),
  negatives.map((n) => n[0]),
);
for (const r of prop.results)
  assert.ok(
    r.diagnostics.some((d) => d.code !== 2307),
    "not missing module: " + r.id,
  );
for (const [n, count] of Object.entries({
  "regression-independent-source-document": 306,
  "regression-independent-source-candidates": 281,
  "regression-independent-source-navigation": 284,
  "regression-ref-kind-sdk": 23,
  "regression-source-view-base": 89,
  "regression-source-position-tools-pinned": 119,
})) {
  const r = out(n);
  assert.deepEqual(a.summary.regressions[n], r);
  assert.equal(capture(n).exit_code, 0);
  for (const k of ["planned", "executed", "passed"])
    assert.equal(r[k], count, n + "/" + k);
  assert.equal(r.failed, 0);
  assert.equal(r.skipped, 0);
  assert.equal(r.results.length, count);
  assert.ok(r.results.every((x) => x.pass));
}
for (const [name, count] of [
  ["regression-selection", 159],
  ["freeze-facility", 6],
]) {
  const s = outputs.get(name).toString();
  assert.equal(capture(name).exit_code, 0);
  assert.match(s, new RegExp("tests " + count + "\\b"));
  assert.match(s, new RegExp("pass " + count + "\\b"));
  assert.match(s, /fail 0\b/);
  assert.match(s, /skipped 0\b/);
  assert.match(s, /cancelled 0\b/);
}
assert.equal(a.summary.selectionTests, 159);
assert.equal(a.summary.facilityTests, 6);
for (const name of [
  "npm-ci",
  "web-check",
  "freeze-format-check",
  "freeze-staged-check",
  "freeze-commit",
  "runtime-environment",
  "post-freeze-protect",
])
  assert.equal(capture(name).exit_code, 0);
assert.equal(capture("proposal-type-facility").exit_code, 1);
assert.match(
  outputs.get("proposal-type-facility").toString(),
  /Cannot find module/,
);
for (const n of [
  "proposal-types-fixed-facility",
  "proposal-debug-diagnostics",
]) {
  assert.equal(capture(n).exit_code, 1);
  assert.match(outputs.get(n).toString(), /no-public-brand/);
}
assert.equal(capture("regression-source-position").exit_code, 1);
assert.match(
  outputs.get("regression-source-position").toString(),
  /explicit fixed product\/tools/,
);
assert.ok(
  material("evidence/proposal-v1.d.ts").includes(
    Buffer.from("declare const sourceCandidateActionBrand"),
  ),
);
assert.ok(material("evidence/verify-types-v1.mjs").length);
assert.ok(
  material("evidence/boundaries-before-ambiguity-review.mjs").includes(
    Buffer.from("sdk-call-stack-sync-"),
  ),
);
const protect = out("post-freeze-protect");
assert.deepEqual(a.protection, protect);
assert.equal(protect.protected, true);
assert.deepEqual(protect.counts, [1162, 777, 1144]);
assert.equal(protect.declarations, 48);
assert.equal(protect.BHead, a.freeze);
assert.equal(protect.BStatus, "");
assert.equal(protect.binaries.length, 3);
const initial = JSON.parse(material("evidence/initial.json"));
assert.deepEqual(initial.log, protect.logPrefix);
assert.equal(
  a.materials.filter((x) => x.label.startsWith("declaration/")).length,
  48,
);
const helperRaw = material("helper/audit.json");
assert.equal(
  sha(helperRaw),
  "a95dce632624fd9e2d0d02ae5b39d7f06eb03038e817beea6aba07d1ccfb722e",
);
const helper = JSON.parse(helperRaw);
assert.equal(helper.fixed, a.product);
assert.equal(helper.exitCode, 0);
assert.deepEqual(helper.violations, []);
assert.equal(helper.commands.length, 18);
assert.equal(helper.imports.length, 2);
for (const c of helper.commands) {
  assert.equal(c.status, 0);
  for (const k of ["stdout", "stderr"]) unpack(c[k], "gzipBase64");
}
for (const i of helper.imports)
  assert.equal(
    i.patchEquivalentByIdenticalPathsModesTypesAndBeforeAfterBlobObjects,
    true,
  );
assert.equal(helper.finalSeven.length, 14);
assert.equal(new Set(helper.finalSeven.map((r) => r.file)).size, 7);
for (const location of ["B", "main"])
  assert.equal(
    helper.finalSeven.filter((r) => r.location === location).length,
    7,
  );
for (const r of helper.finalSeven) {
  assert.equal(r.gitBlob, r.expectedGitBlob);
  assert.equal(r.actualGitMode, r.expectedGitMode);
}
assert.ok(a.limits.length >= 8);
console.log(
  JSON.stringify({
    archiveVerified: true,
    productExecuted: 0,
    archiveBytes: raw.length,
    archiveSha256: sha(raw),
    captures: 43,
    materials: 81,
    frozenInputs: 11,
    behaviorPlanned: 121,
    behaviorExecuted: 0,
    behaviorBlocked: 121,
    typeProductionExecuted: 0,
    typeFacilityPassed: 37,
    facilityOnlyPassed: 6,
    questionsNotTests: 6,
    notM5Release: true,
  }),
);
