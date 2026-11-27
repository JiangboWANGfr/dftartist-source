// B18 evidence auditor: executes zero product semantics.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../../../..");
const a = JSON.parse(
  fs.readFileSync(root + "/docs/m5_b_c87_gate_recheck.json"),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(a.product.commit, "cc1191ae842974b7e1b1aee7d34cd776886e0c59");
assert.equal(a.tests.freeze, "12d793a52681d889d22541009ca8fa83ea62ea59");
assert.equal(a.tests.base, "3313057b47904419c64b46b25bc5850398049e9c");
assert.equal(a.result.narrowGateAccepted, true);
assert.equal(a.result.C87FormalClosure, "C owns; not B");
for (const key of [
  "nativeBuilt",
  "nativeExecuted",
  "fullIndependentRerun",
  "wholeM5Accepted",
])
  assert.equal(a.result[key], false);
const raws = new Map(),
  oldRaw = new Map();
let blocks = 0,
  rawBytes = 0,
  gzipBytes = 0;
function unpack(z64, n, h) {
  const z = Buffer.from(z64, "base64"),
    b = gunzipSync(z);
  assert.equal(b.length, n);
  assert.equal(sha(b), h);
  blocks++;
  rawBytes += b.length;
  gzipBytes += z.length;
  return b;
}
const expected = [
  "checkout",
  "provenance",
  "install",
  "environment",
  "frozen_inventory",
  "historical_b17",
  "web_check",
  "viewmodel_unset",
  "navigation_controls",
  "coexistence_8",
  "c87_four",
  "navigation_gate_23",
  "protect_after_tests",
  "frozen_format",
  "frozen_diffcheck",
  "analysis",
]
  .map((s) => "b18_" + s)
  .sort();
assert.deepEqual(a.captures.map((c) => c.name).sort(), expected);
for (const c of a.captures) {
  assert.equal(c.exit_code, 0, c.name);
  assert.equal(c.capture_complete, true);
  assert.ok(c.command.length && c.cwd && !Number.isNaN(Date.parse(c.utc)));
  assert.equal(raws.has(c.name), false);
  raws.set(
    c.name,
    unpack(c.stdout_gzip_base64, c.stdout_bytes, c.stdout_sha256).toString(),
  );
}
assert.deepEqual(a.historicalCaptures.map((c) => c.name).sort(), [
  "b17_c87_baseline",
  "b17_viewmodel_unset",
]);
for (const c of a.historicalCaptures) {
  assert.equal(c.exit_code, 1);
  assert.equal(c.capture_complete, true);
  oldRaw.set(
    c.name,
    unpack(c.stdout_gzip_base64, c.stdout_bytes, c.stdout_sha256).toString(),
  );
}
function stats(s) {
  return [...s.matchAll(/^ℹ tests (\d+)$/gm)].map((m) => {
    const part = s.slice(m.index, s.indexOf("ℹ duration_ms", m.index));
    const get = (k) =>
      Number(part.match(new RegExp("ℹ " + k + " (\\d+)"))?.[1]);
    return {
      tests: Number(m[1]),
      pass: get("pass"),
      fail: get("fail"),
      skip: get("skipped"),
      cancelled: get("cancelled"),
      todo: get("todo"),
    };
  });
}
const pass = (n) => ({
  tests: n,
  pass: n,
  fail: 0,
  skip: 0,
  cancelled: 0,
  todo: 0,
});
const receipts = (s) =>
  [...s.matchAll(/^B-C87-RECEIPT (\{[^\n]*\})$/gm)].map((m) =>
    JSON.parse(m[1]),
  );
const rows = receipts(raws.get("b18_c87_four")),
  oldRows = receipts(oldRaw.get("b17_c87_baseline"));
const ids = ["unset", "missing-root", "old-built-root", "current-root"].map(
  (s) => "B-C87-viewmodel-" + s,
);
assert.deepEqual(
  rows.map((r) => r.id),
  ids,
);
assert.deepEqual(
  oldRows.map((r) => r.id),
  ids,
);
assert.deepEqual(
  rows.map((r) => r.status),
  [0, 0, 0, 0],
);
assert.deepEqual(
  oldRows.map((r) => r.status),
  [1, 1, 1, 0],
);
const command = a.captures.find((c) => c.name === "b18_c87_four").command;
const oldRoot = command
  .find((v) => v.startsWith("HIER_B_OLD_PRODUCT_ROOT="))
  ?.slice("HIER_B_OLD_PRODUCT_ROOT=".length);
assert.ok(oldRoot && path.isAbsolute(oldRoot));
assert.notEqual(oldRoot, a.product.root);
assert.equal(rows[0].envRoot, null);
assert.equal(rows[2].envRoot, oldRoot);
assert.equal(rows[3].envRoot, a.product.root);
assert.equal(path.basename(rows[1].envRoot), "does-not-exist");
assert.match(
  path.basename(path.dirname(rows[1].envRoot)),
  /^hier-b-c87-viewmodel-/,
);
assert.equal(path.dirname(path.dirname(rows[1].envRoot)), rows[1].cwd);
assert.ok(a.product.root.includes(" ") && a.product.root.includes("中文"));
for (const r of rows) {
  assert.equal(r.oldProduct, oldRoot);
  assert.equal(r.cwd, rows[0].cwd);
  assert.equal(r.signal, null);
  assert.equal(r.toolError, null);
  assert.notEqual(r.cwd, a.product.root);
  assert.deepEqual(r.command, [
    "/opt/homebrew/bin/npm",
    "--prefix",
    a.product.root + "/web",
    "run",
    "test:viewmodel",
  ]);
  assert.deepEqual(stats(r.stdout + "\n" + r.stderr), [pass(24)]);
}
for (const [i, r] of oldRows.entries()) {
  assert.equal(r.signal, null);
  assert.equal(r.toolError, null);
  assert.deepEqual(stats(r.stdout + "\n" + r.stderr), [
    { ...pass(24), pass: i === 3 ? 24 : 23, fail: i === 3 ? 0 : 1 },
  ]);
}
assert.deepEqual(stats(oldRaw.get("b17_c87_baseline")), [
  { ...pass(4), pass: 1, fail: 3 },
]);
assert.deepEqual(stats(oldRaw.get("b17_viewmodel_unset")), [
  { ...pass(24), pass: 23, fail: 1 },
]);
for (const [name, n] of Object.entries({
  b18_c87_four: 4,
  b18_viewmodel_unset: 24,
  b18_navigation_controls: 8,
  b18_navigation_gate_23: 23,
  b18_coexistence_8: 8,
}))
  assert.deepEqual(stats(raws.get(name)), [pass(n)]);
const direct = a.captures.find((c) => c.name === "b18_viewmodel_unset");
assert.ok(
  direct.command.includes("-u") &&
    direct.command.includes("HIER_B_PRODUCT_ROOT"),
);
assert.equal(
  direct.command.includes("HIER_B_PRODUCT_ROOT=" + a.product.root),
  false,
);
assert.notEqual(direct.cwd, a.product.root);
const json = (n) => JSON.parse(raws.get(n));
const analysis = json("b18_analysis");
assert.deepEqual(
  analysis.receipts.map((r) => r.root),
  rows.map((r) => r.envRoot),
);
assert.deepEqual(
  analysis.receipts.map((r) => r.status),
  [0, 0, 0, 0],
);
assert.equal(analysis.narrowGateAccepted, true);
assert.equal(analysis.historicalRed.preserved, true);
const inv = json("b18_frozen_inventory");
assert.equal(inv.count, 4);
assert.equal(inv.cases.length, 4);
assert.ok(inv.cases.every((r) => r.input && r.expected && r.basis));
assert.equal(
  sha(Buffer.from(JSON.stringify(inv.cases))),
  a.tests.inventorySha256,
);
const p = json("b18_provenance"),
  protectedState = json("b18_protect_after_tests");
assert.equal(p.fixed, a.product.commit);
assert.equal(p.previous, a.product.previous);
assert.equal(p.productionChanged, false);
assert.equal(p.implementationSourceRead, false);
assert.equal(p.BImports, 9);
assert.equal(p.changedPaths.length, 12);
assert.deepEqual(p.treePins, a.treePins);
assert.equal(a.treePins.length, 4);
assert.equal(protectedState.protected, true);
assert.equal(protectedState.pureProduct, true);
assert.equal(protectedState.mainStaged, 0);
assert.deepEqual(
  protectedState.roots.map((r) => r.files),
  [989, 670, 971, 946],
);
assert.equal(protectedState.mainDeclarations, 45);
assert.equal(protectedState.oldDeclarations, 42);
assert.equal(protectedState.currentDeclarations, 45);
assert.equal(protectedState.initialLog.preserved, true);
const historical = json("b18_historical_b17");
assert.equal(historical.archiveVerified, true);
assert.equal(historical.BRuntimeAccepted, false);
assert.equal(historical.standardGatePassed, 1);
assert.equal(historical.standardGateFailed, 3);
assert.equal(historical.semanticsExecutedByVerifier, 0);
assert.equal(historical.productChecks, 0);
let checkedInputs = 0,
  initial,
  incidentCount = 0;
for (const m of a.materials) {
  const raw = unpack(m.gzip_base64, m.bytes, m.sha256);
  if (m.root === "B-tools" && m.path === "initial.json")
    initial = JSON.parse(raw);
  if (m.root === "B-tools" && m.path === "oversize-capture-incident.json") {
    const incidents = JSON.parse(raw);
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].name, "b18_initial_oversize_capture");
    assert.match(incidents[0].diagnostic, /truncated/);
    incidentCount = incidents.length;
  }
  if (process.argv.includes("--inputs") && m.root === "B-tests") {
    const b = m.git
      ? execFileSync("git", ["show", m.git + ":" + m.path], { cwd: root })
      : fs.readFileSync(path.join(root, m.path));
    assert.equal(b.length, m.bytes, m.path);
    assert.equal(sha(b), m.sha256, m.path);
    checkedInputs++;
  }
}
assert.ok(initial);
assert.equal(incidentCount, 1);
assert.deepEqual(
  initial.roots.map((r) => r.files.length),
  [989, 670, 971, 946],
);
assert.equal(initial.log.sha256, protectedState.initialLog.sha256);
assert.deepEqual(
  a.publicDeclarations,
  initial.mainDeclarations.map(({ file, bytes, sha256 }) => ({
    file,
    bytes,
    sha256,
  })),
);
assert.equal(a.publicDeclarations.length, 45);
let productChecks = 0;
if (process.argv.includes("--product")) {
  assert.ok(process.env.HIER_B_PRODUCT_ROOT);
  const product = fs.realpathSync(process.env.HIER_B_PRODUCT_ROOT);
  const git = (args) =>
    execFileSync("git", args, { cwd: product, encoding: "utf8" }).trim();
  assert.equal(git(["rev-parse", "HEAD"]), a.product.commit);
  assert.equal(git(["status", "--porcelain"]), "");
  for (const t of a.treePins)
    assert.equal(git(["rev-parse", "HEAD:" + t.file]), t.oid);
  for (const f of [...initial.roots[2].files, ...a.publicDeclarations]) {
    const b = fs.readFileSync(path.join(product, f.file));
    assert.equal(b.length, f.bytes, f.file);
    assert.equal(sha(b), f.sha256, f.file);
    productChecks++;
  }
}
console.log(
  JSON.stringify({
    archiveVerified: true,
    captures: a.captures.length,
    historicalCaptures: a.historicalCaptures.length,
    materials: a.materials.length,
    publicDeclarations: 45,
    blocks,
    rawBytes,
    gzipBytes,
    checkedInputs,
    productChecks,
    frozenCases: 4,
    passed: 4,
    failed: 0,
    skipped: 0,
    childTestsEach: 24,
    directUnset: 24,
    controls: 8,
    wiringFacilities: 23,
    coexistence: 8,
    historicalCases: 4,
    historicalPassed: 1,
    historicalFailed: 3,
    captureTransportIncidents: incidentCount,
    nativeBuilt: false,
    nativeExecuted: false,
    fullIndependentRerun: false,
    wholeM5Accepted: false,
    semanticsExecutedByVerifier: 0,
  }),
);
