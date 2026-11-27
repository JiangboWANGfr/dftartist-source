// Version-aware historical evidence check; old archives and their strict tools remain untouched.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const sha = (b) => createHash("sha256").update(b).digest("hex");
const results = [];
for (const [file, expectedHash, allowed, sourceKind] of [
  [
    "docs/m5_b_tree_view_full.json",
    "5db8ea2494817e4288f7b0ae13a59a1cbc1fe81d23161a2527993d2f93fd7bcd",
    ["README.md", "cases.mjs", "core-bridge.mjs", "run.mjs"],
    "oldUI",
  ],
  [
    "docs/m5_b_ui_cleanup_c78.json",
    "d946a80cd770876ef7a28e0da55e74188c670ac53b77fbbbeaa9741b6e08aab0",
    ["run.mjs", "resource-cleanup.mjs"],
    "C78",
  ],
  [
    "docs/m5_b_c80_reporting.json",
    "c03e97298c073277bf67e48605567c6693616ea5457fd246090613be48297ce3",
    [],
    "C80",
  ],
]) {
  const bytes = readFileSync(file),
    e = JSON.parse(bytes),
    outputs = new Map();
  assert.equal(sha(bytes), expectedHash, file);
  let raw = 0,
    gzip = 0;
  for (const r of e.captures) {
    const compressed = Buffer.from(r.stdout_gzip_base64, "base64"),
      body = gunzipSync(compressed);
    assert.equal(outputs.has(r.name), false);
    assert.equal(body.length, r.stdout_bytes, r.name);
    assert.equal(sha(body), r.stdout_sha256, r.name);
    assert.equal(r.capture_complete, true);
    assert.equal(r.exit_code, r.expected_exit_code, r.name);
    outputs.set(r.name, body);
    raw += body.length;
    gzip += compressed.length;
  }
  let pins;
  if (sourceKind === "oldUI")
    pins = e.source_hashes.map((s) => ({
      ...s,
      revision: s.commit,
      historicalOnly: s.kind === "plan-freeze-snapshot",
    }));
  else if (sourceKind === "C78")
    pins = [
      ...JSON.parse(
        outputs.get("fixed5d226-source-history-native-and-resource-audit"),
      ).pins,
      ...JSON.parse(outputs.get("historical-original-runner-two-Git-pins"))
        .pins,
    ];
  else
    pins = JSON.parse(
      outputs.get("C80-fixed-source-original-protection-and-owned-products"),
    ).pins;
  const allowedPaths = allowed.map(
    (name) => "web/tests/independent-tree-view/ui/" + name,
  );
  const changed = [],
    expectedChanged = [];
  for (const s of pins) {
    const fixed = execFileSync("git", ["show", `${s.revision}:${s.path}`]);
    assert.equal(fixed.length, s.bytes, s.path);
    assert.equal(sha(fixed), s.sha256, s.path);
    if (!s.historicalOnly) {
      if (allowedPaths.includes(s.path)) expectedChanged.push(s.path);
      if (!readFileSync(s.path).equals(fixed)) changed.push(s.path);
    }
  }
  assert.deepEqual(changed.sort(), expectedChanged.sort(), file);
  assert.equal(raw, e.capture_summary.raw_bytes);
  results.push({
    file,
    sha256: expectedHash,
    captures: outputs.size,
    rawBytes: raw,
    gzipBytes: gzip,
    fixedGitPins: pins.length,
    explicitCurrentDifferences: changed,
  });
}
console.log(JSON.stringify({ historicalRunsNotRewritten: true, results }));
