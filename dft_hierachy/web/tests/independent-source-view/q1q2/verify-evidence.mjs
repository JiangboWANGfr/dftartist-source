// Verifies archived B20 evidence; never counts as product execution.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { cases, resolved } from "./cases.mjs";
const B = path.resolve(import.meta.dirname, "../../../.."),
  raw = fs.readFileSync(B + "/docs/m5_b_source_view_q1q2_freeze.json"),
  e = JSON.parse(raw),
  sha = (b) => createHash("sha256").update(b).digest("hex"),
  git = (r, a) => execFileSync("git", a, { cwd: r, encoding: "utf8" }).trim();
assert.equal(e.format, "hier-b20-q1q2-evidence-v1");
assert.equal(e.cycle, 20);
assert.equal(e.fixed, "de11aa25bb6f0501d499342621c20acef87350fc");
assert.equal(e.freeze, "f79827e75b733db7036e213943a3c627b800bcd2");
assert.equal(e.firstFreeze, "6ffef4e9e10f5fcf702c079650dadaf537916659");
assert.deepEqual(
  e.oracle.questions.map((q) => q.id),
  resolved,
);
assert.ok(e.oracle.questions.every((q) => q.status === "closed"));
assert.equal(e.oracle.productionPassed, false);
assert.equal(cases.length, 19);
const blocks = new Map();
for (const [h, b] of Object.entries(e.blocks)) {
  const v = gunzipSync(Buffer.from(b.gzip_base64, "base64"));
  assert.equal(v.length, b.bytes);
  assert.equal(sha(v), h);
  blocks.set(h, v);
}
assert.equal(blocks.size, 62);
assert.equal(e.materials.length, 61);
const initial = JSON.parse(blocks.get(e.initial.block));
assert.equal(e.initial.sha256, e.initial.block);
assert.equal(
  e.initial.sha256,
  "f7a1a609ec18ae448ecd0c3af0121abf4045638ec01f7ebe05c55e702b330e34",
);
assert.deepEqual(
  initial.roots.map((r) => r.files.length),
  [1014, 687, 996],
);
assert.equal(initial.mainDeclarations.length, 45);
assert.equal(initial.toolPins.length, 6);
const keys = new Set();
for (const m of e.materials) {
  assert.ok(!path.isAbsolute(m.file) && !m.file.split("/").includes(".."));
  const k = m.scope + ":" + m.file;
  assert.equal(keys.has(k), false);
  keys.add(k);
  assert.equal(m.block, m.sha256);
  assert.equal(blocks.get(m.block).length, m.bytes);
}
const frozen = e.materials.filter((m) => m.scope === "B-frozen");
assert.equal(frozen.length, 8);
assert.ok(frozen.every((m) => m.commit === e.freeze));
const design = e.materials.find((m) => m.file === "docs/DESIGN.md");
assert.equal(design.bytes, 339655);
assert.equal(
  design.sha256,
  "dd046501a6dadcd2bb89e594310ef279a669cb91dd4b0a73b9ec6503e4f4aa66",
);
const reports = new Map(),
  names = new Set();
assert.equal(e.captures.length, 41);
for (const c of e.captures) {
  assert.equal(names.has(c.name), false);
  names.add(c.name);
  assert.equal(c.capture_complete, true);
  assert.ok(
    c.command.length &&
      path.isAbsolute(c.cwd) &&
      Number.isFinite(Date.parse(c.utc)) &&
      c.seconds >= 0,
  );
  const b = gunzipSync(Buffer.from(c.stdout_gzip_base64, "base64"));
  assert.equal(b.length, c.stdout_bytes);
  assert.equal(sha(b), c.stdout_sha256);
  assert.equal(b.toString().slice(-2400), c.tail);
  try {
    reports.set(c.name, JSON.parse(b));
  } catch {
    reports.set(c.name, b.toString());
  }
}
const nonzero = e.captures
  .filter((c) => c.exit_code !== 0)
  .map((c) => [c.name, c.exit_code])
  .sort();
assert.deepEqual(nonzero, [
  ["b20_final_product", 1],
  ["b20_freeze_staged_check", 2],
  ["b20_frozen_product", 1],
  ["b20_prefreeze_format", 1],
]);
const report = (n) => {
  assert.ok(reports.has(n));
  return reports.get(n);
};
for (const n of ["b20_frozen_product", "b20_final_product"]) {
  const r = report(n);
  assert.deepEqual(
    [r.planned, r.executed, r.passed, r.failed, r.skipped, r.blocked],
    [19, 0, 0, 0, 0, 19],
  );
  assert.equal(r.stage, "production-export-capability");
  assert.equal(r.capabilityFailures, 1);
  assert.equal(r.facilityFailure, false);
  assert.deepEqual(r.cleanupErrors, []);
}
const finalCommit = e.captures.find(
  (c) => c.name === "b20_final_freeze_commit",
);
for (const c of e.captures.filter((c) => c.phase === "final-frozen-baseline"))
  assert.ok(Date.parse(c.utc) - c.seconds * 1000 > Date.parse(finalCommit.utc));
