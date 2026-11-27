// Independent archive/source verification only; does not execute product semantics.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "../../.."),
  archive = path.join(root, "docs/m5_b_instance_properties_retest.json"),
  bytes = fs.readFileSync(archive),
  e = JSON.parse(bytes),
  sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(e.productCommit, "9a415f63d7b182662a6de9f9b81e717838c252b5");
assert.equal(
  e.constructorCorrectionCommit,
  "235d19dd94d20b1e8049d17ced14824ae1ad1e33",
);
assert.equal(e.freezeCommit, "c2c0facbd03449e3ed16dc3015ccb6a01edeab14");
const failures = new Set([
  "old-SDK-C01-order-counterexample",
  "candidate-Core-configure",
  "candidate-original-frozen-252",
  "candidate-original-standard-independent",
  "revised-freeze-old-product-capability",
  "approved-expanded-old-product-capability",
]);
const outputs = new Map();
let rawBytes = 0,
  gzipBytes = 0;
for (const r of e.records) {
  assert.equal(outputs.has(r.label), false, r.label);
  assert.equal(r.capture_complete, true);
  assert.equal(r.exit_code, failures.has(r.label) ? 1 : 0, r.label);
  const gzip = Buffer.from(r.stdout_gzip_base64, "base64"),
    raw = gunzipSync(gzip);
  assert.equal(raw.length, r.stdout_bytes, r.label);
  assert.equal(sha(raw), r.stdout_sha256, r.label);
  outputs.set(r.label, raw.toString());
  rawBytes += raw.length;
  gzipBytes += gzip.length;
}
assert.equal(outputs.size, 33);
for (const f of failures) assert.ok(outputs.has(f), f);
const object = (label) => JSON.parse(outputs.get(label));

// npm output surrounds several pretty-printed JSON objects; strings may contain braces.
function objects(text) {
  const result = [];
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== "{" || (start && text[start - 1] !== "\n")) continue;
    let depth = 0,
      quoted = false,
      escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') quoted = false;
      } else if (ch === '"') quoted = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        result.push(JSON.parse(text.slice(start, i + 1)));
        start = i;
        break;
      }
    }
  }
  return result;
}
function model(r, count, failed = []) {
  assert.equal(r.plannedCases, count);
  assert.equal(r.executedCases, count);
  assert.equal(r.skippedCases, 0);
  assert.equal(r.results.length, count, "no cleanup failures hidden");
  assert.equal(new Set(r.results.map((c) => c.id)).size, count);
  assert.deepEqual(
    r.results.filter((c) => !c.pass).map((c) => c.id),
    failed,
  );
  assert.equal(r.exitCode, failed.length ? 1 : 0);
}
function types(r) {
  assert.ok(r);
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.positiveDiagnostics, []);
  assert.equal(r.negativeCasesExecuted, 22);
  assert.ok(r.negativeDiagnostics.length >= 22);
  assert.equal(r.platformTypeDependencies, 0);
}
function summary(text, count) {
  for (const [key, value] of [
    ["tests", count],
    ["pass", count],
    ["fail", 0],
    ["cancelled", 0],
    ["skipped", 0],
    ["todo", 0],
  ])
    assert.match(
      text,
      new RegExp("^(?:[ℹ#]\\s*)?" + key + " " + value + "$", "m"),
    );
}
const originalArchive = fs.readFileSync(
  path.join(root, "docs/m5_b_instance_properties_freeze.json"),
);
assert.equal(
  sha(originalArchive),
  "6b2e3ab84e71e3695ca3cfce3b222cbef2f7c017417fc70cc6a0cdd322cf0546",
);
const originalRecords = JSON.parse(originalArchive).records;
const previousOutput = (label) =>
  gunzipSync(
    Buffer.from(
      originalRecords.find((r) => r.label === label).stdout_gzip_base64,
      "base64",
    ),
  ).toString();
assert.equal(
  outputs.get("runtime-inventory-retest"),
  previousOutput("inventory"),
);
assert.equal(
  outputs.get("core-model-inventory-retest"),
  previousOutput("core-inventory"),
);
const inventory = object("approved-expanded-281-inventory");
assert.equal(inventory.count, 281);
assert.equal(new Set(inventory.cases.map((c) => c.id)).size, 281);
assert.deepEqual(
  inventory.cases.filter((c) => !c.id.startsWith("IP-S-")),
  JSON.parse(previousOutput("inventory")).cases,
);
assert.equal(
  inventory.cases.filter((c) => c.id.startsWith("IP-S-active-invalid-")).length,
  12,
);
assert.equal(
  inventory.cases.filter((c) => c.id.startsWith("IP-S-disposed-")).length,
  16,
);
assert.equal(
  inventory.cases.filter((c) => c.group === "subscribe-disposal").length,
  29,
);
for (const c of inventory.cases) assert.ok(c.input && c.expected && c.basis);
assert.equal(object("approved-expanded-input-check").runtimeInputs, 281);
assert.equal(
  object("approved-expanded-input-check").groups["subscribe-disposal"],
  29,
);

