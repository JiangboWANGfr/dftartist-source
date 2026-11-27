// Pure recorded-evidence API: no automatic CLI, argv handling or product execution.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  decode = (m) => {
    const b = gunzipSync(Buffer.from(m.gzipBase64, "base64"));
    assert.equal(b.length, m.bytes);
    assert.equal(sha(b), m.sha256);
    return b;
  };
const nonzero = [
  "fixed-product-web-build",
  "frozen-DOM-baseline",
  "old-D04-preparation-premise-counterexample",
  "corrected-DOM-baseline",
];
export function verifyEvidence(a, { root } = {}) {
  assert.equal(a.kind, "B40-deferred-original-binding-partial-freeze");
  assert.deepEqual(a.fixed, {
    product: "aeef926051b307e196df4c00044ca9617012a70b",
    initialB: "931cfce4c524aaebc902022c0b23aefd3c4f6ef8",
    initialFreeze: "6e6701471a695e6bc97fb23b34648a3e5d14525f",
    correctedFreeze: "9b46dde815b9e08211c0b372934a932023e04fe0",
  });
  assert.deepEqual(a.scope, {
    initialFixtureAccepted: false,
    nodeFacilities: 14,
    browserPremises: 5,
    historicalFacilities: 27,
    Q1Diagnostics: 3,
    DOM: {
      planned: 6,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: 6,
      skipped: 0,
    },
    cumulativePlannedDOM: 90,
    historicalTypes: 30,
    Q1Closed: false,
    C97ClosedByC: true,
    C97ClosedByB: false,
    fullM5Passed: false,
    deviceE2E: false,
  });
  assert(a.captures.length >= 28);
  assert.equal(new Set(a.captures.map((r) => r.name)).size, a.captures.length);
  assert.deepEqual(
    a.captures
      .filter((r) => r.exit !== 0)
      .map((r) => r.name)
      .sort(),
    [...nonzero].sort(),
  );
  for (const r of a.captures) {
    assert.equal(r.exit, nonzero.includes(r.name) ? 1 : 0);
    assert.equal(r.signal, null);
    assert.equal(r.error, null);
    assert.equal(r.captureComplete, true);
    assert(Array.isArray(r.command) && r.command.length);
    assert(Number.isFinite(r.seconds) && r.seconds >= 0);
    decode(r.stdout);
    decode(r.stderr);
  }
  const record = (n) => {
      const r = a.captures.find((r) => r.name === n);
      assert(r, "missing capture " + n);
      return r;
    },
    text = (n) => decode(record(n).stdout).toString(),
    json = (n) => JSON.parse(text(n));
  function tap(n, count) {
    const t = text(n);
    for (const [k, v] of Object.entries({
      tests: count,
      pass: count,
      fail: 0,
      cancelled: 0,
      skipped: 0,
      todo: 0,
    }))
      assert.match(t, new RegExp("^# " + k + " " + v + "$", "m"));
    assert.match(t, new RegExp("^1\\.\\." + count + "$", "m"));
  }
  tap("frozen-node-facilities", 14);
  tap("corrected-node-facilities", 14);
  tap("old-public-call-and-pointer-facilities", 27);
  for (const n of ["frozen-browser-premises", "corrected-browser-premises"]) {
    const r = json(n);
    for (const [k, v] of Object.entries({
      planned: 5,
      executed: 5,
      passed: 5,
      failed: 0,
      blocked: 0,
      skipped: 0,
    }))
      assert.equal(r[k], v);
    assert.equal(r.results.length, 5);
    assert(r.results.every((r) => r.pass && r.candidateUI === false));
    assert.deepEqual(r.cleanup, { errors: [], unhandled: [] });
    assert.deepEqual(r.releaseErrors, []);
    assert.equal(r.fixed, a.fixed.product);
  }
  for (const n of ["frozen-DOM-baseline", "corrected-DOM-baseline"]) {
    const r = json(n);
    for (const [k, v] of Object.entries(a.scope.DOM)) assert.equal(r[k], v);
    assert.equal(r.stage, "public-component-capability");
    assert.match(r.error, /missing production.*SourceCandidatesView/);
    assert(r.cssMissing);
    assert.deepEqual(r.results, []);
    assert.deepEqual(r.releaseErrors, []);
  }
  const q = json("Q1-parent-plus-feedback-counterexample");
  assert.equal(q.diagnosticOnly, true);
  assert.equal(q.acceptedUIObserver, false);
  assert.equal(q.Q1Closed, false);
  assert.equal(q.results.length, 3);
  assert(
    q.results.every(
      (r) =>
        r.originalParentInWindow &&
        r.rawRejectionPreserved &&
        r.wouldPassInsufficientParentPlusFeedbackCriterion,
    ),
  );
  assert.equal(
    q.results.find((r) => r.mode === "empty-forward-derived-only")
      .directDualBranchConsumer,
    false,
  );
  const schedule = json("old-D04-preparation-premise-counterexample");
  assert.equal(schedule.oldQueuedWorkRanBeforeSecondCommit, true);
  assert.deepEqual(schedule.events, ["commit:old", "queued:old", "commit:new"]);
  const runtime = json("corrected-runtime-input-and-source-audit"),
    guard = json("corrected-strict-protection");
  assert.equal(runtime.frozenCurrentInputsUnchanged, true);
  assert.equal(runtime.initialCasesAndAssertionsUnchanged, true);
  assert.equal(runtime.generatedDeclarationsEqual, true);
  assert.equal(runtime.generatedDeclarations.length, 49);
  assert.equal(guard.protected, true);
  assert.deepEqual(guard.counts, [1303, 894, 1285]);
  assert.equal(guard.declarations, 49);
  assert.equal(guard.binaries.length, 3);
  assert.deepEqual(a.inputs, runtime.inputPins);
  assert.equal(a.inputs.length, 14);
  assert.deepEqual(a.references, runtime.archives);
  const materials = new Map();
  for (const m of a.materials) {
    assert(!materials.has(m.name));
    materials.set(m.name, decode(m));
  }
  const material = (n) => {
    const b = materials.get(n);
    assert(b, "missing material " + n);
    return b;
  };
  for (const p of a.inputs) {
    const b = material("current:" + p.file);
    assert.equal(b.length, p.bytes);
    assert.equal(sha(b), p.sha256);
    if (root) {
      const now = fs.readFileSync(path.join(root, p.file));
      assert.equal(now.length, p.bytes);
      assert.equal(sha(now), p.sha256);
    }
  }
  for (const file of [
    "cases.mjs",
    "assertions.mjs",
    "facility.test.mjs",
    "run.mjs",
    "README.md",
  ]) {
    const p =
      "web/tests/independent-source-candidates-view/deferred-bindings/" + file;
    assert.deepEqual(material("initial:" + p), material("current:" + p));
  }
  assert.equal(
    sha(material("DESIGN.md")),
    "f60cbd514ace3beb4a6cba8e3ba38acc0e4cffb2b80c64a5f7c6846802c71799",
  );
  const auditRaw = material("source-audit.json");
  assert.equal(
    sha(auditRaw),
    "eac4d714650a9c26c483889237c128a1b382b933494c968aaae791e5eaa126c2",
  );
  const audit = JSON.parse(auditRaw);
  assert.equal(audit.exitCode, 0);
  assert.equal(audit.commands.length, 20);
  assert.equal(audit.imports.length, 2);
  assert(audit.imports.every((r) => r.rawEqual));
  assert.equal(audit.finalFiles.length, 3);
  for (const c of audit.commands) {
    assert.equal(c.status, 0);
    assert.equal(c.signal, null);
    for (const k of ["stdout", "stderr"]) {
      const b = c[k],
        m = a.materials.find((m) => m.name === "audit-stream:" + b.gzip);
      assert(m);
      assert.equal(m.bytes, b.bytes);
      assert.equal(m.sha256, b.sha256);
      const gz = Buffer.from(m.gzipBase64, "base64");
      assert.equal(gz.length, b.gzipBytes);
      assert.equal(sha(gz), b.gzipSha256);
    }
  }
  for (const n of [
    "initial.json",
    "protect.mjs",
    "capture.mjs",
    "runtime-audit.mjs",
    "q1-parent-diagnostic.mjs",
    "old-D04-await-preparation-counterexample.mjs",
    "seal.mjs",
    "evidence.mjs",
    "source-audit.mjs",
  ])
    material(n);
  return {
    verified: true,
    metadataOnly: true,
    currentProductExecuted: 0,
    captures: a.captures.length,
    materials: a.materials.length,
    inputs: a.inputs.length,
    sourceAuditCommands: 20,
    sourceAuditStreams: 40,
    ...a.scope,
  };
}
export function checkEvidenceControls(a) {
  verifyEvidence(a);
  const cases = [
    (b) => {
      b.scope.Q1Closed = true;
    },
    (b) => {
      b.scope.initialFixtureAccepted = true;
    },
    (b) => {
      b.scope.DOM.passed = 6;
    },
    (b) => {
      b.captures = b.captures.filter(
        (r) => r.name !== "old-D04-preparation-premise-counterexample",
      );
    },
    (b) => {
      const r = b.captures.find((r) => r.name === "corrected-node-facilities"),
        raw = Buffer.from(
          decode(r.stdout).toString().replace("# pass 14", "# pass 13"),
        );
      r.stdout = {
        bytes: raw.length,
        sha256: sha(raw),
        gzipBase64: gzipSync(raw).toString("base64"),
      };
    },
    (b) => {
      b.materials = b.materials.filter(
        (m) => m.name !== "audit-stream:0-stdout.gz",
      );
    },
    (b) => {
      b.inputs[0].sha256 = "0".repeat(64);
    },
  ];
  for (const change of cases) {
    const b = structuredClone(a);
    change(b);
    assert.throws(() => verifyEvidence(b));
  }
  return {
    metadataOnly: true,
    currentProductExecuted: 0,
    positive: 1,
    negative: cases.length,
  };
}
