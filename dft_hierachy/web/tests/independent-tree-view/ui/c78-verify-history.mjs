// Validate historical runs as historical Git snapshots, never as the revised runner.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const file = "docs/m5_b_tree_view_full.json";
const bytes = readFileSync(file);
const evidence = JSON.parse(bytes);
const sha = (b) => createHash("sha256").update(b).digest("hex");
let raw = 0,
  gzip = 0;
const names = new Set();
for (const r of evidence.captures) {
  assert.equal(names.has(r.name), false, r.name);
  names.add(r.name);
  const compressed = Buffer.from(r.stdout_gzip_base64, "base64");
  const output = gunzipSync(compressed);
  assert.equal(output.length, r.stdout_bytes, r.name);
  assert.equal(sha(output), r.stdout_sha256, r.name);
  assert.equal(r.capture_complete, true);
  assert.equal(r.exit_code, r.expected_exit_code, r.name);
  raw += output.length;
  gzip += compressed.length;
}
const changed = [];
for (const s of evidence.source_hashes) {
  const fixed = execFileSync("git", ["show", `${s.commit}:${s.path}`]);
  assert.equal(fixed.length, s.bytes, s.path);
  assert.equal(sha(fixed), s.sha256, s.path);
  if (s.kind !== "plan-freeze-snapshot" && !readFileSync(s.path).equals(fixed))
    changed.push(s.path);
}
assert.equal(raw, evidence.capture_summary.raw_bytes);
assert.deepEqual(changed.sort(), [
  "web/tests/independent-tree-view/ui/core-bridge.mjs",
  "web/tests/independent-tree-view/ui/run.mjs",
]);
console.log(
  JSON.stringify({
    historicalArchiveSha256: sha(bytes),
    captures: evidence.captures.length,
    sourceGitPins: evidence.source_hashes.length,
    rawBytes: raw,
    gzipBytes: gzip,
    currentDifferencesExplicitlyNotHistoricalExecution: changed,
    originalArchiveAndVerifierUnmodified: true,
  }),
);
