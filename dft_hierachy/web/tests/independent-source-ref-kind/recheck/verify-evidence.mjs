// Portable B27 evidence only; no process, compiler, product, or fixture JS runs.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = path.resolve(
  fileURLToPath(new URL("../../../../", import.meta.url)),
);
const raw = fs.readFileSync(
  root + "/docs/m5_b_source_ref_kind_runtime_recheck.json",
);
const a = JSON.parse(raw);
const restoration = "bcdcfd22348b6ffb37252669bc708402a5e73fe7";
// prettier-ignore
const pins = {
  fixed: "43530c006ca950d504e416e85f859cf0367d3945",
  freeze: "764445d4c91a0113fddaae5d7027eb8fd16946e3",
  baselineReport: "23123258c7a69bfd330ea4a0ea97ff8e2d2af80b",
  temporaryAdaptation: "ca6d3c83f92e94683d8372cd3fea49d6c379250a",
  restoration,
};
assert.ok(process.argv.slice(2).length <= 1);
assert.ok(process.argv.slice(2).every((arg) => arg === "--inputs"));
assert.equal(a.kind, "B27 independent SourceRefKind runtime recheck; C92 open");
for (const [key, value] of Object.entries(pins))
  assert.equal(a[key], value, key);
assert.equal(a.originalEntryAccepted, false);
assert.equal(a.status, "not-released");
assert.equal(a.finding, "C-92 open");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function unpack(b, label) {
  const bytes = gunzipSync(Buffer.from(b.gzipBase64, "base64"));
  assert.equal(bytes.length, b.bytes, label);
  assert.equal(sha(bytes), b.sha256, label);
  return bytes;
}
function green(r, count) {
  assert.deepEqual(
    [r.planned, r.executed, r.passed, r.failed],
    [count, count, count, 0],
  );
  for (const key of ["skipped", "blocked"])
    if (key in r) assert.equal(r[key], 0);
}
function inner(r) {
  for (const c of r.commands ?? r.captures ?? []) {
    for (const stream of ["stdout", "stderr"]) unpack(c[stream], stream);
  }
}
const blocks = new Map();
for (const [id, block] of Object.entries(a.blocks)) {
  assert.match(id, /^[0-9a-f]{64}$/);
  blocks.set(id, unpack({ ...block, sha256: id }, id));
}
const materials = new Map();
for (const m of a.materials) {
  assert.ok(m.label && !materials.has(m.label), "unique material label");
  assert.ok(blocks.has(m.sha256), m.label);
  assert.equal(blocks.get(m.sha256).length, m.bytes);
  materials.set(m.label, m);
}
function material(label) {
  assert.ok(materials.has(label), "missing material " + label);
  return JSON.parse(blocks.get(materials.get(label).sha256));
}
const names = new Map(),
  outputs = new Map();
