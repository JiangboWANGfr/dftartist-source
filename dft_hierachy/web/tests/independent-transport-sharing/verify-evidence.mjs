import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");
const archive = resolve(root, "docs/m5_b_shared_transport_verification.json");
const bytes = readFileSync(archive);
const evidence = JSON.parse(bytes);
const sha = (data) => createHash("sha256").update(data).digest("hex");
const outputs = new Map();
let rawBytes = 0;
let gzipBytes = 0;
for (const capture of evidence.captures) {
  assert.equal(capture.capture_complete, true, capture.name);
  assert.equal(outputs.has(capture.name), false, `duplicate ${capture.name}`);
  const compressed = Buffer.from(capture.stdout_gzip_base64, "base64");
  const output = gunzipSync(compressed);
  assert.equal(output.length, capture.stdout_bytes, capture.name);
  assert.equal(sha(output), capture.stdout_sha256, capture.name);
  assert.equal(
    capture.exit_code,
    Object.hasOwn(evidence.known_nonzero_records, capture.name) ? 1 : 0,
    capture.name,
  );
  outputs.set(capture.name, output);
  rawBytes += output.length;
  gzipBytes += compressed.length;
}
assert.equal(outputs.size, evidence.statistics.captures);
assert.equal(rawBytes, evidence.statistics.stdout_bytes);
assert.equal(gzipBytes, evidence.statistics.gzip_bytes);
const manifest = JSON.parse(outputs.get("fixed-source-and-freeze-pins"));
for (const pin of manifest.pins) {
  // Git versions, not today's runner or another agent's build product.
  const repository =
    pin.revision === evidence.final_test_freeze
      ? root
      : process.env.HIER_B_PRODUCT_ROOT || evidence.owned_runtime;
  const content = execFileSync("git", ["show", `${pin.revision}:${pin.path}`], {
    cwd: repository,
  });
  assert.equal(content.length, pin.bytes, pin.path);
  assert.equal(sha(content), pin.sha256, pin.path);
}
console.log(
  JSON.stringify({
    archiveSha256: sha(bytes),
    captures: outputs.size,
    rawBytes,
    gzipBytes,
    gitSourcePins: manifest.pins.length,
    nonzeroRecordsPreserved: evidence.statistics.nonzero,
    currentMutableFilesNotClaimed: true,
  }),
);
