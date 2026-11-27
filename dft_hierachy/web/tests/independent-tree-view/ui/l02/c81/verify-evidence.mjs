// Archive/source integrity only, never production semantics.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = path.resolve(import.meta.dirname, "../../../../../../");
const evidence = JSON.parse(
  fs.readFileSync(path.join(root, "docs/m5_b_c81_repair.json"), "utf8"),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const outputs = new Map();
for (const { name, expectedExit, capture } of evidence.commands) {
  assert.equal(capture.capture_complete, true, name);
  assert.equal(capture.exit_code, expectedExit, name);
  const bytes = gunzipSync(Buffer.from(capture.stdout_gzip_base64, "base64"));
  assert.equal(bytes.length, capture.stdout_bytes, name);
  assert.equal(sha(bytes), capture.stdout_sha256, name);
  assert.equal(outputs.has(name), false, "duplicate capture");
  outputs.set(name, bytes.toString("utf8"));
}
for (const pin of evidence.frozenTestPins) {
  const bytes = fs.readFileSync(path.join(root, pin.path));
  assert.equal(bytes.length, pin.bytes, pin.path);
  assert.equal(sha(bytes), pin.sha256, pin.path);
}
const pre = JSON.parse(outputs.get("pre-fix-react-host-full-observation"));
assert.equal(pre.results.filter((r) => r.pass).length, 4);
assert.equal(pre.results.filter((r) => !r.pass).length, 2);
for (const row of pre.results.filter((r) => !r.pass)) {
  assert.ok(row.id.endsWith("replace"));
  assert.equal(row.observation.witness.sameRoot, false);
  assert.equal(row.observation.witness.sameMount, false);
}
const post = JSON.parse(outputs.get("frozen-react-host-6"));
assert.equal(post.executedControls, 6);
assert.equal(
  post.results.every((r) => r.pass),
  true,
);
for (const result of [
  pre,
  post,
  JSON.parse(outputs.get("existing-browser-adapter-14")),
  JSON.parse(outputs.get("production-48-capability-red")),
]) {
  assert.deepEqual(result.cleanupErrors, []);
  assert.equal(result.browserDisconnected, true);
  assert.equal(result.serverStopped, true);
  assert.equal(result.portRebound, true);
}
const red = JSON.parse(outputs.get("production-48-capability-red"));
assert.equal(red.productionCapable, false);
assert.equal(red.plannedProductionCases, 48);
assert.equal(red.executedProductionCases, 0);
assert.equal(red.skippedCases, 0);
assert.equal(
  sha(Buffer.from(outputs.get("frozen-48-enumeration"))),
  "c7cc9e75d6a2302d4da51d59a3f64d1d79133c23beceed55f7b3ddb4389111a2",
);
const bytes = gunzipSync(
  Buffer.from(evidence.preFixFixture.gzip_base64, "base64"),
);
assert.equal(bytes.length, evidence.preFixFixture.bytes);
assert.equal(sha(bytes), evidence.preFixFixture.sha256);
console.log(
  JSON.stringify({
    archiveVerified: true,
    commands: evidence.commands.length,
    pins: evidence.frozenTestPins.length,
    productionSemanticsExecuted: 0,
  }),
);
