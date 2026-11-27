// Archive and frozen-input integrity only. This does NOT execute Electron or renderer semantics.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../../.."),
  archive = JSON.parse(
    fs.readFileSync(
      path.join(root, "docs/m5_b_electron_renderer_freeze.json"),
      "utf8",
    ),
  ),
  hash = (bytes) => createHash("sha256").update(bytes).digest("hex"),
  outputs = new Map();
assert.equal(archive.freezeSHA, "c99143c5baff94fbe1f41a5c3da77a0b70f475e9");
assert.equal(archive.baselineSHA, "782c599f710bd73a7e1be1cb38a4dca7786831bd");
for (const { name, expectedExit, capture } of archive.commands) {
  assert.equal(outputs.has(name), false, name);
  assert.equal(capture.capture_complete, true, name);
  assert.equal(capture.exit_code, expectedExit, name);
  const bytes = gunzipSync(Buffer.from(capture.stdout_gzip_base64, "base64"));
  assert.equal(bytes.length, capture.stdout_bytes, name);
  assert.equal(hash(bytes), capture.stdout_sha256, name);
  outputs.set(name, bytes.toString("utf8"));
}
assert.equal(archive.frozenInputPins.length, 10);
for (const pin of archive.frozenInputPins) {
  const bytes = fs.readFileSync(path.join(root, pin.path));
  assert.equal(bytes.length, pin.bytes, pin.path);
  assert.equal(hash(bytes), pin.sha256, pin.path);
}
const metadata = JSON.parse(outputs.get("final-runtime-input-enumeration"));
assert.equal(metadata.count, 99);
assert.equal(new Set(metadata.cases.map((x) => x.id)).size, 99);
assert.equal(
  metadata.cases.filter((x) => x.id.startsWith("ER-SDK-")).length,
  15,
);
assert.equal(
  metadata.cases.filter((x) => x.id.startsWith("ER-RAW-INVALID-")).length,
  5,
);
const current = execFileSync(
  process.execPath,
  [path.join(import.meta.dirname, "run.mjs"), "--list"],
  { cwd: root },
);
assert.equal(
  hash(current),
  hash(Buffer.from(outputs.get("final-runtime-input-enumeration"))),
);
assert.equal(
  JSON.parse(outputs.get("final-type-input-enumeration")).negatives.length,
  16,
);
const runtime = JSON.parse(outputs.get("baseline-public-runtime"));
assert.equal(runtime.stage, "public-export-capability");
assert.equal(runtime.planned, 99);
assert.equal(runtime.executed, 0);
assert.equal(runtime.skipped, 0);
assert.deepEqual(runtime.results, []);
assert.equal(runtime.exitCode, 1);
assert.match(runtime.error.message, /ERR_PACKAGE_PATH_NOT_EXPORTED/u);
const types = JSON.parse(outputs.get("baseline-public-types"));
assert.equal(types.exitCode, 1);
assert.equal(types.executedNegative, 0);
assert.deepEqual(types.results, []);
assert.ok(types.positive.some((x) => x.code === 2307));
const proposal = JSON.parse(
  outputs.get("final-approved-proposal-type-controls"),
);
assert.equal(proposal.kind, "approved-proposal-type-controls-NOT-production");
assert.deepEqual(proposal.positive, []);
assert.equal(proposal.executedNegative, 16);
assert.equal(proposal.results.length, 16);
for (const row of proposal.results) {
  assert.ok(row.diagnostics.length > 0, row.id);
  assert.ok(
    row.diagnostics.every((d) => d.code !== 2307),
    row.id,
  );
}
const browser = JSON.parse(outputs.get("baseline-public-browser-gate"));
assert.equal(browser.exitCode, 1);
assert.equal(browser.stage, "public-export-capability");
assert.equal(browser.executed, 0);
assert.match(browser.error, /ERR_PACKAGE_PATH_NOT_EXPORTED/u);
assert.match(outputs.get("final-facility-controls"), /pass 7\n/u);
assert.match(
  outputs.get("transport-sharing-compatibility-regression"),
  /pass 10\n/u,
);
assert.match(
  outputs.get("transport-sharing-compatibility-regression"),
  /skipped 0\n/u,
);
assert.deepEqual(JSON.parse(outputs.get("final-fixture-schema-kat")), {
  kind: "B fixture versus authoritative generated Schema only",
  positive: 2,
  negative: 2,
  rendererSemantics: 0,
});
const audit = JSON.parse(outputs.get("frozen-source-provenance-audit"));
assert.deepEqual(audit.frozenInputPins, archive.frozenInputPins);
assert.equal(audit.oldBOwnFilesUnchanged, 494);
assert.equal(audit.fixedProductFilesUnchanged, 730);
assert.equal(audit.mainNonLogTrackedFilesUnchanged, 729);
assert.equal(audit.productStatus, "");
console.log(
  JSON.stringify({
    archiveVerified: true,
    commands: outputs.size,
    pins: archive.frozenInputPins.length,
    planned: 99,
    productionRendererSemanticsExecuted: 0,
    productionTypesNegativeExecuted: 0,
    skipped: 0,
    proposalNegativeControls: 16,
  }),
);
