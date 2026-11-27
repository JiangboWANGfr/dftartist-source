import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const archive = readFileSync(
  resolve(root, "docs/m5_b_standard_gates_verification.json"),
);
const evidence = JSON.parse(archive);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const outputs = new Map();
let raw = 0,
  gzip = 0;
for (const capture of evidence.captures) {
  assert.equal(outputs.has(capture.name), false, capture.name);
  const compressed = Buffer.from(capture.stdout_gzip_base64, "base64");
  const bytes = gunzipSync(compressed);
  assert.equal(capture.capture_complete, true);
  assert.equal(bytes.length, capture.stdout_bytes, capture.name);
  assert.equal(sha(bytes), capture.stdout_sha256, capture.name);
  assert.equal(capture.exit_code, capture.expected_exit_code, capture.name);
  outputs.set(capture.name, bytes.toString());
  raw += bytes.length;
  gzip += compressed.length;
}
assert.equal(outputs.size, evidence.capture_summary.captures);
assert.equal(raw, evidence.capture_summary.raw_bytes);
assert.equal(gzip, evidence.capture_summary.gzip_bytes);
const names = [
  "B sharing S01 public runtime exports stay exactly pre-refactor",
  "B sharing S02 public declaration artifacts stay pre-refactor bytes",
  "B sharing S03 old private inbox bundle executes without Node globals",
  "B sharing S04 old inbox binding is async FIFO with one receiver",
  "B sharing S05 close before queued first delivery discards content",
  "B sharing S06 unsubscribe cancels queue but not unique ownership",
  "B sharing S07 realm frame cap 256+0",
  "B sharing S07 realm frame cap 256+1",
  "B sharing S08 real first delivery releases prebind byte cap",
  "B sharing S09 buffered hello to real browser-bundled SDK, roots and dispose",
];
const gateResults = [];
for (const [suffix, original] of [
  ["M4", 258],
  ["independent", 800],
]) {
  const baseline = outputs.get(
    suffix === "M4"
      ? "before8d9-standard-M4-258"
      : "before8d9-standard-independent800",
  );
  const success = outputs.get(
    suffix === "M4"
      ? "target2ad-standard-M4-268"
      : "target2ad-standard-independent810",
  );
  const negative = outputs.get(
    suffix === "M4"
      ? "negative2ad-standard-M4-original258"
      : "negative2ad-standard-independent-original800",
  );
  for (const name of names) {
    assert.equal(
      success.split("\n").filter((l) => l.startsWith("✔ " + name + " ("))
        .length,
      1,
      name,
    );
    assert.equal(baseline.includes(name), false, name);
    assert.equal(negative.includes("✔ " + name), false, name);
  }
  assert.ok(baseline.includes(`ℹ pass ${original}\n`));
  assert.ok(success.includes(`ℹ pass ${original + 10}\n`));
  assert.ok(success.includes("ℹ fail 0\n"));
  assert.ok(negative.includes(`ℹ pass ${original}\n`));
  assert.ok(negative.includes("ℹ fail 1\n"));
  assert.ok(negative.includes("B_GATE_FAILURE_CONTROL_SHARED_TEN_ONLY"));
  assert.ok(
    negative.includes(
      "test at tests/independent-transport-sharing/compatibility.test.mjs:1:1",
    ),
  );
  gateResults.push({
    suffix,
    original,
    current: original + 10,
    tenNamedCasesEachOnce: true,
    negativeExit: 1,
  });
}
const { pins } = JSON.parse(
  outputs.get("B-frozen-ten-and-negative-control-current-source-pins"),
);
for (const pin of pins) {
  const fixed = execFileSync("git", ["show", `${pin.revision}:${pin.path}`], {
    cwd: root,
  });
  assert.equal(fixed.length, pin.bytes, pin.path);
  assert.equal(sha(fixed), pin.sha256, pin.path);
  assert.ok(readFileSync(resolve(root, pin.path)).equals(fixed), pin.path);
}
console.log(
  JSON.stringify({
    archiveSha256: sha(archive),
    captures: outputs.size,
    rawBytes: raw,
    gzipBytes: gzip,
    sourcePins: pins.length,
    gateResults,
    checkShActuallyExecuted: false,
  }),
);
