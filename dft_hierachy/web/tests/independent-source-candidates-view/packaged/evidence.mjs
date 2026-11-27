import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const block = (b) => ({
  bytes: b.length,
  sha256: sha(b),
  gzipBase64: gzipSync(b).toString("base64"),
});
const counts = (r) => [
  r.planned,
  r.executed,
  r.passed,
  r.failed,
  r.blocked,
  r.skipped,
];
function decode(v) {
  assert(v && Number.isSafeInteger(v.bytes) && v.bytes >= 0);
  assert.match(v.sha256, /^[a-f0-9]{64}$/);
  assert.equal(typeof v.gzipBase64, "string");
  const b = gunzipSync(Buffer.from(v.gzipBase64, "base64"));
  assert.equal(b.length, v.bytes);
  assert.equal(sha(b), v.sha256);
  return b;
}
function local(root, p) {
  assert(!path.isAbsolute(p) && !p.split(/[\\/]/).includes(".."));
  const real = fs.realpathSync(path.join(root, p));
  assert(real.startsWith(fs.realpathSync(root) + path.sep));
  return fs.readFileSync(real);
}
function checkPin(p, root) {
  assert(p && typeof p.file === "string");
  assert(Number.isSafeInteger(p.bytes));
  assert.match(p.sha256, /^[a-f0-9]{64}$/);
  if (root) {
    const b = local(root, p.file);
    assert.equal(b.length, p.bytes);
    assert.equal(sha(b), p.sha256);
  }
}
export function verifyEvidence(a, { root } = {}) {
  assert.equal(a.kind, "B45-packaged-partial-freeze");
  assert.equal(a.fixed.product, "e2da1afbd723ea746fe404676dfcf97900fdbf7d");
  assert.equal(a.fixed.freeze, "8e1c759451e7c423f218050bae146ef345047f0f");
  assert.equal(a.fixed.revision, "50c2a8debcc0d84bd69fff3743284bb43d693a4e");
  assert.equal(a.scope.nodeFacilities, 21);
  assert.deepEqual(a.scope.package, [4, 4, 1, 3, 0, 0]);
  assert.deepEqual(a.scope.negativeTypes, [6, 0, 0, 0, 6, 0]);
  for (const k of ["candidateUIExecuted", "CoreExecuted", "ElectronExecuted"])
    assert.equal(a.scope[k], 0);
  assert.equal(a.scope.Q1Closed, false);
  assert.equal(a.scope.fullM5Passed, false);
  assert.equal(a.inputs.length, 9);
  assert.equal(new Set(a.inputs.map((p) => p.file)).size, 9);
  for (const p of [...a.inputs, ...a.references]) checkPin(p, root);
  assert.equal(a.references.length, 2);
  assert(a.materials.length >= 10);
  assert.equal(
    new Set(a.materials.map((m) => m.name)).size,
    a.materials.length,
  );
  let blocks = 0;
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
  assert.equal(audit.commands.length, 50);
  assert.equal(audit.imports.length, 4);
  assert.equal(audit.importedFinalPaths.length, 12);
  assert.equal(audit.compiled.length, 98);
  assert.deepEqual(audit.inputPins, a.inputs);
  for (const r of audit.frozenInputs) {
    assert.equal(r.rows.length, 9);
    for (const p of r.rows) {
      decode(p);
      blocks++;
    }
  }
  assert.equal(audit.frozenInputs.length, 3);
  for (const c of audit.commands)
    for (const v of [c.stdout, c.stderr]) {
      decode(v);
      blocks++;
    }
  assert.equal(audit.normative.bytes, 15412);
  assert.equal(
    audit.normative.sha256,
    "baa78949e5354e1ed384e0f57b141002c1f3c1391a1fd25a790dca9ed08de1db",
  );
  for (const p of audit.publicOriginalDeclarations) {
    decode(p);
    blocks++;
  }
  assert(Array.isArray(a.captures) && a.captures.length >= 7);
  assert.equal(new Set(a.captures.map((c) => c.name)).size, a.captures.length);
  for (const c of a.captures) {
    assert.equal(c.captureComplete, true);
    assert.equal(c.signal, null);
    for (const v of [c.stdout, c.stderr]) {
      decode(v);
      blocks++;
    }
  }
  const capture = (name) => {
    const c = a.captures.find((c) => c.name === name);
    assert(c, "required capture " + name);
    return c;
  };
  assert.equal(capture("final-node-facilities").exit, 0);
  assert.match(
    decode(capture("final-node-facilities").stdout).toString(),
    /# tests 21\n[\s\S]*# pass 21\n# fail 0\n/,
  );
  assert.equal(capture("source-audit").exit, 0);
  assert.equal(capture("protected-before-seal").exit, 0);
  const runs = [];
  for (const name of [
    "frozen-package-baseline",
    "corrected-package-baseline",
    "final-package-baseline",
  ]) {
    const c = capture(name);
    assert.equal(c.exit, 1);
    const r = JSON.parse(decode(c.stdout));
    assert.equal(r.fixed, a.fixed.product);
    assert.equal(r.setupError, null);
    assert.equal(r.backgroundTasks, 0);
    assert.equal(r.exitCode, 1);
    assert.equal(r.packs.length, 12);
    for (const p of r.packs) {
      decode(p);
      blocks++;
    }
    assert.equal(r.commands.length, 15);
    for (const cmd of r.commands) {
      assert.equal(cmd.captureComplete, true);
      assert.equal(cmd.signal, null);
      assert.equal(cmd.error, null);
      for (const v of [cmd.stdout, cmd.stderr]) {
        decode(v);
        blocks++;
      }
    }
    for (const cmd of r.commands.slice(0, 14)) {
      assert.equal(cmd.status, 0);
      assert.equal(cmd.env.offline, true);
      assert.equal(cmd.env.ignoreScripts, true);
      assert.equal(cmd.env.force, false);
      assert.equal(cmd.env.legacyPeerDeps, false);
    }
    assert.equal(r.commands[14].status, 1);
    const report = r.report;
    assert.deepEqual(counts(report), [4, 4, 1, 3, 0, 0]);
    assert.deepEqual(counts(report.negativeTypes), [6, 0, 0, 0, 6, 0]);
    assert.deepEqual(
      report.results.map((v) => [v.id, v.pass]),
      [
        ["PK01", false],
        ["PK02", false],
        ["PK03", false],
        ["PK04", true],
      ],
    );
    if (name !== "frozen-package-baseline") {
      assert.equal(report.oldRootControl, true);
      assert.equal(report.oldTypeControl, true);
      assert.equal(report.types.sourceGuard, true);
      assert.deepEqual(report.oldTypes.diagnostics, []);
      assert(report.types.diagnostics.some((d) => d.code === 2305));
      assert.match(
        report.results[0].error,
        /missing public SourceCandidatesView runtime export/,
      );
      assert.match(report.results[2].error, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
    }
    for (const k of [
      "productionCandidateUIExecuted",
      "CoreExecuted",
      "ElectronExecuted",
    ])
      assert.equal(report[k], 0);
    assert.equal(r.copiedInputs.length, 5);
    const probe = JSON.parse(decode(r.commands[14].stdout));
    assert.deepEqual(probe, report);
    runs.push({
      name,
      packs: 12,
      commands: 15,
      package: counts(report),
      negativeTypes: counts(report.negativeTypes),
    });
  }
  return {
    verified: true,
    captures: a.captures.length,
    blocks,
    materials: a.materials.length,
    inputs: 9,
    references: 2,
    runs,
  };
}
export function checkEvidenceControls(a, options = {}) {
  const result = verifyEvidence(a, options);
  const mutations = [
    (x) => {
      x.fixed.product = "0".repeat(40);
    },
    (x) => {
      x.scope.package[2] = 4;
    },
    (x) => {
      x.captures = x.captures.filter(
        (c) => c.name !== "frozen-package-baseline",
      );
    },
    (x) => {
      x.materials[0].sha256 = "0".repeat(64);
    },
    (x) => {
      x.inputs.pop();
    },
    (x) => {
      const c = x.captures.find((c) => c.name === "final-package-baseline"),
        r = JSON.parse(decode(c.stdout));
      r.packs[0].sha256 = "0".repeat(64);
      c.stdout = block(Buffer.from(JSON.stringify(r)));
    },
    (x) => {
      const c = x.captures.find((c) => c.name === "final-package-baseline"),
        r = JSON.parse(decode(c.stdout));
      r.report.types.sourceGuard = false;
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
