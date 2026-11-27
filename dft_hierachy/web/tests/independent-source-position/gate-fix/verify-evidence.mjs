// B14 historical evidence audit only; no product or Core semantic execution.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../../../..");
const archive = JSON.parse(
  fs.readFileSync(path.join(root, "docs/m5_b_position_gate_fix_recheck.json")),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(
  archive.product.commit,
  "bc1a5d86f83ba9059a9b1f11114867063804351f",
);
assert.equal(archive.tests.freeze, "2223c974c1d190fe957c60ee291d8abd35667e8d");
assert.equal(archive.closedIssue, "B-POSITION-GATE-01");
assert.equal(archive.closesC85, false);
const raws = new Map();
let blocks = 0,
  rawBytes = 0,
  gzipBytes = 0;
function unpack(encoded, bytes, hash) {
  const z = Buffer.from(encoded, "base64"),
    b = gunzipSync(z);
  assert.equal(b.length, bytes);
  assert.equal(sha(b), hash);
  blocks++;
  rawBytes += b.length;
  gzipBytes += z.length;
  return b;
}
assert.equal(archive.captures.length, 15);
for (const c of archive.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(c.command.length && c.cwd && !Number.isNaN(Date.parse(c.utc)));
  assert.equal(raws.has(c.name), false);
  raws.set(
    c.name,
    unpack(c.stdout_gzip_base64, c.stdout_bytes, c.stdout_sha256).toString(),
  );
  assert.equal(c.exit_code, c.name === "b14_old_gate_red" ? 1 : 0, c.name);
}
const json = (n) => JSON.parse(raws.get(n));
for (const [name, n, p, f] of [
  ["b14_old_gate_red", 21, 19, 2],
  ["b14_fixed_gate", 21, 21, 0],
  ["b14_old_wrapper_regression", 20, 20, 0],
  ["b14_real_controls", 13, 13, 0],
])
  for (const [k, v] of [
    ["tests", n],
    ["pass", p],
    ["fail", f],
    ["skipped", 0],
    ["cancelled", 0],
  ])
    assert.match(
      raws.get(name),
      new RegExp("(?:ℹ|#) " + k + " " + v + "(?:\\n|$)"),
    );
assert.match(
  raws.get("b14_old_gate_red"),
  /✖ position-wrapper:controls:missing:0/,
);
assert.match(
  raws.get("b14_old_gate_red"),
  /✖ position-wrapper:controls:missing:1/,
);
function reports(text) {
  const rows = [];
  for (let at = 0; at < text.length; at++) {
    if (text[at] !== "{" || (at !== 0 && text[at - 1] !== "\n")) continue;
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
      rows.push(JSON.parse(text.slice(at, end)));
      at = end - 1;
    } catch {}
  }
  return rows;
}
const modelReports = reports(raws.get("b14_standard_position_model"));
assert.equal(modelReports.length, 2);
const [types, model] = modelReports;
assert.deepEqual(types.positive, []);
assert.equal(types.executedNegative, 32);
assert.equal(types.results.length, 32);
assert.equal(types.skipped, 0);
assert.ok(
  types.results.every((r) =>
    r.diagnostics.some((d) => ![2305, 2307].includes(d.code)),
  ),
);
assert.equal(model.executed, 258);
assert.equal(model.passed, 258);
assert.equal(model.failed, 0);
assert.equal(model.skipped, 0);
assert.equal(model.results.length, 258);
assert.ok(model.results.every((r) => r.pass));
const p = json("b14_provenance");
assert.equal(p.frozenFiles, 5);
assert.equal(p.allEarlierTestFilesPreserved, 241);
assert.equal(p.productOverlay, "");
assert.deepEqual(p.unchangedTreesAndCommands, [
  "core",
  "protocol",
  "web/packages",
  "web/package.json",
  "web/package-lock.json",
  "check.sh",
  "ci",
  "docs/DESIGN.md",
]);
const protect = json("b14_final_protection");
assert.deepEqual(
  protect.roots.map((r) => r.protectedFiles),
  [935, 633, 917],
);
assert.equal(protect.mainDeclarationsPreserved, 42);
assert.equal(protect.productDeclarationsMatchMain, 42);
assert.equal(protect.originalLog.preserved, true);
assert.deepEqual(protect.productOverlay, []);
assert.equal(protect.nativeBuilt, false);
assert.equal(protect.nativeExecuted, false);
assert.equal(protect.mainStaged, 0);
assert.equal(protect.oldBaseline.clean, true);
assert.equal(
  protect.oldBaseline.wrapperSha256,
  "1296c1cb824671127c36f9da06bade7ea9578540ceeb524e4b88cf511dd2f89e",
);
assert.deepEqual(archive.publicPins, protect.publicPins);
assert.equal(archive.publicPins.length, 46);
let inputs = 0;
for (const m of archive.materials) {
  unpack(m.gzip_base64, m.bytes, m.sha256);
  if (process.argv.includes("--inputs") && m.root === "B-tests") {
    const b = m.git
      ? execFileSync("git", ["show", m.git + ":" + m.path], { cwd: root })
      : fs.readFileSync(path.join(root, m.path));
    assert.equal(sha(b), m.sha256, m.path);
    inputs++;
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
    archive.product.commit,
  );
  for (const f of [
    ...json("b14_initial_protection").roots[2].files,
    ...archive.publicPins,
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
    closedIssue: archive.closedIssue,
    closesC85: false,
    captures: archive.captures.length,
    materials: archive.materials.length,
    pins: 46,
    blocks,
    rawBytes,
    gzipBytes,
    checkedInputs: inputs,
    productChecks,
    oldGate: { passed: 19, failed: 2 },
    fixedGate: 21,
    oldWrapper: 20,
    controls: 13,
    model: 258,
    types: 32,
    coreExecuted: 0,
    full2191Executed: false,
    semanticsExecutedByVerifier: 0,
  }),
);
