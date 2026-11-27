// B16 portable historical evidence only. Executes zero Navigation semantics.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../../../..");
const a = JSON.parse(
  fs.readFileSync(
    path.join(root, "docs/m5_b_navigation_ready_baseline_freeze.json"),
  ),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(a.product.commit, "b55f27de0a40ca0ffefac4a20a38ad7cf287f66e");
assert.equal(a.tests.freeze, "0efe853560ade65d1c7252fd214998df6c2ecdb1");
assert.deepEqual(a.clarifications, {
  ids: ["B-NAV-Q1", "B-NAV-Q2"],
  status: "closed",
  frozen: true,
  cIssue: "C-86",
  cIssueStatus: "closed-by-C",
  runtimeAccepted: false,
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
assert.equal(a.captures.length, 21);
for (const c of a.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(c.command.length && c.cwd && !Number.isNaN(Date.parse(c.utc)));
  assert.equal(raws.has(c.name), false);
  raws.set(
    c.name,
    unpack(c.stdout_gzip_base64, c.stdout_bytes, c.stdout_sha256).toString(),
  );
  assert.equal(c.exit_code, c.name === "b16_initial_red" ? 1 : 0, c.name);
}
const json = (n) => JSON.parse(raws.get(n)),
  red = json("b16_initial_red");
assert.equal(red.planned, 26);
assert.equal(red.stage, "public-Navigation-capability");
assert.equal(red.exitCode, 1);
for (const k of ["executed", "passed", "failed", "skipped"])
  assert.equal(red[k], 0);
assert.match(red.error.message, /missing public SourceNavigationModel/);
for (const n of ["b16_ready_facilities", "b16_old_facilities"])
  for (const [k, v] of [
    ["tests", 4],
    ["pass", 4],
    ["fail", 0],
    ["skipped", 0],
    ["cancelled", 0],
    ["todo", 0],
  ])
    assert.match(
      raws.get(n),
      new RegExp("(?:ℹ|#) " + k + " " + v + "(?:\\n|$)"),
    );
const t = json("b16_proposal_types");
assert.deepEqual(t.positive, []);
assert.equal(t.executedNegative, 46);
assert.equal(t.skipped, 0);
assert.equal(t.results.length, 46);
assert.ok(
  t.results.every((r) =>
    r.diagnostics.some((d) => ![2305, 2307].includes(d.code)),
  ),
);
const hist = json("b16_historical_b15_evidence");
assert.equal(hist.captures, 37);
assert.equal(hist.checkedInputs, 58);
assert.equal(hist.productChecks, 0);
assert.equal(hist.semanticsExecutedByVerifier, 0);
const add = json("b16_draft_inventory"),
  all = json("b16_all_inventory");
assert.equal(add.count, 26);
assert.equal(all.count, 310);
assert.equal(new Set(all.cases.map((x) => x.id)).size, 310);
assert.deepEqual(all.cases.slice(284), add.cases);
for (const r of all.cases)
  assert.ok(r.input !== undefined && r.expected && r.basis);
assert.equal(
  sha(Buffer.from(JSON.stringify(add.cases))),
  a.tests.addedInventorySha256,
);
assert.equal(
  sha(Buffer.from(JSON.stringify(all.cases))),
  a.tests.allInventorySha256,
);
const p = json("b16_provenance");
assert.equal(p.BImportedFiles, 16);
assert.equal(p.pure, true);
assert.equal(p.productionAndDeclarationUnchanged.length, 9);
const protect = json("b16_final_protection"),
  initial = json("b16_initial_protection");
assert.deepEqual(
  protect.roots.map((r) => r.protectedFiles),
  initial.roots.map((r) => r.files.length),
);
assert.equal(protect.mainDeclarationsPreserved, 42);
assert.equal(protect.productDeclarationsMatchMain, 42);
assert.equal(protect.oldBTestFiles, 249);
assert.equal(protect.originalLog.preserved, true);
assert.equal(protect.nativeBuilt, false);
assert.equal(protect.nativeExecuted, false);
assert.deepEqual(protect.productOverlay, []);
assert.equal(protect.mainStaged, 0);
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
  const product = fs.realpathSync(process.env.HIER_B_PRODUCT_ROOT);
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: product,
      encoding: "utf8",
    }).trim(),
    a.product.commit,
  );
  for (const f of [...initial.roots[2].files, ...a.publicPins]) {
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
    pins: 47,
    blocks,
    rawBytes,
    gzipBytes,
    checkedInputs,
    productChecks,
    addedPlanned: 26,
    combinedPlanned: 310,
    corePlanned: 10,
    typeNegativesPlanned: 46,
    newRuntimeExecuted: 0,
    newRuntimeSkipped: 0,
    facilities: [4, 4],
    proposalTypes: 46,
    clarifications: a.clarifications,
    semanticsExecutedByVerifier: 0,
  }),
);
