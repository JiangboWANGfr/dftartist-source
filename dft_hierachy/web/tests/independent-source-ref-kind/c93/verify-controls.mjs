// Portable B29 artifact receipts only. Never runs product or mutation scripts.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const root = path.resolve(
    fileURLToPath(new URL("../../../../", import.meta.url)),
  ),
  raw = fs.readFileSync(
    root + "/docs/m5_b_source_ref_kind_c93_archive_checks.json",
  ),
  a = JSON.parse(raw);
assert.equal(process.argv.length, 2);
const sha = (b) => createHash("sha256").update(b).digest("hex");
function unpack(r) {
  const b = gunzipSync(Buffer.from(r.gzipBase64, "base64"));
  assert.equal(b.length, r.bytes);
  assert.equal(sha(b), r.sha256);
  return b;
}
assert.equal(
  a.kind,
  "B29 artifact-only positive and deterministic checker negative controls",
);
assert.equal(a.productExecuted, 0);
assert.equal(a.exitCode, 0);
assert.ok(!a.facilityError && !a.protectionError);
assert.deepEqual(a.inputProtection, {
  candidateUnchanged: true,
  checkerUnchanged: true,
});
const main = fs.readFileSync(
  root + "/docs/m5_b_source_ref_kind_c93_recheck.json",
);
assert.equal(main.length, a.candidatePin.bytes);
assert.equal(sha(main), a.candidatePin.sha256);
const checker = fs.readFileSync(
  root + "/web/tests/independent-source-ref-kind/c93/verify-evidence.mjs",
);
assert.equal(checker.length, a.checkerPin.bytes);
assert.equal(sha(checker), a.checkerPin.sha256);
assert.equal(sha(unpack(a.sourceCapture)), a.scriptPin.sha256);
const positive = a.positive;
assert.equal(positive.status, 0);
assert.equal(positive.signal, null);
assert.equal(positive.error, null);
unpack(positive.stderr);
const result = JSON.parse(unpack(positive.stdout));
assert.equal(result.verified, true);
assert.equal(result.notProductExecution, true);
assert.equal(result.sha256, sha(main));
assert.equal(result.status, "scoped-tests-passed");
assert.equal(result.c93GatePassed, true);
assert.equal(result.m5Complete, false);
assert.deepEqual(
  [a.plannedMutants, a.passedMutants, a.failedMutants, a.mutants.length],
  [9, 9, 0, 9],
);
assert.deepEqual(
  a.mutants.map((m) => m.id),
  [
    "native-core-executed-zero",
    "native-blocked-positive",
    "original-build-target-renamed",
    "schema-actual-conflicts-with-green-summary",
    "fixed-matrix-nested-eight-with-green-summary",
    "fixed-cache-missing-final-recovery",
    "real-error-falsely-recorded-zero",
    "wrong-helper-original81-blob",
    "original-entry-not-accepted",
  ],
);
for (const m of a.mutants) {
  assert.equal(m.pass, true);
  assert.equal(m.assertionFailure, true);
  assert.equal(m.infrastructureFailure, false);
  const c = m.capture;
  assert.equal(c.status, 1);
  assert.equal(c.signal, null);
  assert.equal(c.error, null);
  assert.equal(c.captureComplete, true);
  assert.ok(c.argv.includes("--archive") && c.cwd);
  assert.ok(
    Number.isFinite(Date.parse(c.started)) &&
      Date.parse(c.ended) >= Date.parse(c.started) &&
      c.seconds >= 0,
  );
  const text = unpack(c.stdout).toString() + unpack(c.stderr).toString();
  assert.match(text, /AssertionError(?:\s|\[|:)/);
  assert.doesNotMatch(
    text,
    /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find module|ENOENT|ETIMEDOUT/,
  );
}
console.log(
  JSON.stringify(
    {
      verified: true,
      notProductExecution: true,
      positive: 1,
      negative: 9,
      productExecuted: 0,
      archiveSha256: sha(main),
      bytes: raw.length,
      sha256: sha(raw),
    },
    null,
    2,
  ),
);
