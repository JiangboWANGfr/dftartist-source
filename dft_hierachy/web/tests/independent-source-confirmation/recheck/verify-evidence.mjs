// B31 archive metadata only. No boot, product run, compiler, or child process.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { cases } from "../cases.mjs";
import "../boundaries.mjs";
import { negatives } from "../types.mjs";
import { q1Cases } from "./q1.mjs";
import { coreCases } from "./core.mjs";
const root = fileURLToPath(new URL("../../../../", import.meta.url)),
  arg = process.argv.indexOf("--archive"),
  file =
    arg < 0
      ? root + "docs/m5_b_source_confirmation_recheck.json"
      : process.argv[arg + 1],
  raw = fs.readFileSync(file),
  a = JSON.parse(raw),
  sha = (b) => createHash("sha256").update(b).digest("hex");
function unpack(x, key = "gzip_base64", bytes = "bytes", hash = "sha256") {
  const b = gunzipSync(Buffer.from(x[key], "base64"));
  assert.equal(b.length, x[bytes]);
  assert.equal(sha(b), x[hash]);
  return b;
}
assert.equal(a.format, "B31-source-confirmation-recheck-v1");
assert.equal(a.product, "16b18a0a8a994291b275083ac7d389930f894878");
assert.equal(a.old, "8fdc91a73fedaaa889d795928489363640df7588");
assert.equal(a.freeze, "bb3428ce324dbd3cc48f280aa8954c5c87374941");
assert.equal(a.originalFreeze, "0a83e08b8339b2d594597ebd161d5428212f3129");
assert.equal(a.base, "05047bf9fd98b1a93b40cccd69499c8ca40df2d3");
assert.equal(a.status, "scoped-tests-passed");
for (const k of [
  "original121Passed",
  "public37Passed",
  "q1OwnIssueClosed",
  "independentCore8Passed",
  "standardWebPassed",
])
  assert.equal(a[k], true, k);
for (const k of [
  "m5Complete",
  "electronE2E",
  "cppFullCTestExecuted",
  "completeCheckShExecuted",
  "c94ClosureByB",
])
  assert.equal(a[k], false, k);
assert.equal(a.cReviewOwner, "C");
assert.equal(a.captures.length, 41);
assert.equal(new Set(a.captures.map((c) => c.name)).size, 41);
const outputs = new Map();
for (const c of a.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(c.command.length && c.cwd && c.utc);
  assert.ok(c.seconds >= 0);
  outputs.set(
    c.name,
    unpack(c, "stdout_gzip_base64", "stdout_bytes", "stdout_sha256"),
  );
}
const capture = (n) => {
    const c = a.captures.find((c) => c.name === n);
    assert.ok(c, n);
    return c;
  },
  out = (n) => JSON.parse(outputs.get(n));
assert.equal(a.materials.length, 96);
assert.equal(new Set(a.materials.map((m) => m.label)).size, 96);
const materials = new Map(a.materials.map((m) => [m.label, unpack(m)])),
  material = (n) => {
    assert.ok(materials.has(n), n);
    return materials.get(n);
  };
assert.equal(a.inputs.length, 18);
assert.equal(new Set(a.inputs.map((i) => i.file)).size, 18);
assert.equal(a.inputs.filter((i) => i.group === "original11").length, 11);
assert.equal(a.inputs.filter((i) => i.group === "new7").length, 7);
for (const i of a.inputs) {
  const b = unpack(i);
  assert.deepEqual(b, material("B-input/" + i.file));
  if (process.argv.includes("--inputs"))
    assert.deepEqual(fs.readFileSync(path.join(root, i.file)), b);
}
assert.equal(a.oracle.designBytes, 371090);
assert.equal(
  a.oracle.designSha256,
  "fa6f4f47cc7003092c793ed1f78d03fd08bbc23f957d2b34e5fe0fd5b7444065",
);
assert.equal(sha(material("product/docs/DESIGN.md")), a.oracle.designSha256);
assert.deepEqual(
  a.inventory.q1.cases,
  q1Cases.map(({ run, ...c }) => c),
);
assert.equal(a.inventory.q1.count, 6);
assert.deepEqual(
  a.inventory.core.cases,
  coreCases.map(({ run, ...c }) => c),
);
assert.equal(a.inventory.core.count, 8);
const checkPassed = (n, r, inventory) => {
  assert.equal(capture(n).exit_code, 0);
  assert.equal(r.exitCode, 0);
  for (const k of ["planned", "executed", "passed"])
    assert.equal(r[k], inventory.length, n + "/" + k);
  for (const k of ["failed", "blocked", "skipped"])
    assert.equal(r[k], 0, n + "/" + k);
  assert.deepEqual(
    r.results.map((x) => x.id),
    inventory.map((x) => x.id),
  );
  assert.ok(r.results.every((x) => x.pass));
};
for (const [n, key, inventory] of [
  ["original121-fixed", "original", cases],
  ["new-q1-fixed", "q1", q1Cases],
  ["new-core-fixed", "core", coreCases],
]) {
  const r = out(n);
  assert.deepEqual(a.summary[key], r);
  checkPassed(n, r, inventory);
}
for (const [i, r] of a.summary.core.results.entries()) {
  const d = r.details;
  assert.equal(d.metadataAddresses.length, 5);
  assert.equal(new Set(d.metadataAddresses.map((x) => x.ref)).size, 5);
  assert.equal(d.confirms, i % 2 === 0 ? 12 : 8);
  assert.deepEqual(d.pageCounts, i % 2 === 0 ? [1, 1, 1, 1, 1] : [5]);
  assert.deepEqual(
    d.cleanup.map((c) => c.step),
    ["nav", "selection", "client", "wire", "exit", "owned generated fixture"],
  );
  assert.ok(d.cleanup.every((c) => c.pass));
}
const types = out("original37-fixed");
assert.deepEqual(a.summary.types, types);
assert.equal(capture("original37-fixed").exit_code, 0);
assert.deepEqual(types.positive, []);
assert.equal(types.executedNegative, 37);
assert.equal(types.blockedNegative, 0);
assert.equal(types.skipped, 0);
assert.deepEqual(
  types.results.map((r) => r.id),
  negatives.map((n) => n[0]),
);
for (const r of types.results)
  assert.ok(r.diagnostics.some((d) => d.code !== 2307));