const controls = report("b20_final_controls");
assert.equal(controls.executed, 0);
assert.equal(controls.controls.productMounted, false);
assert.equal(controls.controls.checks, 14);
assert.equal(controls.controls.results.length, 14);
assert.ok(
  controls.controls.results.every((r) => r.expectedAccepted === r.accepted),
);
assert.equal(
  controls.controls.results.find(
    (r) => r.name === "qualifying-ancestor-cannot-substitute",
  ).accepted,
  false,
);
assert.equal(
  controls.controls.results.find(
    (r) => r.name === "display-contents-description",
  ).accepted,
  true,
);
assert.deepEqual(controls.cleanupErrors, []);
const values = report("b20_final_fixtures");
assert.equal(values.fixtureValues, 8);
assert.deepEqual(values.diagnostics, []);
assert.equal(values.productExecution, 0);
assert.equal(values.typescript, "5.9.3");
assert.deepEqual(report("b20_frozen_list").cases, cases);
assert.deepEqual(report("b20_frozen_list").resolved, resolved);
assert.match(report("b20_final_inventory"), /pass 2/);
assert.match(report("b20_final_format"), /All matched files/);
const scope = report("b20_frozen_scope");
assert.equal(scope.importedFiles.length, 14);
assert.equal(scope.productionBlobIdentity.count, 304);
assert.equal(scope.productionBlobIdentity.unchanged, true);
assert.equal(scope.snapshotTransferDigestVerified, true);
function current(root, m, mtime = false) {
  const b = fs.readFileSync(path.join(root, m.file));
  assert.equal(b.length, m.bytes);
  assert.equal(sha(b), m.sha256, root + "/" + m.file);
  if (mtime)
    assert.equal(
      String(fs.statSync(path.join(root, m.file), { bigint: true }).mtimeNs),
      m.mtimeNs,
    );
}
const checked = {
  frozen: 0,
  product: 0,
  protected: 0,
  declarations: 0,
  tools: 0,
};
if (process.argv.includes("--inputs")) {
  const files = git(B, ["diff", "--name-only", e.initialB, e.freeze])
    .split("\n")
    .sort();
  assert.deepEqual(files, frozen.map((m) => m.file).sort());
  for (const m of frozen) {
    current(B, m);
    assert.equal(
      sha(execFileSync("git", ["show", e.freeze + ":" + m.file], { cwd: B })),
      m.sha256,
    );
    checked.frozen++;
  }
  for (const m of scope.importedFiles) current(B, m);
}
if (process.argv.includes("--product")) {
  const P = process.env.HIER_B_PRODUCT_ROOT;
  assert.ok(P);
  assert.equal(git(P, ["rev-parse", "HEAD"]), e.fixed);
  assert.equal(git(P, ["status", "--porcelain"]), "");
  for (const m of initial.roots[2].files) {
    current(P, m);
    checked.product++;
  }
  for (const m of e.materials.filter((m) =>
    ["public-contract", "public-declaration"].includes(m.scope),
  )) {
    current(P, m);
    if (m.scope === "public-declaration") checked.declarations++;
  }
}
if (process.argv.includes("--protect")) {
  for (const r of initial.roots)
    for (const m of r.files) {
      current(r.root, m, true);
      checked.protected++;
    }
  for (const m of initial.mainDeclarations) {
    current(e.paths.main, m, true);
    checked.declarations++;
  }
  for (const m of initial.toolPins) {
    current(e.paths.tools, m, true);
    checked.tools++;
  }
  const log = fs.readFileSync(e.paths.main + "/docs/REVIEW_LOG.md");
  assert.equal(sha(log.subarray(0, initial.log.bytes)), initial.log.sha256);
  assert.equal(git(e.paths.main, ["rev-parse", "HEAD"]), e.fixed);
  assert.equal(git(e.paths.main, ["diff", "--cached", "--name-only"]), "");
}
console.log(
  JSON.stringify(
    {
      verified: true,
      bytes: raw.length,
      sha256: sha(raw),
      fixed: e.fixed,
      freeze: e.freeze,
      captures: e.captures.length,
      materials: e.materials.length,
      blocks: blocks.size,
      nonzero,
      productExecuted: 0,
      planned: 19,
      DOMControls: 14,
      typedFixtureValues: 8,
      questionsClosed: resolved,
      checked,
      notProductExecution: true,
    },
    null,
    2,
  ),
);
