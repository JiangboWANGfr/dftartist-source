// Historical B15 evidence audit, not product semantics or a substitute for C.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../../..");
const a = JSON.parse(
  fs.readFileSync(path.join(root, "docs/m5_b_source_navigation_freeze.json")),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(a.product.commit, "a02a20ca8e7e1a225b7d4d5b3db45c0cb2939e23");
assert.equal(a.tests.freeze, "bdbc2c7fa2fd86c895e05aa9e3bfc25d401d8085");
assert.deepEqual(a.clarifications, {
  ids: ["B-NAV-Q1", "B-NAV-Q2"],
  cIssue: "C-86",
  status: "open",
  frozen: false,
  countedAsSkipped: false,
});
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
assert.equal(a.captures.length, 37);
const expectedRed = new Set([
  "b15_navigation_baseline",
  "b15_core_baseline",
  "b15_navigation_public_types",
]);
for (const c of a.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(c.command.length && c.cwd && !Number.isNaN(Date.parse(c.utc)));
  assert.equal(raws.has(c.name), false);
  raws.set(
    c.name,
    unpack(c.stdout_gzip_base64, c.stdout_bytes, c.stdout_sha256).toString(),
  );
  assert.equal(c.exit_code, expectedRed.has(c.name) ? 1 : 0, c.name);
}
const json = (n) => JSON.parse(raws.get(n));
for (const [n, count] of [
  ["b15_navigation_baseline", 284],
  ["b15_core_baseline", 10],
]) {
  const r = json(n);
  assert.equal(r.planned, count);
  assert.equal(r.stage, "public-Navigation-capability");
  for (const k of ["executed", "passed", "failed", "skipped"])
    assert.equal(r[k], 0);
  assert.match(r.error.message, /missing public SourceNavigationModel/);
}
const publicTypes = json("b15_navigation_public_types");
assert.equal(publicTypes.executedNegative, 0);
assert.equal(publicTypes.skipped, 0);
assert.equal(publicTypes.positive.length, 6);
assert.ok(publicTypes.positive.every((d) => [2305, 2724].includes(d.code)));
for (const [n, count] of [
  ["b15_navigation_proposal_types", 46],
  ["b15_old_document_types", 34],
  ["b15_old_candidates_types", 47],
  ["b15_old_position_types", 32],
]) {
  const r = json(n);
  assert.deepEqual(r.positive, []);
  assert.equal(r.executedNegative, count);
  assert.equal(r.skipped, 0);
  assert.equal(r.results.length, count);
  assert.ok(
    r.results.every((x) =>
      x.diagnostics.some((d) => ![2305, 2307].includes(d.code)),
    ),
  );
}
for (const [n, count] of [
  ["b15_old_document", 306],
  ["b15_old_candidates", 281],
  ["b15_old_position", 258],
]) {
  const r = json(n);
  assert.equal(r.executed, count);
  assert.equal(r.passed, count);
  assert.equal(r.failed, 0);
  assert.equal(r.skipped, 0);
  assert.equal(r.results.length, count);
  assert.ok(r.results.every((x) => x.pass));
}
for (const [k, v] of [
  ["tests", 4],
  ["pass", 4],
  ["fail", 0],
  ["skipped", 0],
  ["cancelled", 0],
  ["todo", 0],
])
  assert.match(
    raws.get("b15_navigation_facility"),
    new RegExp("(?:ℹ|#) " + k + " " + v + "(?:\\n|$)"),
  );
const model = json("b15_frozen_inventory_model"),
  core = json("b15_frozen_inventory_core"),
  types = json("b15_frozen_inventory_types");
assert.equal(model.count, 284);
assert.equal(core.count, 10);
assert.equal(types.count, 46);
assert.equal(
  new Set([...model.cases, ...core.cases].map((x) => x.id)).size,
  294,
);
for (const r of [...model.cases, ...core.cases, ...types.cases])
  assert.ok(r.input !== undefined && r.expected && r.basis);
assert.equal(
  sha(Buffer.from(JSON.stringify([model.cases, core.cases, types.cases]))),
  a.tests.inventorySha256,
);
const protect = json("b15_final_protection");
assert.deepEqual(
  protect.roots.map((x) => x.protectedFiles),
  [947, 637, 929],
);
assert.equal(protect.mainDeclarationsPreserved, 42);
assert.equal(protect.productDeclarationsMatchMain, 42);
assert.equal(protect.oldBPreserved, 236);
assert.equal(protect.originalLog.preserved, true);
assert.deepEqual(protect.productOverlay, []);
assert.equal(protect.mainStaged, 0);
assert.equal(protect.nativeBuilt, false);
assert.equal(protect.nativeExecuted, false);
assert.deepEqual(a.publicPins, protect.publicPins);
assert.equal(a.publicPins.length, 47);
let checkedInputs = 0;
for (const m of a.materials) {
  unpack(m.gzip_base64, m.bytes, m.sha256);
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
  const p = fs.realpathSync(process.env.HIER_B_PRODUCT_ROOT);
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: p,
      encoding: "utf8",
    }).trim(),
    a.product.commit,
  );
  for (const f of [
    ...json("b15_initial_protection").roots[2].files,
    ...a.publicPins,
  ]) {
    const b = fs.readFileSync(path.join(p, f.file));
    assert.equal(b.length, f.bytes, f.file);
    assert.equal(sha(b), f.sha256, f.file);
    productChecks++;
  }
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], {
      cwd: p,
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
    pins: a.publicPins.length,
    blocks,
    rawBytes,
    gzipBytes,
    checkedInputs,
    productChecks,
    modelPlanned: 284,
    corePlanned: 10,
    newRuntimeExecuted: 0,
    newRuntimeSkipped: 0,
    publicTypes: "missing-six-exports",
    proposalNegativeControls: 46,
    facility: 4,
    oldDocument: 306,
    oldCandidates: 281,
    oldPosition: 258,
    oldTypes: [34, 47, 32],
    clarifications: a.clarifications,
    semanticsExecutedByVerifier: 0,
  }),
);
