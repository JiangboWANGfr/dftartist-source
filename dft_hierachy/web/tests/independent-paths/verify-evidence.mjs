// B8 immutable evidence replay/byte verification only; no product semantic execution.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const own = path.resolve(import.meta.dirname, "../../..");
const a = JSON.parse(
  fs.readFileSync(path.join(own, "docs/m5_b_path02_recheck.json")),
);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const outputs = new Map();
let blocks = 0,
  rawBytes = 0,
  gzipBytes = 0;
function unpack(p) {
  const compressed = Buffer.from(p.gzip_base64, "base64"),
    b = gunzipSync(compressed);
  assert.equal(b.length, p.bytes);
  assert.equal(sha(b), p.sha256);
  blocks++;
  rawBytes += b.length;
  gzipBytes += compressed.length;
  return b;
}
assert.equal(a.fixed.productSha, "bd1ea29b585f91b9d8e06ed2b5bd0e74311af61e");
assert.equal(a.fixed.freezeSha, "c37fdf6b7e0819178feb74fb295d349a0caba7d2");
assert.equal(a.fixed.fixSha, "949475500947cb96806aa6fb9ea9bb660a1ea59f");
const product = process.env.HIER_B_PRODUCT_ROOT;
assert.ok(product, "explicit historical B8 product/overlay root required");
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: product,
    encoding: "utf8",
  }).trim(),
  a.fixed.productSha,
);
for (const c of a.captures) {
  assert.equal(c.capture_complete, true);
  assert.ok(c.command.length && c.cwd && c.utc);
  assert.equal(typeof c.seconds, "number");
  assert.ok(!outputs.has(c.name));
  const raw = unpack({
    bytes: c.stdout_bytes,
    sha256: c.stdout_sha256,
    gzip_base64: c.stdout_gzip_base64,
  }).toString();
  assert.equal(
    c.exit_code,
    ["matrix-original-baseline", "standard-original-baseline"].includes(c.name)
      ? 1
      : 0,
    c.name,
  );
  outputs.set(c.name, raw);
}
const parse = (name) => JSON.parse(outputs.get(name));
const manifests = {
  properties281: parse("properties-original-enumeration"),
  "core-model5": parse("properties-core-original-enumeration"),
};
assert.equal(manifests.properties281.count, 281);
assert.equal(manifests["core-model5"].count, 5);
assert.deepEqual(
  parse("properties-corrected-enumeration"),
  manifests.properties281,
);
assert.deepEqual(
  parse("properties-core-corrected-enumeration"),
  manifests["core-model5"],
);
assert.equal(parse("path-matrix-enumeration").count, 15);
for (const name of ["matrix-original-baseline", "matrix-corrected"]) {
  const report = parse(name),
    old = name.includes("original");
  assert.equal(report.planned, 15);
  assert.equal(report.executed, 15);
  assert.equal(report.skipped, 0);
  assert.equal(report.passed, old ? 7 : 15);
  assert.equal(report.failed, old ? 8 : 0);
  assert.equal(report.results.length, 15);
  for (const [i, r] of report.results.entries()) {
    const group = [
        "tree43",
        "properties281",
        "core-kat3",
        "core-model5",
        "core-import-only",
      ][i % 5],
      changedPath = i >= 5;
    assert.equal(
      r.id,
      ["ascii-checkout", "checkout with space", "检出中文"][Math.floor(i / 5)] +
        "/" +
        group,
    );
    const stdout = unpack(r.stdout).toString(),
      stderr = unpack(r.stderr).toString();
    const red = old && changedPath && group !== "core-import-only";
    assert.equal(r.pass, !red, r.id);
    assert.equal(r.signal, null);
    if (group === "core-import-only") {
      assert.equal(r.status, 0);
      assert.equal(stdout, "");
      assert.equal(stderr, "");
      assert.equal(r.observation.tests, 0);
    } else if (group === "core-model5" && red) {
      assert.equal(r.status, 0);
      assert.equal(stdout, "");
      assert.equal(stderr, "");
      assert.ok(
        r.coverageError,
        "silent exit0 is not accepted as executed semantics",
      );
    } else if (group === "tree43" || group === "core-kat3") {
      const n = group === "tree43" ? 43 : 3;
      assert.equal(r.status, red ? 1 : 0);
      assert.deepEqual(r.observation, {
        tests: n,
        pass: red ? 0 : n,
        fail: red ? n : 0,
        cancelled: 0,
        skipped: 0,
      });
      if (red)
        assert.ok(
          stdout.includes("%20") ||
            stdout.includes("%E6") ||
            stderr.includes("%20") ||
            stderr.includes("%E6"),
          "encoded local path preserved",
        );
    } else {
      const report = JSON.parse(stdout),
        expected = manifests[group];
      assert.equal(report.plannedCases, expected.count);
      assert.equal(report.executedCases, expected.count);
      assert.equal(report.skippedCases, 0);
      assert.deepEqual(
        report.results.map((r) => r.id),
        expected.cases.map((r) => r.id),
      );
      const failed = report.results.filter((r) => !r.pass);
      if (red) {
        assert.equal(r.status, 1);
        assert.deepEqual(
          failed.map((r) => r.id),
          ["failure", "cancel", "dispose", "observer"].map(
            (m) => "IP-P-unhandled-" + m,
          ),
        );
      } else {
        assert.equal(r.status, 0);
        assert.equal(failed.length, 0);
      }
    }
  }
}
function reports(text) {
  const out = [];
  for (let at = 0; at < text.length; at++) {
    if (text[at] !== "{" || (at > 0 && text[at - 1] !== "\n")) continue;
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
      } else if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        end++;
        break;
      }
    }
    try {
      out.push(JSON.parse(text.slice(at, end)));
      at = end - 1;
    } catch {}
  }
  return out;
}
function tap(name, n, pass, fail) {
  for (const [k, v] of Object.entries({
    tests: n,
    pass,
    fail,
    cancelled: 0,
    skipped: 0,
  }))
    assert.deepEqual(
      [
        ...outputs
          .get(name)
          .matchAll(new RegExp("(?:ℹ|#) " + k + " (\\d+)", "g")),
      ].map((m) => +m[1]),
      [v],
      name + ":" + k,
    );
}
const semantic = (name) =>
  reports(outputs.get(name)).filter(
    (r) =>
      Array.isArray(r.results) &&
      r.results.length &&
      r.results.every((c) => typeof c.pass === "boolean"),
  );
