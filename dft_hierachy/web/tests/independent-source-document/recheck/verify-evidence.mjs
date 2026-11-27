// Historical archive validation only. No current product semantic execution.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const own = path.resolve(import.meta.dirname, "../../../.."),
  a = JSON.parse(
    fs.readFileSync(path.join(own, "docs/m5_b_source_e4ba060_recheck.json")),
  ),
  sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(a.product, "e4ba060767a3a53d19198b0214ca1f7d1690cc49");
assert.equal(a.reviewedMaintenance, "aad11d6c5a2b1540d47465b50ee430ba9c846013");
assert.equal(a.captures.length, 53);
assert.equal(new Set(a.captures.map((c) => c.name)).size, 53);
const red = new Set([
    "core-build-own-hier",
    "standard-independent-original",
    "standard-m4-original",
    "identity-freeze-format",
    "identity-runtime-pre-feature",
    "identity-types-pre-feature",
  ]),
  raw = new Map();
let bytes = 0,
  zipped = 0;
for (const c of a.captures) {
  const z = Buffer.from(c.stdout_gzip_base64, "base64"),
    b = gunzipSync(z);
  assert.equal(c.capture_complete, true);
  assert.equal(b.length, c.stdout_bytes);
  assert.equal(sha(b), c.stdout_sha256);
  assert.equal(c.exit_code, red.has(c.name) ? 1 : 0, c.name);
  assert.ok(c.command.length && c.cwd);
  assert.ok(!Number.isNaN(Date.parse(c.utc)));
  raw.set(c.name, b.toString());
  bytes += b.length;
  zipped += z.length;
}
const parseReports = function (raw) {
  const reports = [];
  for (let at = 0; at < raw.length; at++) {
    if (raw[at] !== "{" || (at !== 0 && raw[at - 1] !== "\n")) continue;
    let depth = 0,
      quoted = false,
      escape = false,
      end = at;
    for (; end < raw.length; end++) {
      const c = raw[end];
      if (quoted) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') quoted = false;
      } else {
        if (c === '"') quoted = true;
        else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) {
          end++;
          break;
        }
      }
    }
    try {
      reports.push(JSON.parse(raw.slice(at, end)));
      at = end - 1;
    } catch {}
  }
  return reports;
};
const report = (name) => JSON.parse(raw.get(name));
function counts(text) {
  const fields = {};
  for (const m of text.matchAll(/(?:ℹ|#) (tests|pass|fail|skipped) (\d+)/g))
    fields[m[1]] = Number(m[2]);
  return fields;
}
assert.deepEqual(counts(raw.get("standard-independent-original")), {
  tests: 810,
  pass: 808,
  fail: 2,
  skipped: 0,
});
assert.deepEqual(counts(raw.get("standard-m4-original")), {
  tests: 268,
  pass: 266,
  fail: 2,
  skipped: 0,
});
for (const name of ["standard-independent-original", "standard-m4-original"]) {
  const text = raw.get(name);
  assert.match(text, /S01 public runtime exports stay exactly pre-refactor/);
  assert.match(
    text,
    /S02 public declaration artifacts stay pre-refactor bytes/,
  );
  assert.match(text, /actual: 394/);
}
const whole = raw.get("standard-independent-maintained");
assert.deepEqual(counts(whole), { tests: 810, pass: 810, fail: 0, skipped: 0 });
const groups = parseReports(whole).filter(
  (r) =>
    Array.isArray(r.results) &&
    r.results.length > 0 &&
    r.results.every((x) => typeof x.pass === "boolean"),
);
assert.deepEqual(
  groups.map((r) => r.executed ?? r.executedCases),
  [281, 5, 99, 25, 12, 40, 6, 306, 14],
);
for (const r of groups) {
  assert.equal(r.exitCode, 0);
  assert.equal(r.skipped ?? r.skippedCases, 0);
  assert.ok(r.results.every((x) => x.pass));
  assert.equal(r.results.length, r.executed ?? r.executedCases);
}
assert.equal(
  810 + groups.reduce((n, r) => n + (r.executed ?? r.executedCases), 0),
  1598,
);
assert.deepEqual(counts(raw.get("standard-m4-maintained")), {
  tests: 268,
  pass: 268,
  fail: 0,
  skipped: 0,
});
for (const [name, n] of [
  ["source-runtime-306", 306],
  ["source-core-14", 14],
  ["identity-runtime-current", 26],
  ["bd-source-precision-current", 4],
]) {
  const r = report(name);
  assert.equal(r.executed, n);
  assert.equal(r.skipped, 0);
  assert.equal(r.exitCode, 0);
  assert.ok(r.results.every((x) => x.pass));
}
for (const [name, n] of [
  ["source-production-types-34", 34],
  ["identity-types-current", 7],
]) {
  const r = report(name);
  assert.deepEqual(r.positive, []);
  assert.equal(r.executedNegative, n);
  assert.equal(r.exitCode, 0);
}
const old = report("identity-runtime-pre-feature");
assert.equal(old.planned, 26);
assert.equal(old.executed, 0);
assert.equal(old.skipped, 0);
assert.equal(old.stage, "public-export-capability");
assert.equal(report("identity-types-pre-feature").executedNegative, 0);
assert.deepEqual(counts(raw.get("historical-legacy-on-old-product")), {
  tests: 10,
  pass: 10,
  fail: 0,
  skipped: 0,
});
assert.deepEqual(counts(raw.get("reviewed-epoch-current")), {
  tests: 10,
  pass: 10,
  fail: 0,
  skipped: 0,
});
assert.deepEqual(counts(raw.get("identity-epoch-facility")), {
  tests: 10,
  pass: 10,
  fail: 0,
  skipped: 0,
});
const epoch = a.captures.find((c) => c.name === "reviewed-maintenance-freeze"),
  draft = a.captures.find((c) => c.name === "identity-input-freeze");
for (const name of [
  "identity-runtime-current",
  "identity-types-current",
  "identity-runtime-pre-feature",
])
  assert.ok(
    Date.parse(a.captures.find((c) => c.name === name).utc) >
      Date.parse(draft.utc),
  );
for (const name of [
  "bd-source-precision-current",
  "standard-independent-maintained",
])
  assert.ok(
    Date.parse(a.captures.find((c) => c.name === name).utc) >
      Date.parse(epoch.utc),
  );
assert.equal(a.sourcePins.length, 41);
const fixed = process.env.HIER_B_PRODUCT_ROOT ?? a.productRoot;
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fixed,
    encoding: "utf8",
  }).trim(),
  a.product,
);
for (const p of a.sourcePins) {
  const b = fs.readFileSync(
    path.join(p.root === "B-tests" ? own : fixed, p.path),
  );
  assert.equal(b.length, p.bytes, p.path);
  assert.equal(sha(b), p.sha256, p.path);
}
for (const p of a.resources.overlay) {
  const b = fs.readFileSync(path.join(fixed, p.path));
  assert.equal(b.length, p.bytes);
  assert.equal(sha(b), p.sha256);
}
const before = a.protection.initial,
  after = a.protection.afterMaintenance;
