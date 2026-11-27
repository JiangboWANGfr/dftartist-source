// C-84 evidence integrity only; zero current product semantics.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const own = path.resolve(import.meta.dirname, "../../..");
const a = JSON.parse(
  fs.readFileSync(path.join(own, "docs/m5_b_c84_path_recheck.json")),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const raw = new Map();
let bytes = 0,
  gzipBytes = 0,
  blocks = 0;
function unpack(value) {
  const compressed = Buffer.from(value.gzip_base64, "base64"),
    b = gunzipSync(compressed);
  assert.equal(b.length, value.bytes);
  assert.equal(sha(b), value.sha256);
  bytes += b.length;
  gzipBytes += compressed.length;
  blocks++;
  return b;
}
assert.equal(a.fixed.productSha, "fd08ae787ba9f3c85ef83408a5d7fcb96b6af082");
assert.equal(a.fixed.freezeSha, "e65a0329b190ab3228d40f6ef1aa7adca6df0689");
assert.equal(a.fixed.fixSha, "82b753148173b39cd4097832f5924575b5f880a8");
for (const c of a.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(c.cwd && c.utc && c.command.length);
  assert.ok(!raw.has(c.name));
  const text = unpack({
    bytes: c.stdout_bytes,
    sha256: c.stdout_sha256,
    gzip_base64: c.stdout_gzip_base64,
  }).toString();
  const red = [
    "c84-original-path-baseline",
    "c84-space-pure-baseline",
    "c84-space-standard-full",
  ].includes(c.name);
  assert.equal(c.exit_code, red ? 1 : 0, c.name);
  raw.set(c.name, text);
}
for (const name of ["c84-original-path-baseline", "c84-corrected-paths"]) {
  const r = JSON.parse(raw.get(name)),
    baseline = name.includes("baseline");
  assert.equal(r.executed, 3);
  assert.equal(r.skipped, 0);
  assert.equal(r.passed, baseline ? 1 : 3);
  assert.equal(r.failed, baseline ? 2 : 0);
  assert.deepEqual(
    r.results.map((x) => x.id),
    ["ascii-checkout", "checkout with space", "检出中文"],
  );
  for (const [i, child] of r.results.entries()) {
    const childRaw = unpack(child.stdout).toString();
    unpack(child.stderr);
    assert.equal(child.counts.tests, 10);
    assert.equal(child.counts.skipped, 0);
    assert.equal(child.counts.cancelled, 0);
    assert.equal(child.status, baseline && i > 0 ? 1 : 0);
    assert.equal(child.counts.pass, baseline && i > 0 ? 9 : 10);
    assert.equal(child.counts.fail, baseline && i > 0 ? 1 : 0);
    if (baseline && i > 0) assert.match(childRaw, /MODULE_NOT_FOUND/);
  }
}
function summary(name, tests, passed, failed) {
  const text = raw.get(name);
  for (const [field, n] of [
    ["tests", tests],
    ["pass", passed],
    ["fail", failed],
    ["skipped", 0],
    ["cancelled", 0],
  ])
    assert.deepEqual(
      [...text.matchAll(new RegExp("(?:ℹ|#) " + field + " (\\d+)", "g"))].map(
        (m) => +m[1],
      ),
      [n],
      name + ":" + field,
    );
}
summary("c84-space-pure-baseline", 10, 9, 1);
summary("c84-space-corrected-ten", 10, 10, 0);
function reports(text) {
  const out = [];
  for (let at = 0; at < text.length; at++) {
    if (text[at] !== "{" || (at > 0 && text[at - 1] !== "\n")) continue;
    let depth = 0,
      quoted = false,
      escape = false,
      end = at;
    for (; end < text.length; end++) {
      const c = text[end];
      if (quoted) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        end++;
        break;
      }
    }
    try {
      out.push(JSON.parse(text.slice(at, end)));
      at = end - 1;
    } catch {}
  }
  return out;
}
for (const [name, tap, counts] of [["c84-space-standard-m4", 268, [26]]]) {
  summary(name, tap, tap, 0);
  const semantic = reports(raw.get(name)).filter(
    (r) =>
      Array.isArray(r.results) &&
      r.results.length &&
      r.results.every((c) => typeof c.pass === "boolean"),
  );
  assert.deepEqual(
    semantic.map((r) => r.results.length),
    counts,
  );
  assert.ok(semantic.every((r) => r.results.every((c) => c.pass)));
}
summary("c84-space-standard-full", 810, 767, 43);
assert.match(raw.get("c84-space-standard-full"), /MODULE_NOT_FOUND/);
assert.match(raw.get("c84-space-standard-full"), /checkout%20with%20space/);
assert.match(raw.get("c84-space-standard-full"), /✔ B sharing S02/);
assert.equal(
  reports(raw.get("c84-space-standard-full")).filter(
    (r) =>
      Array.isArray(r.results) &&
      r.results.length &&
      r.results.every((c) => typeof c.pass === "boolean"),
  ).length,
  0,
  "later chained runtime groups were not executed",
);
const audit = JSON.parse(raw.get("c84-final-byte-overlay-audit"));
assert.deepEqual(audit.overlayPaths, [
  "web/tests/independent-transport-sharing/compatibility.test.mjs",
]);
assert.equal(audit.s03ToS09Unchanged, true);
const old = JSON.parse(
  fs.readFileSync(path.join(own, "docs/m5_b_source_gates_recheck.json")),
);
const c = old.captures.find((c) => c.name === "final-provenance");
const oldAudit = JSON.parse(
  gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64")).toString(),
);
assert.deepEqual(audit.productTracked, oldAudit.productTracked);
assert.deepEqual(audit.mainTracked, oldAudit.mainTracked);
assert.deepEqual(audit.untracked, oldAudit.untracked);
assert.equal(audit.log.originalPrefixPreserved, true);
for (const p of a.inputPins) {
  const b = fs.readFileSync(path.join(own, p.path));
  assert.equal(b.length, p.bytes);
  assert.equal(sha(b), p.sha256, p.path);
}
for (const m of a.materials) unpack(m);
const build = JSON.parse(raw.get("c84-space-build-metadata"));
const binary = fs.readFileSync(build.binary.path);
assert.equal(binary.length, build.binary.bytes);
assert.equal(sha(binary), build.binary.sha256);
unpack(build.cache);
assert.deepEqual(build.ownCoreProcesses, []);
assert.deepEqual(
  JSON.parse(raw.get("c84-final-resources")).ownCoreProcesses,
  [],
);
assert.equal(
  (raw.get("c84-space-own-core-build").match(/\bwarning:/g) ?? []).length,
  0,
);
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: a.fixed.spaceProductRoot,
    encoding: "utf8",
  }).trim(),
  a.fixed.productSha,
);
assert.deepEqual(a.summary, {
  originalPaths: { passed: 1, failed: 2 },
  correctedPaths: { passed: 3, failed: 0 },
  spacePureCompatibility: { passed: 9, failed: 1 },
  spaceOverlayCompatibility: { passed: 10, failed: 0 },
  spaceOverlayM4: 294,
  spaceOverlayFull: {
    planned: 1628,
    executed: 810,
    passed: 767,
    failed: 43,
    laterRuntimeGroupsExecuted: 0,
  },
  skipped: 0,
  productSemanticsExecutedByVerifier: 0,
});
console.log(
  JSON.stringify({
    archiveVerified: true,
    captures: a.captures.length,
    inputPins: a.inputPins.length,
    blocks,
    rawBytes: bytes,
    gzipBytes,
    originalPathFailuresRetained: 2,
    originalCheckoutFailureRetained: 1,
    correctedPaths: 3,
    m4Historical: 294,
    fullHistorical: { executed: 810, passed: 767, failed: 43 },
    productSemanticsExecutedByVerifier: 0,
  }),
);