for (const [n, key, count] of [
  ["frozen-baseline-q1", "baselineQ1", 6],
  ["frozen-baseline-core", "baselineCore", 8],
  ["original121-old-baseline", "baseline121", 121],
]) {
  const r = out(n);
  assert.deepEqual(a.summary[key], r);
  assert.equal(capture(n).exit_code, 1);
  assert.equal(r.stage, "public-capability");
  assert.equal(r.planned, count);
  assert.equal(r.executed, 0);
  assert.equal(r.passed, 0);
  assert.equal(r.blocked, count);
  assert.equal(r.skipped, 0);
  assert.deepEqual(r.results, []);
  assert.match(
    r.error.message,
    /missing production SourceNavigationModel\.createCandidateAction/,
  );
}
const oldTypes = out("original37-old-baseline");
assert.deepEqual(a.summary.baseline37, oldTypes);
assert.equal(capture("original37-old-baseline").exit_code, 1);
assert.equal(oldTypes.executedNegative, 0);
assert.ok(oldTypes.positive.length > 0);
for (const [n, count] of [
  ["original6-facility", 6],
  ["baseline-stack-and-scope-facility", 7],
]) {
  const s = outputs.get(n).toString();
  assert.equal(capture(n).exit_code, 0);
  for (const [key, num] of [
    ["tests", count],
    ["pass", count],
    ["fail", 0],
    ["skipped", 0],
    ["cancelled", 0],
  ])
    assert.match(s, new RegExp(key + " " + num + "\\b"));
}
const full = JSON.parse(material("evidence/full-web-summary.json")),
  c = capture("full-web-independent");
