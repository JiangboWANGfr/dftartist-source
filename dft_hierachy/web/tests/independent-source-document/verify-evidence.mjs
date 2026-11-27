// Verify a HISTORICAL B archive. This never runs product semantic assertions.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const own = path.resolve(import.meta.dirname, "../../.."),
  file = path.join(own, "docs/m5_b_source_document_freeze.json"),
  archive = JSON.parse(fs.readFileSync(file));
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  raw = new Map();
let bytes = 0,
  gzipBytes = 0;
assert.equal(archive.freeze, "6838e4cec4a1f6b08624f2f8bb8d2a742a4ce99d");
assert.equal(archive.product, "ccbef3f78c16c84463850255c65e5889a42bb321");
assert.equal(archive.captures.length, 33);
assert.equal(new Set(archive.captures.map((c) => c.name)).size, 33);
const expectedRed = new Set([
  "source-facility-controls",
  "source-proposal-type-controls",
  "renderer-wrapper-facilities",
  "source-baseline-runtime",
  "source-baseline-core",
  "source-baseline-production-types",
]);
for (const c of archive.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(Array.isArray(c.command) && c.command.length);
  assert.ok(c.cwd);
  assert.ok(!Number.isNaN(Date.parse(c.utc)));
  const zipped = Buffer.from(c.stdout_gzip_base64, "base64"),
    b = gunzipSync(zipped);
  assert.equal(b.length, c.stdout_bytes);
  assert.equal(sha(b), c.stdout_sha256);
  assert.equal(c.exit_code, expectedRed.has(c.name) ? 1 : 0, c.name);
  raw.set(c.name, b.toString("utf8"));
  bytes += b.length;
  gzipBytes += zipped.length;
}
const report = (name) => JSON.parse(raw.get(name));
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
const renderer = parseReports(raw.get("renderer-standard-182"));
assert.equal(renderer.length, 7);
const [types, browser, ...runtime] = renderer;
assert.equal(types.exitCode, 0);
assert.deepEqual(types.positive, []);
assert.equal(types.executedNegative, 16);
assert.equal(types.results.length, 16);
assert.ok(types.results.every((r) => r.diagnostics.length > 0));
assert.equal(browser.exitCode, 0);
assert.equal(browser.executed, 1);
assert.deepEqual(
  runtime.map((r) => r.planned),
  [99, 25, 12, 40, 6],
);
for (const r of runtime) {
  assert.equal(r.exitCode, 0);
  assert.equal(r.executed, r.planned);
  assert.equal(r.skipped, 0);
  assert.equal(r.results.length, r.executed);
  assert.ok(r.results.every((x) => x.pass));
}
assert.equal(
  runtime.reduce((n, r) => n + r.executed, 0),
  182,
);
for (const [name, n] of [
  ["source-baseline-runtime", 306],
  ["source-baseline-core", 14],
]) {
  const r = report(name);
  assert.equal(r.exitCode, 1);
  assert.equal(r.planned, n);
  assert.equal(r.executed, 0);
  assert.equal(r.skipped, 0);
  assert.equal(r.stage, "public-export-capability");
  assert.deepEqual(r.results, []);
  assert.match(r.error.message, /missing public SourceDocumentModel/);
}
const production = report("source-baseline-production-types");
assert.equal(production.executedNegative, 0);
assert.equal(production.plannedNegative, 34);
assert.equal(production.exitCode, 1);
assert.equal(production.positive.filter((d) => d.code === 2305).length, 10);
const proposal = report("source-proposal-final-controls");
assert.equal(proposal.exitCode, 0);
assert.deepEqual(proposal.positive, []);
assert.equal(proposal.executedNegative, 34);
const freeze = archive.captures.find((c) => c.name === "source-freeze-commit");
for (const name of [
  "source-baseline-runtime",
  "source-baseline-core",
  "source-baseline-production-types",
])
  assert.ok(
    Date.parse(archive.captures.find((c) => c.name === name).utc) >
      Date.parse(freeze.utc),
    "freeze before semantic attempt",
  );
assert.match(
  raw.get("source-controls-reviewed"),
  /# tests 6\n[\s\S]*# pass 6\n[\s\S]*# fail 0\n[\s\S]*# skipped 0/,
);
assert.match(
  raw.get("renderer-wrapper-facilities-fixed"),
  /# tests 4\n[\s\S]*# pass 4\n[\s\S]*# fail 0/,
);
assert.equal(archive.sourcePins.length, 25);
const fixedRoot = process.env.HIER_B_PRODUCT_ROOT ?? archive.productRoot;
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: fixedRoot,
    encoding: "utf8",
  }).trim(),
  archive.product,
);
for (const p of archive.sourcePins) {
  const b = fs.readFileSync(
    path.join(p.root === "B-tests" ? own : fixedRoot, p.path),
  );
  assert.equal(b.length, p.bytes, p.path);
  assert.equal(sha(b), p.sha256, p.path);
}
for (const f of archive.fixtures) {
  const b = Buffer.from(f.base64, "base64");
  assert.equal(b.length, f.bytes);
  assert.equal(sha(b), f.sha256);
  assert.equal(b.toString("utf8").length, f.utf16Units);
}
for (const [args, name] of [
  [["--list"], "source-frozen-inventory"],
  [["--core", "--list"], "source-frozen-core-inventory"],
]) {
  const actual = JSON.parse(
    execFileSync(
      process.execPath,
      ["web/tests/independent-source-document/run.mjs", ...args],
      { cwd: own, encoding: "utf8" },
    ),
  );
  assert.deepEqual(actual, report(name));
}
const { before, after } = archive.protection;
assert.deepEqual(before.ownOld, after.ownOld);
assert.deepEqual(before.productTracked, after.productTracked);
assert.deepEqual(before.mainTracked, after.mainTracked);
assert.deepEqual(before.untracked, after.untracked);
assert.deepEqual(before.importPins, after.importPins);
assert.equal(after.log.originalPrefixPreserved, true);
assert.equal(before.importPins.length, 11);
assert.equal(after.untracked.length, 18);
assert.equal(report("environment-resources").sourceCoreFreshBuildExists, false);
assert.deepEqual(report("environment-resources").ownCoreProcesses, []);
console.log(
  JSON.stringify({
    archiveVerified: true,
    captures: 33,
    pins: 25,
    byteFixtures: 4,
    rawBytes: bytes,
    gzipBytes,
    rendererHistoricalPassed: 182,
    sourceBaseline: {
      controlledPlanned: 306,
      corePlanned: 14,
      semanticExecuted: 0,
      skipped: 0,
      productionNegativeExecuted: 0,
    },
    semanticsExecutedByThisVerifier: 0,
  }),
);