tap("standard-original-baseline", 810, 767, 43);
assert.equal(semantic("standard-original-baseline").length, 0);
tap("standard-corrected-full", 810, 810, 0);
tap("standard-corrected-m4", 268, 268, 0);
assert.deepEqual(
  semantic("standard-corrected-full").map((r) => r.results.length),
  [26, 281, 5, 99, 25, 12, 40, 6, 306, 4, 14],
);
assert.deepEqual(
  semantic("standard-corrected-m4").map((r) => r.results.length),
  [26],
);
for (const name of ["standard-corrected-full", "standard-corrected-m4"])
  assert.ok(semantic(name).every((r) => r.results.every((c) => c.pass)));
const full = semantic("standard-corrected-full");
assert.deepEqual(
  full[1].results.map((r) => r.id),
  manifests.properties281.cases.map((r) => r.id),
);
assert.deepEqual(
  full[2].results.map((r) => r.id),
  manifests["core-model5"].cases.map((r) => r.id),
);
const initial = parse("initial-byte-protection"),
  final = parse("final-byte-protection");
for (const k of [
  "mainTracked",
  "productOriginalExceptTargets",
  "ownOriginalExceptTargets",
  "imports",
  "importPins",
  "nativeTrees",
  "untracked",
])
  assert.deepEqual(final[k], initial[k], k);
assert.equal(final.imports.length, 5);
assert.equal(final.importPins.length, 13);
assert.equal(final.targetPins.length, 6);
assert.ok(
  initial.targetPins.every(
    (p) => !p.ownUsesCorrected && !p.productUsesCorrected,
  ),
);
assert.ok(
  final.targetPins.every((p) => p.ownUsesCorrected && p.productUsesCorrected),
);
assert.equal(final.log.preserved, true);
assert.equal(parse("public-declaration-byte-control").count, 37);
for (const [root, pins] of [
  [own, a.inputPins],
  [product, a.productPins],
])
  for (const p of pins) {
    const b = fs.readFileSync(path.join(root, p.path));
    assert.equal(b.length, p.bytes, p.path);
    assert.equal(sha(b), p.sha256, p.path);
  }
for (const m of a.materials) unpack(m);
const build = parse("own-build-metadata"),
  b = fs.readFileSync(build.binary.path);
assert.equal(b.length, build.binary.bytes);
assert.equal(sha(b), build.binary.sha256);
unpack(build.cache);
assert.deepEqual(build.ownCoreProcesses, []);
assert.deepEqual(parse("final-resources").ownCoreProcesses, []);
assert.deepEqual(parse("final-resources-canonical").ownCoreProcesses, []);
assert.deepEqual(parse("final-resources-canonical").ambiguousHier, []);
assert.equal(
  (outputs.get("own-core-build").match(/\bwarning:/g) ?? []).length,
  0,
);
for (const [k, v] of Object.entries({
  CMAKE_BUILD_TYPE: "RelWithDebInfo",
  HIER_TEST_M3: "ON",
  HIER_TEST_FUTURE: "ON",
  HIER_TEST_OBSERVER: "OFF",
  HIER_SANITIZE: "OFF",
  HIER_BUILD_EXPERIMENTS: "OFF",
}))
  assert.equal(build.flags[k], v);
assert.deepEqual(a.summary, {
  matrixOriginal: { passed: 7, failed: 8, executed: 15 },
  matrixCorrected: { passed: 15, failed: 0, executed: 15 },
  originalStandard: {
    executed: 810,
    passed: 767,
    failed: 43,
    laterRuntimeGroupsExecuted: 0,
  },
  correctedStandard: 1628,
  correctedM4: 294,
  coreModelOriginalSpecialPaths: {
    plannedPerPath: 5,
    executedPerPath: 0,
    exitCode: 0,
  },
  coreModelCorrectedPerPath: 5,
  skipped: 0,
  productSemanticsExecutedByVerifier: 0,
});
console.log(
  JSON.stringify({
    archiveVerified: true,
    captures: a.captures.length,
    inputPins: a.inputPins.length,
    productPins: a.productPins.length,
    materials: a.materials.length,
    blocks,
    rawBytes,
    gzipBytes,
    originalMatrixFailuresRetained: 8,
    originalStandardFailuresRetained: 43,
    silentExit0NotCountedAsPass: true,
    correctedMatrix: 15,
    fullHistorical: 1628,
    m4Historical: 294,
    actualCoreModelIDs: manifests["core-model5"].cases.map((r) => r.id),
    productSemanticsExecutedByVerifier: 0,
  }),
);