assert.deepEqual(a.standardWeb, full);
assert.equal(c.exit_code, 0);
assert.equal(full.exit, 0);
assert.equal(full.stdoutBytes, c.stdout_bytes);
assert.equal(full.sha256, c.stdout_sha256);
assert.deepEqual(full.command, c.command);
assert.ok(c.command.includes("test:independent"));
assert.equal(full.reports.length, 36);
assert.deepEqual(
  full.tests.map((x) => x.tests),
  [810, 13, 8, 5, 3, 36, 4, 12, 2],
);
for (const t of full.tests) {
  for (const [key, num] of [
    ["pass", t.tests],
    ["fail", 0],
    ["skipped", 0],
    ["cancelled", 0],
  ])
    assert.match(t.tail, new RegExp(key + " " + num + "\\b"));
}
const controls = new Set([
  "B fixture-controls-NOT-SourceView",
  "B20 facility-NOT-SourceView",
]);
for (const r of full.reports) {
  assert.equal(r.exitCode, 0);
  if ("skipped" in r) assert.equal(r.skipped, 0);
  if ("failed" in r) assert.equal(r.failed, 0);
  if ("blocked" in r) assert.equal(r.blocked, 0);
  if ("executedNegative" in r)
    assert.equal(r.executedNegative, r.plannedNegative);
  if ("executed" in r) {
    assert.equal(r.executed, controls.has(r.kind) ? 0 : r.planned);
    if ("passed" in r)
      assert.equal(r.passed, controls.has(r.kind) ? 0 : r.planned);
  }
}
const rawFull = outputs.get("full-web-independent").toString();
const parsed = [];
for (const match of rawFull.matchAll(/^\{/gm)) {
  const begin = match.index;
  let depth = 0,
    string = false,
    escape = false;
  for (let i = begin; i < rawFull.length; i++) {
    const ch = rawFull[i];
    if (string) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') string = false;
    } else if (ch === '"') string = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        parsed.push(JSON.parse(rawFull.slice(begin, i + 1)));
      } catch {}
      break;
    }
  }
}
assert.deepEqual(
  full.reports,
  parsed.filter(
    (o) => o.kind && ("planned" in o || "plannedNegative" in o || "count" in o),
  ),
);
assert.deepEqual(
  full.tests,
  [...rawFull.matchAll(/(?:ℹ |# )tests (\d+)/g)].map((m) => ({
    tests: Number(m[1]),
    tail: rawFull.slice(m.index, m.index + 180),
  })),
);
assert.ok(rawFull.includes('"planned": 121'));
assert.ok(rawFull.includes('"executedNegative": 37'));
assert.ok(rawFull.includes("tests 810"));
const runtime = JSON.parse(material("evidence/runtime-meta.json"));
assert.deepEqual(a.runtime, runtime);
assert.equal(runtime.product, a.product);
assert.equal(runtime.ownProductionCommands, 27);
assert.equal(runtime.mainDeclarationsByteEqual, true);
assert.equal(runtime.declarations.length, 49);
assert.equal(runtime.dependencyFieldsUnchanged, true);
assert.deepEqual(runtime.configuration, {
  buildType: "RelWithDebInfo",
  sanitizer: "OFF",
  observer: "ON",
  m3: "ON",
});
assert.equal(
  runtime.binary.sha256,
  "09be55869499150109dd57eb93a5ebf52213f2a71afd1f439325a2362b3acc48",
);
assert.equal(runtime.binary.bytes, 9327560);
assert.equal(
  a.materials.filter((m) => m.label.startsWith("declaration/")).length,
  49,
);
const deps = JSON.parse(material("evidence/dependencies.json"));
assert.equal(deps.dependencies.length, 6);
assert.equal(deps.sourceFiles, 2403);
assert.equal(deps.allSourcesEqualHistoricalPins, true);
assert.equal(sha(material("dependency-historical-pins")), deps.referenceSha256);
for (const c of deps.commands) assert.equal(c.status, 0);
for (const n of [
  "core-cold-configure",
  "core-cold-build",
  "web-check-fixed",
  "runtime-metadata-corrected",
  "dependency-source-pins",
  "final-pre-seal-protection",
])
  assert.equal(capture(n).exit_code, 0);
assert.doesNotMatch(
  outputs.get("core-cold-build").toString(),
  /\bwarning:|\berror:/i,
);
assert.equal(capture("runtime-metadata").exit_code, 1);
assert.match(outputs.get("runtime-metadata").toString(), /own\.every/);
assert.ok(material("evidence/runtime-meta-v1.mjs").length);
const p = out("final-pre-seal-protection");
assert.deepEqual(a.protection, p);
assert.equal(p.protected, true);
assert.deepEqual(p.counts, [1184, 793, 1166, 1161]);
assert.equal(p.declarations, 49);
assert.equal(p.binaries.length, 3);
assert.equal(p.BHead, a.freeze);
assert.equal(p.BStatus, "");
assert.deepEqual(
  JSON.parse(material("evidence/initial.json")).log,
  p.logPrefix,
);
const helperRaw = material("helper/audit.json");
assert.equal(
  sha(helperRaw),
  "b4f3ea41fe1156dffae14a34123a444615dc36735060fca5096527b2275e3fcd",
);
const h = JSON.parse(helperRaw);
assert.equal(h.fixed, a.product);
assert.equal(h.exitCode, 0);
assert.deepEqual(h.violations, []);
assert.equal(h.commands.length, 18);
assert.equal(h.finalSixteen.length, 32);
assert.equal(new Set(h.finalSixteen.map((r) => r.file)).size, 16);
for (const i of h.imports)
  assert.equal(i.exactPathModeTypeBeforeAfterBlobEquivalence, true);
for (const c of h.commands) {
  assert.equal(c.status, 0);
  for (const k of ["stdout", "stderr"]) unpack(c[k], "gzipBase64");
}
assert.ok(a.limits.length >= 10);
console.log(
  JSON.stringify({
    verified: true,
    productExecuted: 0,
    archiveBytes: raw.length,
    archiveSha256: sha(raw),
    captures: 41,
    materials: 96,
    inputs: 18,
    original121Passed: true,
    types37Passed: true,
    q1Passed: 6,
    corePassed: 8,
    standardWebPassed: true,
    notFullCppCTest: true,
    notM5Release: true,
  }),
);
