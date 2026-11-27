import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const archive = readFileSync(resolve(root, "docs/m5_b_c80_reporting.json"));
const evidence = JSON.parse(archive);
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
  outputs.set(r.name, output.toString());
  raw += output.length;
  gzip += compressed.length;
}
assert.equal(outputs.size, evidence.capture_summary.captures);
assert.equal(raw, evidence.capture_summary.raw_bytes);
assert.equal(gzip, evidence.capture_summary.gzip_bytes);
const baseline = outputs.get("before5d226-C80-frozen31");
assert.match(baseline, /# tests 31\n/);
assert.match(baseline, /# pass 13\n/);
assert.match(baseline, /# fail 18\n/);
const fixed = outputs.get("fixed-C80-31-and-original-C78-25");
assert.match(fixed, /# tests 56\n/);
assert.match(fixed, /# pass 56\n/);
const controls = fixed.split("\n").flatMap((line) => {
  const marker = "C80_REPORT_CONTROL ";
  const index = line.indexOf(marker);
  return index < 0 ? [] : [JSON.parse(line.slice(index + marker.length))];
});
assert.equal(controls.length, 5);
for (const { mode, observedBeforeRescue: s } of controls) {
  assert.equal(s.runnerReports, 1, mode);
  assert.equal(s.importError, undefined, mode);
  assert.equal(s.exitCode, 1, mode);
  assert.equal(s.browserConnected, false, mode);
  assert.equal(s.serverListening, false, mode);
  assert.equal(s.portRebind, true, mode);
  assert.equal(s.poisonHooks, 0, mode);
  assert.equal(s.reports[0].closedOwnBrowserServerAndCore, true, mode);
  assert.ok(
    Object.values(s.reports[0].error).every((v) => typeof v === "string"),
  );
  if (mode !== "stable") assert.deepEqual(s.reads, { message: 1, stack: 1 });
}
const audit = JSON.parse(
  outputs.get("C80-fixed-source-original-protection-and-owned-products"),
);
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
  outputs.get("C80-current-production-capability-red"),
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
    fixedAndHistoricalPins: audit.pins.length,
    realRunnerReports: controls.length,
    baselineFailurePreserved: true,
    semanticCases: 0,
  }),
);
