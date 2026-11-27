// B13 historical receipts/input audit. Executes no product semantic tests.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../../../..");
const archive = JSON.parse(
  fs.readFileSync(path.join(root, "docs/m5_b_position_runtime_recheck.json")),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(
  archive.product.commit,
  "89ba7879300be09f115efa4464320f56f1c1c8be",
);
assert.equal(
  archive.tests.originalFreeze,
  "00f126b93dfe66f0bcaff50f7d0ba617c6a39c0c",
);
assert.equal(
  archive.tests.facilityFreeze,
  "2223c974c1d190fe957c60ee291d8abd35667e8d",
);
assert.equal(archive.accepted, false);
assert.equal(archive.issue, "B-POSITION-GATE-01 / C-85");
const raw = new Map(),
  caps = new Map();
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
const expectedRed = new Set([
  "b13_start_metadata",
  "b13_new_wrapper_facilities",
  "b13_new_wrapper_facilities_corrected",
]);
assert.equal(archive.captures.length, 34);
for (const c of archive.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(c.command.length && c.cwd && !Number.isNaN(Date.parse(c.utc)));
  assert.equal(caps.has(c.name), false);
  caps.set(c.name, c);
  raw.set(
    c.name,
    unpack(c.stdout_gzip_base64, c.stdout_bytes, c.stdout_sha256).toString(),
  );
  assert.equal(c.exit_code, expectedRed.has(c.name) ? 1 : 0, c.name);
}
const json = (n) => JSON.parse(raw.get(n));
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
const totals = {};
for (const [name, n, groups] of [
  [
    "b13_standard_full",
    2191,
    [26, 281, 5, 99, 25, 12, 40, 6, 306, 4, 14, 281, 13, 258, 11],
  ],
  ["b13_standard_m4", 294, [26]],
]) {
  const text = raw.get(name),
    rows = reports(text).filter(
      (r) =>
        r.results?.length &&
        r.results.every((x) => typeof x.pass === "boolean"),
    );
  assert.deepEqual(
    rows.map((r) => r.results.length),
    groups,
  );
  for (const r of rows) {
    assert.equal(r.exitCode, 0);
    assert.ok(r.results.every((x) => x.pass));
    if ("skipped" in r) assert.equal(r.skipped, 0);
  }
  const taps = [
    ...text.matchAll(/(?:ℹ|#) (tests|pass|fail|skipped|cancelled) ([0-9]+)/g),
  ];
  for (const m of taps.filter((x) =>
    ["fail", "skipped", "cancelled"].includes(x[1]),
  ))
    assert.equal(Number(m[2]), 0);
  const node = taps.filter((x) => x[1] === "tests").map((x) => Number(x[2]));
  assert.deepEqual(node, n === 2191 ? [810, 13] : [268]);
  const total = node[0] + rows.reduce((a, r) => a + r.results.length, 0);
  assert.equal(total, n);
  totals[name] = total;
}
for (const [name, n] of [
  ["b13_frozen_model", 258],
  ["b13_frozen_real_core", 11],
  ["b13_original_source_model", 306],
]) {
  const r = json(name);
  assert.equal(r.executed, n);
  assert.equal(r.passed, n);
  assert.equal(r.failed, 0);
  assert.equal(r.skipped, 0);
  assert.equal(r.results.length, n);
  assert.ok(r.results.every((x) => x.pass));
}
for (const [name, n] of [
  ["b13_production_types", 32],
  ["b13_original_source_types", 34],
]) {
  const r = json(name);
  assert.deepEqual(r.positive, []);
  assert.equal(r.results.length, n);
  assert.equal(r.executedNegative, n);
  assert.equal(r.skipped, 0);
  assert.ok(
    r.results.every((x) =>
      x.diagnostics.some((d) => ![2305, 2307].includes(d.code)),
    ),
  );
}
for (const [name, n, p, f] of [
  ["b13_facility_and_legacy", 13, 13, 0],
  ["b13_original_wrapper_facilities", 20, 20, 0],
  ["b13_new_wrapper_facilities", 21, 14, 7],
  ["b13_new_wrapper_facilities_corrected", 21, 19, 2],
])
  for (const [k, v] of [
    ["tests", n],
    ["pass", p],
    ["fail", f],
    ["skipped", 0],
    ["cancelled", 0],
  ])
    assert.match(
      raw.get(name),
      new RegExp("(?:ℹ|#) " + k + " " + v + "(?:\\n|$)"),
    );
assert.match(
  raw.get("b13_new_wrapper_facilities_corrected"),
  /✖ position-wrapper:controls:missing:0/,
);
assert.match(
  raw.get("b13_new_wrapper_facilities_corrected"),
  /✖ position-wrapper:controls:missing:1/,
);
assert.match(raw.get("b13_node_context_probe"), /skipping running files/);
const missing = json("b13_missing_controls_repro");
assert.equal(missing.defectConfirmed, true);
assert.deepEqual(
  missing.observations.map((x) => x.status),
  [0, 0],
);
assert.deepEqual(
  missing.observations.map((x) => x.missing),
  ["facility.test.mjs", "legacy-regression.test.mjs"],
);
assert.ok(missing.observations.every((x) => /(?:ℹ|#) tests 1/.test(x.stdout)));
const protection = json("b13_final_protection");
assert.deepEqual(
  protection.roots.map((r) => r.protectedFiles),
  [929, 628, 911],
);
assert.equal(protection.mainDeclarationsPreserved, 42);
assert.equal(protection.productDeclarationsMatchMain, 42);
assert.equal(protection.originalLog.preserved, true);
assert.deepEqual(protection.ownedCoreProcesses, []);
assert.deepEqual(protection.productOverlay, []);
assert.equal(protection.mainStaged, 0);
assert.equal(protection.native.bytes, 9325112);
assert.equal(
  protection.native.sha256,
  "fe203f283777de14bdfc58969dd7235431588e9a4281ac0d11659651bb06d7ec",
);
assert.deepEqual(archive.publicPins, protection.publicPins);
assert.equal(archive.publicPins.length, 49);
const api = json("b13_public_api_compatibility");
assert.deepEqual(api.removed, []);
assert.deepEqual(api.added, ["SourcePositionError"]);
assert.equal(api.unchangedDeclarations, 38);
assert.equal(api.oldDeclarations, 41);
assert.equal(api.declarations.length, 42);
const provenance = json("b13_provenance");
assert.equal(provenance.frozenFiles, 15);
assert.equal(provenance.contractBodyPreserved, true);
assert.equal(provenance.productOverlay, "");
const schema = reports(raw.get("b13_schema_gate")).find(
  (r) => r.checks === 655,
);
assert.equal(schema.passed, 655);
assert.equal(schema.failed, 0);
assert.equal(schema.skipped, 0);
assert.equal(schema.parameterNormalization.checks, 27);
assert.match(
  raw.get("b13_start_metadata"),
  /FileNotFoundError[\s\S]*AGENTS\.md/,
);
assert.doesNotMatch(raw.get("b13_native_build"), /warning:/i);
for (const [a, b] of [
  ["b13_wrapper_freeze_commit", "b13_new_wrapper_facilities"],
  ["b13_wrapper_adapter_commit", "b13_new_wrapper_facilities_corrected"],
])
  assert.ok(Date.parse(caps.get(b).utc) > Date.parse(caps.get(a).utc));
let inputs = 0;
for (const m of archive.materials) {
  const b = unpack(m.gzip_base64, m.bytes, m.sha256);
  if (process.argv.includes("--inputs") && m.root === "B-tests") {
    const actual = m.git
      ? execFileSync("git", ["show", m.git + ":" + m.path], { cwd: root })
      : fs.readFileSync(path.join(root, m.path));
    assert.equal(sha(actual), m.sha256, m.path);
    inputs++;
  }
}
let productFiles = 0;
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
    ...json("b13_initial_protection").roots[2].files,
    ...archive.publicPins,
  ]) {
    const b = fs.readFileSync(path.join(p, f.file));
    assert.equal(b.length, f.bytes, f.file);
    assert.equal(sha(b), f.sha256, f.file);
    productFiles++;
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
    accepted: false,
    issue: archive.issue,
    captures: caps.size,
    materials: archive.materials.length,
    pins: archive.publicPins.length,
    blocks,
    rawBytes,
    gzipBytes,
    checkedInputs: inputs,
    checkedProductFiles: productFiles,
    totals,
    model: 258,
    core: 11,
    types: 32,
    controls: 13,
    wrapper: { passed: 19, failed: 2 },
    semanticsExecutedByThisVerifier: 0,
  }),
);
