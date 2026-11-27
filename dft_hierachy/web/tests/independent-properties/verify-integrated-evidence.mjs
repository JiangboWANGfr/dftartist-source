// Archive verification only; no product execution and no replacement oracle.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, "../../.."),
  bytes = fs.readFileSync(
    path.join(root, "docs/m5_b_properties_integrated_retest.json"),
  ),
  e = JSON.parse(bytes),
  sha = (b) => createHash("sha256").update(b).digest("hex"),
  outputs = new Map();
assert.equal(e.productCommit, "462304d0f5ecbaa6547af661b436c8a0296f1854");
assert.equal(e.testFreeze, "c2c0facbd03449e3ed16dc3015ccb6a01edeab14");
let rawBytes = 0,
  gzipBytes = 0;
for (const r of e.records) {
  assert.equal(outputs.has(r.label), false);
  assert.equal(r.capture_complete, true);
  assert.equal(r.exit_code, 0, r.label);
  const gzip = Buffer.from(r.stdout_gzip_base64, "base64"),
    raw = gunzipSync(gzip);
  assert.equal(raw.length, r.stdout_bytes);
  assert.equal(sha(raw), r.stdout_sha256);
  outputs.set(r.label, raw.toString());
  rawBytes += raw.length;
  gzipBytes += gzip.length;
}
assert.equal(outputs.size, 16);
function objects(text) {
  const out = [];
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
        out.push(JSON.parse(text.slice(start, i + 1)));
        start = i;
        break;
      }
    }
  }
  return out;
}
function summary(text, n) {
  for (const [key, value] of [
    ["tests", n],
    ["pass", n],
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
function model(r, n) {
  assert.equal(r.plannedCases, n);
  assert.equal(r.executedCases, n);
  assert.equal(r.skippedCases, 0);
  assert.equal(r.exitCode, 0);
  assert.equal(r.results.length, n);
  assert.equal(new Set(r.results.map((c) => c.id)).size, n);
  assert.ok(r.results.every((c) => c.pass === true));
}
function types(r) {
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.positiveDiagnostics, []);
  assert.equal(r.negativeCasesExecuted, 22);
  assert.ok(r.negativeDiagnostics.length >= 22);
  assert.equal(r.platformTypeDependencies, 0);
}
const object = (name) => JSON.parse(outputs.get(name)),
  standard = outputs.get("fixed-original-standard-independent-1096"),
  standardObjects = objects(standard);
summary(standard, 810);
model(
  standardObjects.find((r) => r.stage === "production-model-semantics"),
  281,
);
model(
  standardObjects.find((r) => r.stage === "real-Core-model-semantics"),
  5,
);
types(standardObjects.find((r) => r.negativeCasesExecuted === 22));
const properties = objects(
  outputs.get("fixed-properties-standard-281-types22"),
);
model(
  properties.find((r) => r.stage === "production-model-semantics"),
  281,
);
types(properties.find((r) => r.negativeCasesExecuted === 22));
model(
  objects(outputs.get("fixed-properties-Core-standard-5")).find(
    (r) => r.stage === "real-Core-model-semantics",
  ),
  5,
);
summary(outputs.get("fixed-SDK-Core-controls-16"), 16);
const treeText = outputs.get("fixed-Tree-standard-287-types49"),
  tree = objects(treeText);
summary(treeText, 287);
assert.equal(
  tree.find((r) => r.rejectedNegativeCases === 35).positiveDiagnostics,
  0,
);
assert.equal(tree.find((r) => r.negativeChecks === 14).positiveDiagnostics, 0);
assert.equal(tree.find((r) => r.negativeChecks === 14).passed.length, 14);
const schema = objects(outputs.get("fixed-Schema-655-parameters27")).find(
  (r) => r.checks === 655,
);
assert.equal(schema.passed, 655);
assert.equal(schema.failed, 0);
assert.equal(schema.skipped, 0);
assert.deepEqual(schema.failures, []);
assert.equal(schema.parameterNormalization.checks, 27);
assert.deepEqual(schema.parameterNormalization.failed, []);
assert.deepEqual(schema.missingClientMethods, []);
const historyBytes = fs.readFileSync(
  path.join(root, "docs/m5_b_instance_properties_retest.json"),
);
assert.equal(
  sha(historyBytes),
  "33eff6fd38a754803cf8ebc8b0f3f28426a2970d882050fe674e2ecbad2a38a8",
);
const history = JSON.parse(historyBytes),
  oldOutput = (label) =>
    gunzipSync(
      Buffer.from(
        history.records.find((r) => r.label === label).stdout_gzip_base64,
        "base64",
      ),
    ).toString();
assert.equal(
  outputs.get("fixed-runtime-inventory"),
  oldOutput("approved-expanded-281-inventory"),
);
assert.equal(
  outputs.get("fixed-Core-inventory"),
  oldOutput("core-model-inventory-retest"),
);
assert.equal(object("fixed-input-inventory-validation").runtimeInputs, 281);
assert.equal(object("fixed-input-inventory-validation").realCoreModelInputs, 5);
const identity = object("fixed-import-source-contract-identity");
assert.equal(identity.head, e.productCommit);
assert.equal(identity.status, "");
assert.equal(identity.imports.length, 3);
assert.ok(identity.imports.every((r) => r.modeBlobPathDeltaSame));
assert.equal(identity.bFiles.length, 11);
assert.equal(Object.keys(identity.unchangedProductionAndWiring).length, 8);
assert.equal(identity.designStatusOnlyChanges, 5);
assert.equal(identity.designSHA256, e.designSHA256);
const scope = object("fixed-final-serial-source-lifetime-audit");
assert.equal(scope.productCommit, e.productCommit);
assert.equal(scope.testFreeze, e.testFreeze);
assert.equal(scope.candidate.files, 703);
assert.equal(scope.bBase.files, 480);
assert.equal(scope.oldB.files, 454);
assert.equal(scope.candidateStatus, "");
assert.equal(scope.overlayFiles, 0);
assert.equal(scope.productionChanges, 0);
assert.equal(scope.oldArchivesPreserved, true);
assert.equal(scope.initialLogPrefix.preserved, true);
assert.deepEqual(scope.ownCoreProcesses, []);
assert.equal(scope.binary.bytes, 9326152);
assert.equal(
  scope.binary.sha256,
  "ac58e88d5031ab22a36bde4e1dba344ee90c1a21146462a4b1ec8b5b1792ce38",
);
assert.equal(scope.config.CMAKE_BUILD_TYPE, "RelWithDebInfo");
assert.equal(scope.config.HIER_TEST_OBSERVER, "OFF");
assert.equal(scope.config.HIER_TEST_M3, "ON");
assert.equal(scope.config.HIER_TEST_FUTURE, "ON");
assert.match(outputs.get("fixed-TS-force-build"), /tsc -b --force/);
assert.match(outputs.get("fixed-Core-build-hier"), /Built target hier/);
assert.equal(
  outputs
    .get("fixed-Core-build-hier")
    .split("\n")
    .filter((s) => /warning:/i.test(s)).length,
  0,
);
assert.equal(e.sourcePins.length, 25);
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
    productCommit: e.productCommit,
    testFreeze: e.testFreeze,
    captures: e.records.length,
    rawBytes,
    gzipBytes,
    sourcePins: e.sourcePins.length,
    standard: 1096,
    properties: 281,
    core: 5,
    typeNegative: 22,
    controls: 16,
    tree: 287,
    treeTypeNegative: 49,
    schema: 655,
    parameterNormalization: 27,
    overlayFiles: 0,
    candidateClean: true,
    original480Preserved: true,
    oldFailuresPreserved: true,
    sha256: sha(bytes),
  }),
);
