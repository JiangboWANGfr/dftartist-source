import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  block = (b) => ({
    bytes: b.length,
    sha256: sha(b),
    gzipBase64: gzipSync(b).toString("base64"),
  });
function decode(v) {
  assert(v && Number.isSafeInteger(v.bytes) && v.bytes >= 0);
  assert.match(v.sha256, /^[a-f0-9]{64}$/);
  const b = gunzipSync(Buffer.from(v.gzipBase64, "base64"));
  assert.equal(b.length, v.bytes);
  assert.equal(sha(b), v.sha256);
  return b;
}
function local(root, file) {
  assert(!path.isAbsolute(file) && !file.split(/[\\/]/).includes(".."));
  const real = fs.realpathSync(path.join(root, file));
  assert(real.startsWith(fs.realpathSync(root) + path.sep));
  return fs.readFileSync(real);
}
export function verifyEvidence(a, { root } = {}) {
  assert.equal(a.kind, "B47-pointer-session-partial-freeze");
  assert.equal(a.fixed.product, "bf8ef4d5e6496ae5f8f0cda670c57f70a555d205");
  assert.equal(a.fixed.freeze, "249c20aab9bc5ae9b82fb4d635bcddef2194a50b");
  assert.equal(a.fixed.faultFreeze, "9adca599753cc2714cab4e24f7641311b7f1f653");
  assert.equal(a.fixed.revision, "179bfdc3e14a98700b4c2f68ed94d67576e15aa6");
  assert.equal(a.scope.nodeFacilities, 14);
  assert.equal(a.scope.browserPremises, 3);
  assert.deepEqual(a.scope.DOM, [2, 0, 0, 0, 2, 0]);
  assert.equal(a.scope.cumulativePlannedDOM, 106);
  assert.equal(a.scope.historicalTypes, 30);
  for (const name of ["Q1Closed", "fullM5Passed"])
    assert.equal(a.scope[name], false);
  for (const name of [
    "candidateUIExecuted",
    "CoreExecuted",
    "ElectronExecuted",
  ])
    assert.equal(a.scope[name], 0);
  assert.equal(a.inputs.length, 17);
  assert.equal(a.references.length, 2);
  assert.equal(new Set(a.inputs.map((p) => p.file)).size, 17);
  for (const p of [...a.inputs, ...a.references]) {
    assert.match(p.sha256, /^[a-f0-9]{64}$/);
    if (root) {
      const b = local(root, p.file);
      assert.equal(b.length, p.bytes);
      assert.equal(sha(b), p.sha256);
    }
  }
  let blocks = 0;
  assert(a.materials.length >= 15);
  assert.equal(
    new Set(a.materials.map((m) => m.name)).size,
    a.materials.length,
  );
  for (const m of a.materials) {
    const b = decode(m);
    blocks++;
    if (root && m.file) assert.deepEqual(local(root, m.file), b);
  }
  const material = (name) => {
    const m = a.materials.find((m) => m.name === name);
    assert(m, "required material " + name);
    return decode(m);
  };
  const audit = JSON.parse(material("source-audit.json"));
  assert.equal(audit.exitCode, 0);
  assert.equal(audit.commands.length, 58);
  assert.equal(audit.imports.length, 4);
  assert.equal(audit.importedFinalPaths.length, 8);
  assert.equal(audit.compiled.length, 98);
  assert.equal(audit.sharedHelperPathsEqual, true);
  assert.equal(audit.gestureAndFaultExpectationsUnchanged, true);
  assert.deepEqual(audit.inputPins, a.inputs);
  assert.deepEqual(
    audit.frozenStages.map((s) => s.rows.length),
    [7, 8, 8],
  );
  for (const stage of audit.frozenStages)
    for (const row of stage.rows) {
      decode(row);
      blocks++;
    }
  for (const c of audit.commands)
    for (const stream of [c.stdout, c.stderr]) {
      decode(stream);
      blocks++;
    }
  assert.deepEqual(
    audit.originalB46Watchdogs.map((c) => c.method),
    ["Runtime.evaluate", "HeapProfiler.collectGarbage"],
  );
  assert(a.captures.length >= 12);
  assert.equal(new Set(a.captures.map((c) => c.name)).size, a.captures.length);
  for (const c of a.captures) {
    assert.equal(c.captureComplete, true);
    assert.equal(c.signal, null);
    for (const stream of [c.stdout, c.stderr]) {
      decode(stream);
      blocks++;
    }
  }
  const capture = (name) => {
    const c = a.captures.find((c) => c.name === name);
    assert(c, "required capture " + name);
    return c;
  };
  const fault = capture("original-cleanup-counterexample");
  assert.equal(fault.exit, 1);
  assert.match(
    decode(fault.stdout).toString(),
    /# tests 2\n[\s\S]*# pass 1\n# fail 1\n/,
  );
  const tap = capture("final-node-facilities");
  assert.equal(tap.exit, 0);
  assert.match(
    decode(tap.stdout).toString(),
    /# tests 14\n[\s\S]*# pass 14\n# fail 0\n/,
  );
  for (const name of ["frozen-browser-premises", "final-browser-premises"]) {
    const c = capture(name),
      r = JSON.parse(decode(c.stdout));
    assert.equal(c.exit, 0);
    assert.deepEqual(
      [r.planned, r.executed, r.passed, r.failed, r.blocked, r.skipped],
      [3, 3, 3, 0, 0, 0],
    );
    assert.equal(r.fixed, a.fixed.product);
    assert(r.results.every((v) => v.pass && v.candidateUI === false));
    assert.equal(r.results[1].oldActionValidAcrossSelectionOnly, true);
    assert.deepEqual(r.cleanup, {
      errors: [],
      globalErrors: [],
      unhandled: [],
    });
    assert.deepEqual(r.controlPageErrors, []);
    assert.deepEqual(r.releaseErrors, []);
  }
  for (const name of ["frozen-DOM-baseline", "final-DOM-baseline"]) {
    const c = capture(name),
      r = JSON.parse(decode(c.stdout));
    assert.equal(c.exit, 1);
    assert.deepEqual(
      [r.planned, r.executed, r.passed, r.failed, r.blocked, r.skipped],
      [2, 0, 0, 0, 2, 0],
    );
    assert.match(r.error, /missing production.*SourceCandidatesView/);
    assert.equal(r.results.length, 0);
    assert.deepEqual(r.gatePageErrors, []);
    assert.deepEqual(r.releaseErrors, []);
  }
  return {
    verified: true,
    captures: a.captures.length,
    materials: a.materials.length,
    blocks,
    inputs: 17,
    references: 2,
    DOM: [2, 0, 0, 0, 2, 0],
    Q1Closed: false,
  };
}
export function checkEvidenceControls(a, options = {}) {
  const result = verifyEvidence(a, options),
    mutations = [
      (x) => {
        x.fixed.product = "0".repeat(40);
      },
      (x) => {
        x.scope.DOM = [2, 2, 2, 0, 0, 0];
      },
      (x) => {
        x.captures = x.captures.filter(
          (c) => c.name !== "original-cleanup-counterexample",
        );
      },
      (x) => {
        x.materials[0].sha256 = "0".repeat(64);
      },
      (x) => {
        x.inputs.pop();
      },
      (x) => {
        x.scope.Q1Closed = true;
      },
      (x) => {
        const c = x.captures.find((c) => c.name === "final-browser-premises"),
          r = JSON.parse(decode(c.stdout));
        r.results[1].oldActionValidAcrossSelectionOnly = false;
        c.stdout = block(Buffer.from(JSON.stringify(r)));
      },
    ];
  assert.throws(() => verifyEvidence({}, options));
  for (const mutate of mutations) {
    const copy = structuredClone(a);
    mutate(copy);
    assert.throws(() => verifyEvidence(copy, options));
  }
  return { positive: 1, rejectedNegative: 8, ...result };
}
