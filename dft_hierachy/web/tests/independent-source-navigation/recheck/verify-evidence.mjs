// B17 independent runtime evidence audit only: executes zero product semantics.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../../../..");
const a = JSON.parse(
  fs.readFileSync(
    path.join(root, "docs/m5_b_source_navigation_runtime_recheck.json"),
  ),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(a.product.commit, "a7587b6fb3e8c57675021cb14ab50822aef5fa08");
assert.equal(
  a.tests.originalFreeze,
  "bdbc2c7fa2fd86c895e05aa9e3bfc25d401d8085",
);
assert.equal(a.tests.readyFreeze, "0efe853560ade65d1c7252fd214998df6c2ecdb1");
assert.equal(
  a.tests.supplementFreeze,
  "b5671a46e87d877b67b89f938f35e4c1e6acfc0f",
);
assert.equal(
  a.tests.standardGateFreeze,
  "12d793a52681d889d22541009ca8fa83ea62ea59",
);
assert.equal(a.result.BRuntimeAccepted, false);
assert.equal(a.result.functionalFreezePassed, true);
assert.equal(a.result.standardGateAccepted, false);
assert.equal(a.result.blockingIssue, "C-87 open; closure belongs to C");
assert.equal(a.result.wholeM5Accepted, false);
const raws = new Map();
let blocks = 0,
  rawBytes = 0,
  gzipBytes = 0;
function unpack(z64, n, h) {
  const z = Buffer.from(z64, "base64"),
    b = gunzipSync(z);
  assert.equal(b.length, n);
  assert.equal(sha(b), h);
  blocks++;
  rawBytes += n;
  gzipBytes += z.length;
  return b;
}
assert.equal(a.captures.length, 70);
const auditReds = new Set([
  "b17_warning_comparison",
  "b17_full_statistics_verified",
  "b17_viewmodel_unset",
  "b17_c87_baseline",
]);
for (const c of a.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(c.command.length && c.cwd && !Number.isNaN(Date.parse(c.utc)));
  assert.equal(raws.has(c.name), false);
  raws.set(
    c.name,
    unpack(c.stdout_gzip_base64, c.stdout_bytes, c.stdout_sha256).toString(),
  );
  assert.equal(c.exit_code, auditReds.has(c.name) ? 1 : 0, c.name);
}
assert.deepEqual(
  a.captures
    .filter((c) => c.exit_code !== 0)
    .map((c) => c.name)
    .sort(),
  [...auditReds].sort(),
);
const json = (n) => JSON.parse(raws.get(n));
const reports = function (raw) {
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
function model(r, n) {
  assert.equal(r.exitCode, 0);
  assert.equal(r.executed, n);
  assert.equal(r.passed, n);
  assert.equal(r.failed, 0);
  assert.equal(r.skipped, 0);
  assert.equal(r.results.length, n);
  assert.ok(r.results.every((x) => x.pass));
}
for (const [n, k] of [
  ["b17_navigation_310", 310],
  ["b17_navigation_core_10", 10],
  ["b17_old_document_306", 306],
  ["b17_old_candidates_281", 281],
  ["b17_old_position_258", 258],
])
  model(json(n), k);
for (const [n, k] of [
  ["b17_navigation_46", 46],
  ["b17_old_document_types", 34],
  ["b17_old_candidates_types", 47],
  ["b17_old_position_types", 32],
]) {
  const r = json(n);
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.positive, []);
  assert.equal(r.executedNegative, k);
  assert.equal(r.skipped, 0);
  assert.equal(r.results.length, k);
  assert.ok(
    r.results.every((x) =>
      x.diagnostics.some((d) => ![2305, 2307].includes(d.code)),
    ),
  );
}
function nodeStats(s) {
  return [...s.matchAll(/^ℹ tests (\d+)$/gm)].map((m) => {
    const end = s.indexOf("ℹ duration_ms", m.index),
      part = s.slice(m.index, end),
      get = (k) => Number(part.match(new RegExp("ℹ " + k + " (\\d+)"))?.[1]);
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
function nodePass(name, n) {
  const rows = nodeStats(raws.get(name));
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.tests, n);
  assert.equal(r.pass, n);
  for (const k of ["fail", "skip", "cancelled", "todo"]) assert.equal(r[k], 0);
}
for (const [n, k] of [
  ["b17_coexistence_baseline", 8],
  ["b17_navigation_gate_23", 23],
  ["b17_old_wrapper_facilities", 41],
  ["b17_nav_standard_controls", 8],
  ["b17_client_tests", 47],
  ["b17_viewmodel_tests", 24],
  ["b17_sdk_core_integration", 3],
])
  nodePass(n, k);
const modelStd = reports(raws.get("b17_nav_standard_model"));
assert.equal(modelStd.length, 2);
model(modelStd[1], 310);
assert.equal(modelStd[0].executedNegative, 46);
assert.deepEqual(modelStd[0].positive, []);
const coreStd = reports(raws.get("b17_nav_standard_core"));
assert.equal(coreStd.length, 1);
model(coreStd[0], 10);
const full = raws.get("b17_full_independent_2511"),
  all = reports(full),
  semantic = all.filter(
    (r) =>
      Array.isArray(r.results) &&
      (Number.isInteger(r.executed) || Number.isInteger(r.executedCases)),
  );
assert.deepEqual(
  semantic.map((r) => r.executed ?? r.executedCases),
  [26, 281, 5, 99, 25, 12, 40, 6, 306, 4, 14, 281, 13, 258, 11, 310, 10],
);
for (const r of semantic) {
  assert.equal(r.exitCode, 0);
  assert.equal(r.results.length, r.executed ?? r.executedCases);
  assert.ok(r.results.every((x) => x.pass));
  assert.equal(r.skipped ?? r.skippedCases, 0);
}
const nr = nodeStats(full);
assert.deepEqual(
  nr.map((r) => r.tests),
  [810, 13, 8],
);
assert.ok(
  nr.every(
    (r) =>
      r.tests === r.pass && r.fail === 0 && r.skip === 0 && r.cancelled === 0,
  ),
);
assert.equal(
  semantic.reduce((n, r) => n + (r.executed ?? r.executedCases), 0) + 810,
  2511,
);
assert.equal(json("b17_full_statistics_final").productTotal, 2511);
assert.match(raws.get("b17_ctest_inventory"), /Total Tests: 75/);
assert.match(
  raws.get("b17_ctest"),
  /100% tests passed, 0 tests failed out of 75/,
);
const schema = reports(raws.get("b17_protocol_schema"))[0];
assert.equal(schema.checks, 655);
assert.equal(schema.passed, 655);
assert.equal(schema.failed, 0);
assert.equal(schema.skipped, 0);
assert.equal(schema.parameterNormalization.checks, 27);
assert.deepEqual(schema.parameterNormalization.failed, []);
assert.deepEqual(
  json("b17_dependency_sources"),
  json("b17_dependency_sources_after"),
);
const n = json("b17_native_build_metadata");
assert.equal(n.bytes, 9325112);
assert.equal(
  n.sha256,
  "cdb0b7fe5b5a282ef7a18f915be14e63a8ffe9f5164e31d9526843bd02fcd926",
);
assert.equal(n.warningLines, 6);
assert.equal(n.compilerWarnings, 0);
const warnings = json("b17_warning_scope_audit");
assert.equal(warnings.comparableFullBuildBaseline, false);
assert.equal(warnings.coreTreeUnchanged, true);
const p = json("b17_final_protection"),
  initial = json("b17_initial_protection");
assert.deepEqual(
  p.roots.map((r) => r.protectedFiles),
  initial.roots.map((r) => r.files.length),
);
assert.equal(p.mainDeclarationsPreserved, 45);
assert.equal(p.productDeclarationsMatchMain, 45);
assert.equal(p.oldBTestFiles, 254);
assert.equal(p.thirdPartyFiles, 2403);
assert.equal(p.originalLog.preserved, true);
assert.equal(p.mainStaged, 0);
assert.deepEqual(p.productOverlay, []);
assert.equal(p.nativeBuilt, true);
assert.equal(p.nativeExecuted, true);
assert.equal(a.publicPins.length, 52);
assert.deepEqual(a.publicPins, p.publicPins);
assert.deepEqual(a.artifacts, p.artifacts);
const compat = json("b17_public_compatibility");
assert.equal(compat.unchanged, 41);
assert.equal(compat.oldBarrelRetained, true);
assert.equal(compat.newTotal, 45);
const extra = json("b17_extra_model_inventory"),
  gate = json("b17_extra_gate_inventory");
assert.equal(extra.count, 8);
assert.equal(gate.count, 23);
assert.equal(
  new Set([...extra.cases, ...gate.cases].map((r) => r.id)).size,
  31,
);
assert.ok(
  [...extra.cases, ...gate.cases].every(
    (r) => r.input !== undefined && r.expected && r.basis,
  ),
);
assert.equal(
  sha(Buffer.from(JSON.stringify([extra.cases, gate.cases]))),
  a.tests.supplementInventorySha256,
);
// The successful explicit-current-root run is only a control, not a fix.
const c87 = json("b17_c87_analysis");
assert.equal(c87.issue, "C-87");
assert.equal(c87.fixed, a.product.commit);
assert.equal(c87.cases, 4);
assert.equal(c87.passed, 1);
assert.equal(c87.failed, 3);
assert.equal(c87.skipped, 0);
assert.equal(c87.standardGateAccepted, false);
assert.equal(c87.environmentControlIsNotFix, true);
const receipts = [
  ...raws.get("b17_c87_baseline").matchAll(/^B-C87-RECEIPT (\{[^\n]*\})$/gm),
].map((m) => JSON.parse(m[1]));
assert.deepEqual(
  receipts.map((r) => r.id),
  ["unset", "missing-root", "old-built-root", "current-root"].map(
    (id) => "B-C87-viewmodel-" + id,
  ),
);
assert.deepEqual(
  receipts.map((r) => r.status),
  [1, 1, 1, 0],
);
const outer = a.captures.find((c) => c.name === "b17_c87_baseline");
const oldRoot = outer.command
  .find((v) => v.startsWith("HIER_B_OLD_PRODUCT_ROOT="))
  ?.slice("HIER_B_OLD_PRODUCT_ROOT=".length);
assert.ok(oldRoot && path.isAbsolute(oldRoot));
assert.notEqual(oldRoot, a.product.root);
assert.equal(receipts[0].envRoot, null);
assert.equal(receipts[2].envRoot, oldRoot);
assert.equal(receipts[3].envRoot, a.product.root);
const missing = receipts[1].envRoot;
assert.equal(path.basename(missing), "does-not-exist");
assert.match(path.basename(path.dirname(missing)), /^hier-b-c87-viewmodel-/);
assert.equal(path.dirname(path.dirname(missing)), receipts[1].cwd);
assert.ok(
  receipts.every((r) => r.oldProduct === oldRoot && r.cwd === receipts[0].cwd),
);
assert.deepEqual(
  c87.receipts.map((r) => r.root),
  receipts.map((r) => r.envRoot),
);
assert.deepEqual(
  c87.receipts.map((r) => r.status),
  receipts.map((r) => r.status),
);
for (const r of receipts) {
  assert.equal(r.signal, null);
  assert.equal(r.toolError, null);
  assert.deepEqual(r.command.slice(1), [
    "--prefix",
    a.product.root + "/web",
    "run",
    "test:viewmodel",
  ]);
  const [s] = nodeStats(r.stdout + "\n" + r.stderr);
  assert.deepEqual(s, {
    tests: 24,
    pass: r.status === 0 ? 24 : 23,
    fail: r.status === 0 ? 0 : 1,
    skip: 0,
    cancelled: 0,
    todo: 0,
  });
}
assert.deepEqual(nodeStats(raws.get("b17_c87_baseline")), [
  { tests: 4, pass: 1, fail: 3, skip: 0, cancelled: 0, todo: 0 },
]);
assert.deepEqual(nodeStats(raws.get("b17_viewmodel_unset")), [
  { tests: 24, pass: 23, fail: 1, skip: 0, cancelled: 0, todo: 0 },
]);
const inv = json("b17_c87_inventory");
assert.equal(inv.count, 4);
assert.ok(
  inv.cases.every((r) => r.input !== undefined && r.expected && r.basis),
);
assert.equal(
  sha(Buffer.from(JSON.stringify(inv.cases))),
  a.tests.standardGateInventorySha256,
);
const finalProtection = json("b17_post_c87_protection");
assert.deepEqual(finalProtection.publicPins, a.publicPins);
assert.deepEqual(finalProtection.artifacts, a.artifacts);
assert.equal(finalProtection.originalLog.preserved, true);
let checkedInputs = 0;
for (const m of a.materials) {
  unpack(m.gzip_base64, m.bytes, m.sha256);
  if (m.path === "phase1-runtime-evidence.json") {
    const prior = JSON.parse(gunzipSync(Buffer.from(m.gzip_base64, "base64")));
    assert.equal(prior.result.BRuntimeAccepted, true); // historical functional stage only
    assert.equal(prior.captures.length, 52);
    assert.deepEqual(prior.captures, a.captures.slice(0, 52));
    assert.equal(m.sha256, a.history.functionalStageSha256);
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
let productChecks = 0;
if (process.argv.includes("--product")) {
  assert.ok(process.env.HIER_B_PRODUCT_ROOT);
  const product = fs.realpathSync(process.env.HIER_B_PRODUCT_ROOT);
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: product,
      encoding: "utf8",
    }).trim(),
    a.product.commit,
  );
  for (const f of [
    ...initial.roots[2].files,
    ...a.publicPins,
    ...a.artifacts,
  ]) {
    const b = fs.readFileSync(path.join(product, f.file));
    assert.equal(b.length, f.bytes, f.file);
    assert.equal(sha(b), f.sha256, f.file);
    productChecks++;
  }
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], {
      cwd: product,
      encoding: "utf8",
    }).trim(),
    "",
  );
}
console.log(
  JSON.stringify({
    archiveVerified: true,
    captures: a.captures.length,
    materials: a.materials.length,
    pins: 52,
    artifactPins: a.artifacts.length,
    blocks,
    rawBytes,
    gzipBytes,
    checkedInputs,
    productChecks,
    model: 310,
    types: 46,
    core: 10,
    coexistence: 8,
    gateFacilities: 23,
    fullIndependent: 2511,
    ctest: 75,
    nativeWarnings: 6,
    compilerWarnings: 0,
    productSemanticFailures: 0,
    retainedAuditFailures: 2,
    BRuntimeAccepted: false,
    standardGateCases: 4,
    standardGatePassed: 1,
    standardGateFailed: 3,
    blockingIssue: "C-87",
    semanticsExecutedByVerifier: 0,
  }),
);