const failures = new Set([
  "configure-debug",
  "configure-release",
  "configure-asan-ubsan",
  "native-restored-original-entry",
  "standard-core-production-off",
  "web-independent-complete",
]);
for (const c of a.captures) {
  assert.ok(c.name && !names.has(c.name), "unique capture name");
  assert.ok(c.capture_complete && c.command.length && c.cwd);
  assert.ok(Number.isFinite(Date.parse(c.utc)) && c.seconds >= 0);
  assert.equal(c.outputMode, "combined stdout+stderr");
  assert.equal(c.utcMeaning, "capture finished");
  assert.equal(c.exit_code, failures.has(c.name) ? 1 : 0, c.name);
  names.set(c.name, c);
  outputs.set(
    c.name,
    unpack(
      {
        bytes: c.stdout_bytes,
        sha256: c.stdout_sha256,
        gzipBase64: c.stdout_gzip_base64,
      },
      c.name,
    ).toString(),
  );
}
function output(name) {
  assert.ok(names.has(name), "missing capture " + name);
  return outputs.get(name);
}
const json = (name) => JSON.parse(output(name));
const h = material("helper/execution.json");
assert.equal(h.fixed, a.fixed);
assert.equal(h.freeze, a.freeze);
assert.equal(h.oldReport, a.baselineReport);
assert.equal(h.exitCode, 0);
assert.equal(h.preflight.facilityAdaptation, a.temporaryAdaptation);
assert.deepEqual(h.captures.map((c) => c.name).sort(), [
  "schema-production",
  "sdk23",
  "types-production",
]);
assert.equal(h.postflight.unchanged, true);
inner(h);
for (const c of h.captures) {
  assert.equal(c.status, 0);
  assert.equal(c.signal, null);
  assert.equal(c.error, null);
  assert.equal(c.timedOut, false);
  assert.deepEqual(JSON.parse(unpack(c.stdout, c.name)), c.report);
}
const types = h.captures.find((c) => c.name === "types-production").report;
green(types, 40);
assert.equal(types.proposalFacilityOnly, false);
assert.deepEqual(types.positive, []);
assert.equal(types.semantic.length, 40);
assert.ok(types.semantic.every((r) => r.passed));
const schema = h.captures.find((c) => c.name === "schema-production").report;
assert.equal(schema.proposalFacilityOnly, false);
assert.equal(schema.legacyRoot, h.legacyRoot);
assert.equal(schema.legacyNewDefinitionNotApplicable, 17);
assert.ok(schema.capability.every((r) => r.passed));
for (const [name, n] of [
  ["productionSchema", 208],
  ["productionGenerated", 208],
  ["legacyGeneratedCompatibility", 191],
]) {
  green(schema.lanes[name], n);
  assert.equal(schema.lanes[name].results.length, n);
  assert.ok(schema.lanes[name].results.every((r) => r.passed && r.unchanged));
}
const sdk = h.captures.find((c) => c.name === "sdk23").report;
green(sdk, 23);
assert.deepEqual(sdk.cleanupErrors, []);
assert.ok(sdk.results.length === 23 && sdk.results.every((r) => r.pass));
const first = material("helper/first-execution.json");
assert.equal(first.exitCode, 1);
assert.deepEqual(first.captures, []);
assert.equal(first.preflight, null);
assert.ok(first.facilityError, "first guard failed before all product gates");
const legacy = material("helper/legacy-comparison.json");
assert.equal(legacy.exitCode, 0);
assert.deepEqual(legacy.missing, []);
assert.equal(legacy.comparisons.length, 7);
assert.equal(legacy.sourceInputs.length, 10);
inner(legacy);
for (const r of legacy.comparisons) {
  assert.ok(r.internalIntegrity && r.byteEqual);
  assert.deepEqual(
    unpack(r.expected, r.relativePath),
    unpack(r.fixtureDecoded, r.relativePath),
  );
}
const variants = ["debug", "release", "asan-ubsan", "production-off"];
for (const [i, variant] of variants.entries()) {
  const core = json("core-sdk-" + variant + "24");
  green(core, 24);
  assert.deepEqual(core.cleanupErrors, []);
  assert.ok(core.results.length === 24 && core.results.every((r) => r.pass));
  const ctest = output("ctest-all-" + variant),
    total = [79, 79, 81, 76][i];
  assert.match(
    ctest,
    new RegExp("100% tests passed, 0 tests failed out of " + total + "\\b"),
  );
  assert.doesNotMatch(ctest, /\*\*\*Not Run|The following tests did not run/);
  if (i < 3) {
    assert.match(output("configure-" + variant), /CMP0002/);
    assert.match(output("configure-" + variant), /b_ref_kind_api/);
    output("configure-" + variant + "-target-adapted");
  }
}
const native = json("native-original-three-config");
assert.equal(native.exitCode, 0);
assert.deepEqual(native.cleanupErrors, []);
assert.ok(!native.facilityError);
assert.deepEqual(native.configurations.map((c) => c.name).sort(), [
  "ASan-UBSan",
  "Debug",
  "Release",
]);
inner(native);
for (const c of native.configurations) {
  green(c.legacy, 2);
  green(c.serialization, 7);
  green(c.schema, 208);
  green(c.coreApi, 24);
  assert.ok(c.coreApi.freshCoreBuilt);
  assert.ok(
    c.schema.results.length === 208 && c.schema.results.every((r) => r.pass),
  );
}
// Historical capture name notwithstanding, the preceding graph was temporarily
// renamed. Only this restored entry is evidence about the original B wrapper.
const restored = json("native-restored-original-entry");
assert.equal(restored.exitCode, 1);
assert.match(restored.facilityError, /CMP0002/);
assert.deepEqual(restored.cleanupErrors, []);
assert.equal(restored.configurations.length, 1);
inner(restored);
const beforeFailure = restored.configurations[0];
green(beforeFailure.legacy, 2);
green(beforeFailure.serialization, 7);
green(beforeFailure.schema, 208);
assert.equal(beforeFailure.coreApi.executed, 0);
assert.equal(beforeFailure.coreApi.passed, 0);
assert.equal(beforeFailure.coreApi.freshCoreBuilt, false);
for (const name of ["standard-core-production-off", "web-independent-complete"])
  assert.match(output(name), /explicit owned fixed-product binary/);
output("standard-core-production-off-canonical");
output("web-independent-complete-canonical");
output("standard-native-production-off");
let checkedInputs = 0;
if (process.argv.includes("--inputs")) {
  for (const m of a.materials.filter((m) => m.repoPath !== undefined)) {
    assert.ok(!path.isAbsolute(m.repoPath));
    const file = fs.realpathSync(path.join(root, m.repoPath));
    const rel = path.relative(fs.realpathSync(root), file);
    assert.ok(rel && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel));
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.length, m.bytes, m.repoPath);
    assert.equal(sha(bytes), m.sha256, m.repoPath);
    checkedInputs++;
  }
}
// prettier-ignore
console.log(JSON.stringify({ verified: true, notProductExecution: true, ...pins,
  originalEntryAccepted: false, status: "not-released", finding: "C-92 open",
  firstAliasInvocationRejected: true, aliasFailureIsProductFinding: false,
  captures: names.size, materials: materials.size, blocks: blocks.size,
  bytes: raw.length, sha256: sha(raw), checkedInputs,
  helper: { types: 40, schemaPerLane: 208, oldCompatibility: 191, sdk: 23 },
  temporaryProbePerConfiguration: { serialization: 7, schema: 208, coreApi: 24 },
  coreSdkPerConfiguration: 24, ctest: [79, 79, 81, 76],
  restoredOriginalCoreApiExecuted: 0,
}, null, 2));
