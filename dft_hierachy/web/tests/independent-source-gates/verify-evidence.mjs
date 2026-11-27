// Verify B7 evidence and byte pins only. This verifier executes zero product semantics.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const own = path.resolve(import.meta.dirname, "../../..");
const file = path.join(own, "docs/m5_b_source_gates_recheck.json");
const archive = JSON.parse(fs.readFileSync(file));
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(
  archive.fixed.productSha,
  "fd08ae787ba9f3c85ef83408a5d7fcb96b6af082",
);
assert.equal(archive.fixed.testSha, "4f974fb9bf4b948ce779c4570802a726c30daef9");
const product = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(product, "explicit historical fixed B7 product root required");
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: product,
    encoding: "utf8",
  }).trim(),
  archive.fixed.productSha,
);
const outputs = new Map();
let rawBytes = 0,
  gzipBytes = 0;
for (const c of archive.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(Array.isArray(c.command) && c.command.length && c.cwd && c.utc);
  assert.equal(typeof c.seconds, "number");
  assert.ok(!outputs.has(c.name), "unique capture name");
  const compressed = Buffer.from(c.stdout_gzip_base64, "base64"),
    b = gunzipSync(compressed);
  assert.equal(b.length, c.stdout_bytes, c.name);
  assert.equal(sha(b), c.stdout_sha256, c.name);
  assert.equal(c.exit_code, c.name === "initial-provenance" ? 1 : 0, c.name);
  outputs.set(c.name, b.toString());
  rawBytes += b.length;
  gzipBytes += compressed.length;
}
assert.match(outputs.get("initial-provenance"), /web\/packages/);
function reports(raw) {
  const found = [];
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
      } else if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        end++;
        break;
      }
    }
    try {
      found.push(JSON.parse(raw.slice(at, end)));
      at = end - 1;
    } catch {}
  }
  return found;
}
function semantic(capture, expectedTap, expectedGroups) {
  const raw = outputs.get(capture);
  const summaries = [
    ...raw.matchAll(/(?:ℹ|#) (tests|pass|fail|skipped|cancelled) (\d+)/g),
  ];
  for (const [field, n] of [
    ["tests", expectedTap],
    ["pass", expectedTap],
    ["fail", 0],
    ["skipped", 0],
    ["cancelled", 0],
  ]) {
    assert.deepEqual(
      summaries.filter((m) => m[1] === field).map((m) => Number(m[2])),
      [n],
      capture + ":" + field,
    );
  }
  const groups = reports(raw).filter(
    (r) =>
      Array.isArray(r.results) &&
      r.results.length > 0 &&
      r.results.every((c) => typeof c.pass === "boolean"),
  );
  assert.deepEqual(
    groups.map((g) => g.results.length),
    expectedGroups,
    capture,
  );
  for (const group of groups)
    assert.ok(
      group.results.every((r) => r.pass),
      capture,
    );
  return {
    tap: expectedTap,
    jsonGroups: expectedGroups,
    executed: expectedTap + expectedGroups.reduce((a, b) => a + b, 0),
    failed: 0,
    skipped: 0,
  };
}
const m4 = semantic("standard-m4", 268, [26]);
const full = semantic(
  "standard-full",
  810,
  [26, 281, 5, 99, 25, 12, 40, 6, 306, 4, 14],
);
assert.equal(m4.executed, 294);
assert.equal(full.executed, 1628);
for (const [field, n] of [
  ["tests", 20],
  ["pass", 20],
  ["fail", 0],
  ["skipped", 0],
  ["cancelled", 0],
])
  assert.match(
    outputs.get("wrapper-os-facilities"),
    new RegExp("(?:ℹ|#) " + field + " " + n + "(?:\\n|\\r|$)"),
  );
const previous = JSON.parse(
  fs.readFileSync(path.join(own, "docs/m5_b_source_e4ba060_recheck.json")),
);
for (const [current, before, count] of [
  ["identity-runtime-enumeration", "identity-input-list", 26],
  ["identity-type-enumeration", "identity-type-list", 7],
  ["source-timing-enumeration", "bd-source-precision-list", 4],
]) {
  const actual = JSON.parse(outputs.get(current));
  assert.equal(actual.count, count);
  const c = previous.captures.find((c) => c.name === before);
  assert.ok(c, before);
  assert.deepEqual(
    actual,
    JSON.parse(
      gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64")).toString(),
    ),
  );
}
for (const [root, pins] of [
  [product, archive.productPins],
  [own, archive.inputPins],
])
  for (const p of pins) {
    const b = fs.readFileSync(path.join(root, p.path));
    assert.equal(b.length, p.bytes, p.path);
    assert.equal(sha(b), p.sha256, p.path);
  }
for (const m of archive.materials) {
  const b = gunzipSync(Buffer.from(m.gzip_base64, "base64"));
  assert.equal(b.length, m.bytes, m.name);
  assert.equal(sha(b), m.sha256, m.name);
}
const first = JSON.parse(outputs.get("initial-provenance-corrected"));
const final = JSON.parse(outputs.get("final-provenance"));
for (const key of [
  "productTracked",
  "mainTracked",
  "ownOriginal",
  "untracked",
  "pins",
  "productionTrees",
  "imports",
])
  assert.deepEqual(final[key], first[key], key);
assert.equal(final.originalSourceFiles, 15);
assert.equal(final.unchangedDeclarations.length, 37);
assert.equal(final.imports.length, 3);
assert.equal(final.log.originalPrefixPreserved, true);
const build = JSON.parse(outputs.get("own-build-metadata"));
const binary = fs.readFileSync(build.binary.path);
assert.equal(binary.length, build.binary.bytes);
assert.equal(sha(binary), build.binary.sha256);
assert.deepEqual(build.ownCoreProcesses, []);
assert.deepEqual(
  JSON.parse(outputs.get("final-resources")).ownCoreProcesses,
  [],
);
const cache = gunzipSync(Buffer.from(build.cache.gzip_base64, "base64"));
assert.equal(cache.length, build.cache.bytes);
assert.equal(sha(cache), build.cache.sha256);
for (const [key, value] of Object.entries({
  CMAKE_BUILD_TYPE: "RelWithDebInfo",
  HIER_TEST_M3: "ON",
  HIER_TEST_FUTURE: "ON",
  HIER_TEST_OBSERVER: "OFF",
  HIER_SANITIZE: "OFF",
  HIER_BUILD_EXPERIMENTS: "OFF",
}))
  assert.equal(build.flags[key], value, key);
assert.equal(
  (outputs.get("core-build-own-hier").match(/\bwarning:/g) ?? []).length,
  0,
);
assert.deepEqual(archive.summary, {
  m4,
  full,
  wrapperFacilities: 20,
  productSemanticsExecutedByVerifier: 0,
});
console.log(
  JSON.stringify({
    archiveVerified: true,
    captures: archive.captures.length,
    productPins: archive.productPins.length,
    inputPins: archive.inputPins.length,
    materials: archive.materials.length,
    rawBytes,
    gzipBytes,
    m4Historical: 294,
    fullHistorical: 1628,
    wrapperFacilitiesHistorical: 20,
    productSemanticsExecutedByVerifier: 0,
  }),
);
