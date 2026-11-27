// Verify saved control receipts only. Never executes product or controls.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../../", import.meta.url)),
  file = root + "docs/m5_b_source_confirmation_recheck_controls.json",
  raw = fs.readFileSync(file),
  a = JSON.parse(raw),
  sha = (b) => createHash("sha256").update(b).digest("hex");
const unpack = (x, key = "gzip_base64", bytes = "bytes", hash = "sha256") => {
  const b = gunzipSync(Buffer.from(x[key], "base64"));
  assert.equal(b.length, x[bytes]);
  assert.equal(sha(b), x[hash]);
  return b;
};
assert.equal(a.format, "B31-confirmation-controls-v1");
assert.equal(a.productExecuted, 0);
assert.equal(a.positive, 1);
assert.equal(a.negative, 8);
assert.equal(a.allExpected, true);
assert.equal(a.protectedOriginalBytesAndMtime, true);
assert.equal(
  a.archiveSha256,
  sha(fs.readFileSync(root + "docs/m5_b_source_confirmation_recheck.json")),
);
assert.equal(
  a.verifierSha256,
  sha(
    fs.readFileSync(
      root +
        "web/tests/independent-source-confirmation/recheck/verify-evidence.mjs",
    ),
  ),
);
assert.equal(a.records.length, 9);
assert.equal(new Set(a.records.map((r) => r.label)).size, 9);
for (const [i, r] of a.records.entries()) {
  assert.equal(r.status, i === 0 ? 0 : 1);
  assert.ok(r.argv.includes("--inputs"));
  const o = unpack(r.stdout),
    e = unpack(r.stderr);
  if (i === 0) assert.equal(JSON.parse(o).productExecuted, 0);
  else {
    assert.match(e.toString(), /AssertionError/);
    assert.doesNotMatch(e.toString(), /MODULE_NOT_FOUND|ENOENT/);
  }
}
assert.equal(a.postSealReceipts.length, 5);
for (const r of a.postSealReceipts)
  unpack(r, "stdout_gzip_base64", "stdout_bytes", "stdout_sha256");
assert.equal(a.materials.length, 3);
for (const m of a.materials) unpack(m);
console.log(
  JSON.stringify({
    verifiedControls: true,
    productExecuted: 0,
    positive: 1,
    negative: 8,
    bytes: raw.length,
    sha256: sha(raw),
  }),
);
