import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const archive = readFileSync(
  resolve(root, "docs/m5_b_c79_expansion_locator.json"),
);
const evidence = JSON.parse(archive);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const outputs = new Map();
let raw = 0,
  gzip = 0;
for (const r of evidence.captures) {
  const compressed = Buffer.from(r.stdout_gzip_base64, "base64"),
    bytes = gunzipSync(compressed);
  assert.equal(outputs.has(r.name), false);
  assert.equal(bytes.length, r.stdout_bytes, r.name);
  assert.equal(sha(bytes), r.stdout_sha256, r.name);
  assert.equal(r.capture_complete, true);
  assert.equal(r.exit_code, r.expected_exit_code, r.name);
  outputs.set(r.name, bytes.toString());
  raw += bytes.length;
  gzip += compressed.length;
}
assert.equal(outputs.size, evidence.capture_summary.captures);
assert.equal(raw, evidence.capture_summary.raw_bytes);
assert.equal(gzip, evidence.capture_summary.gzip_bytes);
const before = outputs.get("C79-before-original140-manifest"),
  after = outputs.get("C79-after-original140-manifest");
assert.equal(before, after);
assert.equal(sha(Buffer.from(before)), evidence.manifest.sha256);
assert.equal(JSON.parse(after).count, 140);
const legacy = outputs.get("C79-original-four-shape-locator-fragment-baseline");
assert.match(legacy, /# tests 4\n/);
assert.match(legacy, /# pass 1\n/);
assert.match(legacy, /# fail 3\n/);
const fixed = outputs.get("fixedC79-ten-and-C80-31-C78-25-regression66");
assert.match(fixed, /# tests 66\n/);
assert.match(fixed, /# pass 66\n/);
for (const shape of ["button", "span", "two-buttons", "row-region"])
  assert.ok(
    fixed.includes(" - C79 explicit expansion locator shape " + shape + "\n"),
  );
const resource = fixed
  .split("\n")
  .find((line) => line.startsWith('# {"ownBrowserDisconnected":'));
assert.deepEqual(JSON.parse(resource.slice(2)), {
  ownBrowserDisconnected: true,
  ownServerStopped: true,
  productionSemantics: 0,
});
const audit = JSON.parse(
  outputs.get("C79-fixed-input-code-boundary-native-resource-audit"),
);
assert.equal(audit.other139CaseCodeAndHelpersUnchanged, true);
for (const pin of audit.pins) {
  const bytes = execFileSync("git", ["show", `${pin.revision}:${pin.path}`], {
    cwd: root,
  });
  assert.equal(bytes.length, pin.bytes, pin.path);
  assert.equal(sha(bytes), pin.sha256, pin.path);
  if (!pin.historicalOnly)
    assert.ok(readFileSync(resolve(root, pin.path)).equals(bytes), pin.path);
}
const capability = JSON.parse(
  outputs.get("C79-missing-product-capability-red-before-adapter"),
);
assert.equal(capability.stage, "production-export-capability");
assert.equal(capability.executedCases, 0);
assert.equal(capability.skippedCases, 0);
assert.equal(capability.closedOwnBrowserServerAndCore, true);
console.log(
  JSON.stringify({
    archiveSha256: sha(archive),
    captures: outputs.size,
    rawBytes: raw,
    gzipBytes: gzip,
    sourcePins: audit.pins.length,
    unchangedManifestBytes: Buffer.byteLength(after),
    originalCaseCount: 140,
    regressionControls: 66,
    productionSemantics: 0,
    knownHistoryToolFailurePreserved: true,
  }),
);