assert.equal(before.ownOld.files, 551);
assert.equal(after.ownOld.files, 550);
assert.deepEqual(before.mainTracked, after.mainTracked);
assert.deepEqual(before.untracked, after.untracked);
assert.deepEqual(before.sourceImportPins, after.sourceImportPins);
assert.equal(
  after.activeCompatibility.originalSha256,
  after.activeCompatibility.historicalSha256,
);
assert.equal(after.activeCompatibility.productUsesMaintained, true);
assert.equal(after.log.originalPrefixPreserved, true);
const approval = report("reviewed-C-contract-decision");
assert.equal(Buffer.byteLength(approval.text), approval.bytes);
assert.equal(sha(Buffer.from(approval.text)), approval.sha256);
assert.equal(approval.sha256, a.reviewedContractDecision.sha256);
assert.deepEqual(a.resources.coreProcesses, []);
const core = fs.readFileSync(path.join(fixed, "core/build-b-review/hier"));
assert.equal(core.length, a.resources.core.bytes);
assert.equal(sha(core), a.resources.core.sha256);
console.log(
  JSON.stringify({
    archiveVerified: true,
    captures: 53,
    pins: 41,
    rawBytes: bytes,
    gzipBytes: zipped,
    fullStandardHistoricalPassed: 1598,
    m4HistoricalPassed: 268,
    identitySupplement: 26,
    BDPrecisionSupplement: 4,
    originalGateFailuresPreserved: 2,
    semanticsExecutedByThisVerifier: 0,
  }),
);