model(object("candidate-original-frozen-252"), 252, ["IP-C01"]);
model(object("candidate-revised-frozen-252"), 252);
model(object("approved-expanded-281-model"), 281);
model(object("candidate-real-Core-model-5"), 5);
model(object("approved-expanded-real-Core5"), 5);
types(object("candidate-production-types-22"));
types(object("approved-expanded-production-types22"));
summary(outputs.get("candidate-fixture-SDK-Core-controls-16"), 16);
summary(outputs.get("candidate-Tree-standard-287-types49"), 287);
const treeObjects = objects(outputs.get("candidate-Tree-standard-287-types49")),
  treeTypes = treeObjects.find((r) => r.rejectedNegativeCases === 35),
  readTypes = treeObjects.find((r) => r.negativeChecks === 14);
assert.equal(treeTypes.positiveDiagnostics, 0);
assert.equal(treeTypes.assertions.length, 35);
assert.ok(treeTypes.assertions.every((r) => r.diagnostics.length));
assert.equal(readTypes.positiveDiagnostics, 0);
assert.equal(readTypes.passed.length, 14);
assert.ok(readTypes.passed.every((r) => r.codes.length));

for (const [label, count] of [
  ["candidate-overlay-standard-independent-1067", 252],
  ["candidate-expanded-standard-independent-1096", 281],
]) {
  const text = outputs.get(label),
    parsed = objects(text);
  summary(text, 810);
  model(
    parsed.find((r) => r.stage === "production-model-semantics"),
    count,
  );
  model(
    parsed.find((r) => r.stage === "real-Core-model-semantics"),
    5,
  );
  types(parsed.find((r) => r.negativeCasesExecuted === 22));
}
const oldStandard = outputs.get("candidate-original-standard-independent"),
  oldObjects = objects(oldStandard);
summary(oldStandard, 810);
model(
  oldObjects.find((r) => r.stage === "production-model-semantics"),
  252,
  ["IP-C01"],
);
assert.equal(
  oldObjects.some((r) => r.stage === "real-Core-model-semantics"),
  false,
);
for (const [label, count] of [
  ["revised-freeze-old-product-capability", 252],
  ["approved-expanded-old-product-capability", 281],
]) {
  const r = object(label);
  assert.equal(r.plannedCases, count);
  assert.equal(r.executedCases, 0);
  assert.equal(r.skippedCases, 0);
  assert.equal(r.exitCode, 1);
  assert.equal(r.stage, "production-export-capability");
}
assert.match(
  outputs.get("old-SDK-C01-order-counterexample"),
  /"modelExport":"undefined","models":0/,
);
assert.match(
  outputs.get("candidate-Core-configure"),
  /unable to find a build program/,
);
const native = outputs.get("candidate-Core-build-hier");
assert.match(native, /Built target hier/);
assert.equal(
  native.split("\n").filter((line) => /warning:/i.test(line)).length,
  0,
);
const scope = object("final-serial-source-binary-lifetime-audit");
assert.equal(scope.candidateCommit, e.productCommit);
assert.equal(scope.freezeCommit, e.freezeCommit);
assert.equal(scope.candidateTrackedInputs, 696);
assert.equal(scope.originalBFilesProtected, 454);
assert.equal(scope.previousBFiles, 474);
assert.equal(scope.previousBChangedOnly.length, 5);
assert.equal(scope.overlayPaths.length, 4);
assert.equal(scope.overlayOnly, true);
assert.equal(scope.productionInputsPreserved, true);
assert.equal(scope.oldProductStillClean, true);
assert.equal(scope.initialLogPrefixPreserved, true);
assert.deepEqual(scope.ownCoreProcesses, []);
assert.equal(scope.binary.bytes, 9326376);
assert.equal(
  scope.binary.sha256,
  "2baa307d6b43a55c99c2ee40537c449da188b06593e857981129d6302e8a2eb2",
);
assert.equal(scope.config.CMAKE_BUILD_TYPE, "RelWithDebInfo");
assert.equal(scope.config.HIER_TEST_OBSERVER, "OFF");
assert.equal(scope.config.HIER_TEST_M3, "ON");
assert.equal(scope.config.HIER_TEST_FUTURE, "ON");
assert.equal(scope.compiledFiles, 54);
assert.equal(e.sourcePins.length, 28);
for (const pin of e.sourcePins) {
  const data = execFileSync("git", ["show", pin.commit + ":" + pin.path], {
    cwd: root,
    maxBuffer: 20 * 1024 * 1024,
  });
  assert.equal(sha(data), pin.sha256, pin.path);
  if (pin.current)
    assert.equal(
      sha(fs.readFileSync(path.join(root, pin.path))),
      pin.sha256,
      pin.path,
    );
}
console.log(
  JSON.stringify({
    captures: e.records.length,
    rawBytes,
    gzipBytes,
    sourcePins: e.sourcePins.length,
    freezeCommit: e.freezeCommit,
    model: 281,
    newSubscribe: 29,
    core: 5,
    typeNegative: 22,
    controls: 16,
    tree: 287,
    treeTypeNegative: 49,
    standard: 1096,
    historicalFailuresRetained: true,
    original252MetadataPreserved: true,
    original454Protected: true,
    sha256: sha(bytes),
  }),
);
