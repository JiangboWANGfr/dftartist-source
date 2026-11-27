import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const bytes = readFileSync(resolve(root, "docs/m5_b_ui_cleanup_c78.json"));
const evidence = JSON.parse(bytes);
const sha = (data) => createHash("sha256").update(data).digest("hex");
const outputs = new Map();
let raw = 0,
  gzip = 0;
for (const capture of evidence.captures) {
  assert.equal(outputs.has(capture.name), false, capture.name);
  const compressed = Buffer.from(capture.stdout_gzip_base64, "base64");
  const output = gunzipSync(compressed);
  assert.equal(capture.capture_complete, true, capture.name);
  assert.equal(output.length, capture.stdout_bytes, capture.name);
  assert.equal(sha(output), capture.stdout_sha256, capture.name);
  assert.equal(capture.exit_code, capture.expected_exit_code, capture.name);
  outputs.set(capture.name, output);
  raw += output.length;
  gzip += compressed.length;
}
assert.equal(outputs.size, evidence.capture_summary.captures);
assert.equal(raw, evidence.capture_summary.raw_bytes);
assert.equal(gzip, evidence.capture_summary.gzip_bytes);
const audit = JSON.parse(
  outputs.get("fixed5d226-source-history-native-and-resource-audit"),
);
const old = JSON.parse(outputs.get("historical-original-runner-two-Git-pins"));
for (const pin of [...audit.pins, ...old.pins]) {
  const fixed = execFileSync("git", ["show", `${pin.revision}:${pin.path}`], {
    cwd: root,
  });
  assert.equal(fixed.length, pin.bytes, pin.path);
  assert.equal(sha(fixed), pin.sha256, pin.path);
  if (!pin.historicalOnly)
    assert.ok(readFileSync(resolve(root, pin.path)).equals(fixed), pin.path);
}
const current = outputs.get("fixed5d226-all-cleanup25").toString();
assert.match(current, /# tests 25\n/);
assert.match(current, /# pass 25\n/);
const controls = current.split("\n").flatMap((line) => {
  const marker = "C78_RESOURCE_CONTROL ";
  const index = line.indexOf(marker);
  return index < 0 ? [] : [JSON.parse(line.slice(index + marker.length))];
});
assert.equal(controls.length, 7);
assert.equal(new Set(controls.map((x) => x.mode)).size, 7);
for (const { mode, observedBeforeRescue: s } of controls) {
  assert.equal(s.workerError, undefined, mode);
  assert.equal(s.pageClosed, true, mode);
  assert.equal(s.browserConnected, false, mode);
  assert.equal(s.serverListening, false, mode);
  assert.equal(s.cores.length, 2, mode);
  assert.ok(
    s.cores.every((x) => x.closed),
    mode,
  );
  assert.equal(s.pollsEnded, 2, mode);
  assert.equal(s.portRebind, true, mode);
  assert.equal(s.runnerExitCode, mode === "normal" ? 0 : 1, mode);
  assert.equal(s.runnerResult.closedOwnBrowserServerAndCore, true, mode);
  assert.equal(s.runnerResult.executedCases, 0, mode);
}
console.log(
  JSON.stringify({
    archiveSha256: sha(bytes),
    captures: outputs.size,
    rawBytes: raw,
    gzipBytes: gzip,
    fixedSourcePins: audit.pins.length,
    historicalSourcePins: old.pins.length,
    verifiedRealResourceControls: controls.length,
    semanticCases: 0,
    preservedOriginalBaselineFailure: true,
  }),
);
