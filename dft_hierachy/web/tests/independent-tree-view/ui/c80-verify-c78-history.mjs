// Keep the original C78 report/tool unchanged; explicitly distinguish this later facility version.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const bytes = readFileSync("docs/m5_b_ui_cleanup_c78.json");
const evidence = JSON.parse(bytes);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const outputs = new Map();
let raw = 0,
  gzip = 0;
for (const r of evidence.captures) {
  const compressed = Buffer.from(r.stdout_gzip_base64, "base64");
  const output = gunzipSync(compressed);
  assert.equal(outputs.has(r.name), false);
  assert.equal(output.length, r.stdout_bytes, r.name);
  assert.equal(sha(output), r.stdout_sha256, r.name);
  assert.equal(r.capture_complete, true);
  assert.equal(r.exit_code, r.expected_exit_code, r.name);
  outputs.set(r.name, output);
  raw += output.length;
  gzip += compressed.length;
}
const fixed = JSON.parse(
  outputs.get("fixed5d226-source-history-native-and-resource-audit"),
);
const old = JSON.parse(outputs.get("historical-original-runner-two-Git-pins"));
const differences = [];
for (const pin of [...fixed.pins, ...old.pins]) {
  const b = execFileSync("git", ["show", `${pin.revision}:${pin.path}`]);
  assert.equal(b.length, pin.bytes, pin.path);
  assert.equal(sha(b), pin.sha256, pin.path);
  if (!pin.historicalOnly && !readFileSync(pin.path).equals(b))
    differences.push(pin.path);
}
assert.deepEqual(differences, [
  "web/tests/independent-tree-view/ui/resource-cleanup.mjs",
]);
assert.equal(raw, evidence.capture_summary.raw_bytes);
assert.equal(gzip, evidence.capture_summary.gzip_bytes);
console.log(
  JSON.stringify({
    historicalArchiveSha256: sha(bytes),
    captures: outputs.size,
    rawBytes: raw,
    gzipBytes: gzip,
    fixedGitSources: fixed.pins.length,
    olderGitSources: old.pins.length,
    explicitCurrentFacilityDifferences: differences,
    historicalRunsNotRewritten: true,
  }),
);
