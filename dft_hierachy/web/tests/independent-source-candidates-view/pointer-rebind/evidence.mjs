// Pure metadata API, deliberately no automatic CLI entry or argv parsing.
// This module verifies recorded executions; it never executes a current product.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const decode = (m) => {
  const b = gunzipSync(Buffer.from(m.gzipBase64, "base64"));
  assert.equal(b.length, m.bytes);
  assert.equal(sha(b), m.sha256);
  return b;
};
const nonzero = [
  "frozen-pointer-DOM-baseline",
  "unrepaired-contract-facility-baseline",
  "corrected-pointer-DOM-baseline",
];
export function verifyEvidence(a, { root } = {}) {
  assert.equal(a.kind, "B37-pointer-rebind-independent-freeze");
  assert.deepEqual(a.fixed, {
    product: "0272e902c36fc8333e78b3a891a37e46fcc15a1c",
    initialB: "578e22cea4d6cbeab6584f4569a2314a3ce2822d",
    initialFreeze: "08b53c263b11871ea8fb843ed64622ab7bff74da",
    contractFreeze: "a8062c72b1e3c502e6d3b34f3cdde638f4ab7583",
    correctedFreeze: "2da0dd5f326f136f4ba31b30f678d98330103bc2",
  });
  assert.deepEqual(a.scope, {
    initialOracleAccepted: false,
    initialNodeFacilities: 23,
    currentNodeFacilities: 25,
    contractBaseline: { tests: 2, passed: 0, failed: 2 },
    contractRepaired: { tests: 2, passed: 2, failed: 0 },
    initialBrowserPremises: 8,
    currentBrowserPremises: 9,
    DOM: {
      planned: 6,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: 6,
      skipped: 0,
    },
    cumulativePlannedDOM: 84,
    Q1Closed: false,
    C97ClosedByB: false,
    continuousRowStaleActionDOMCovered: false,
    deviceE2E: false,
    fullM5Passed: false,
  });
  assert(a.captures.length >= 34);
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
    assert(Array.isArray(r.command) && r.command.length > 0);
    assert.equal(typeof r.cwd, "string");
    assert(Number.isFinite(r.seconds) && r.seconds >= 0);
    decode(r.stdout);
    decode(r.stderr);
  }
  const record = (n) => {
      const r = a.captures.find((r) => r.name === n);
      assert(r, "missing record " + n);
      return r;
    },
    text = (n) => decode(record(n).stdout).toString(),
    json = (n) => JSON.parse(text(n));
  for (const n of [
    "fixed-product",
    "initial-snapshot",
    "fixed-product-web-build",
    "fixed-product-web-check",
    "old-B36-frozen-evidence-inputs",
    "fixed-runtime-input-and-source-audit",
    "corrected-runtime-input-and-source-audit",
    "corrected-source-format-check",
    "corrected-strict-protection",
  ])
    record(n);
  const tap = (n, tests, pass, fail) => {
    const t = text(n);
    for (const [k, v] of Object.entries({
      tests,
      pass,
      fail,
      cancelled: 0,
      skipped: 0,
      todo: 0,
    }))
      assert.match(t, new RegExp("^# " + k + " " + v + "$", "m"));
    assert.match(t, new RegExp("^1\\.\\." + tests + "$", "m"));
  };
  tap("frozen-pointer-node-facilities", 23, 23, 0);
  tap("unrepaired-contract-facility-baseline", 2, 0, 2);
  tap("corrected-contract-facilities", 2, 2, 0);
  tap("corrected-pointer-node-facilities", 25, 25, 0);
  for (const [n, count] of [
    ["frozen-pointer-browser-premises", 8],
    ["corrected-pointer-browser-premises", 9],
  ]) {
    const r = json(n);
    for (const [k, v] of Object.entries({
      planned: count,
      executed: count,
      passed: count,
      failed: 0,
      blocked: 0,
      skipped: 0,
    }))
      assert.equal(r[k], v);
    assert.equal(r.results.length, count);
    assert(r.results.every((r) => r.pass && r.candidateUI === false));
    assert.deepEqual(r.cleanup, { errors: [], unhandled: [] });
    assert.deepEqual(r.releaseErrors, []);
  }
  for (const n of [
    "frozen-pointer-DOM-baseline",
    "corrected-pointer-DOM-baseline",
  ]) {
    const r = json(n);
    for (const [k, v] of Object.entries(a.scope.DOM)) assert.equal(r[k], v);
    assert.equal(r.stage, "public-component-capability");
    assert.match(r.error, /missing production.*SourceCandidatesView/);
    assert.equal(r.results.length, 0);
    assert.deepEqual(r.releaseErrors, []);
  }
  const initial = json("fixed-runtime-input-and-source-audit"),
    current = json("corrected-runtime-input-and-source-audit");
  assert.equal(initial.inputPins.length, 9);
  assert.equal(current.inputPins.length, 11);
  assert.equal(current.frozenInputsUnchanged, true);
  assert.equal(current.generatedDeclarationBytesEqual, true);
  assert.equal(current.generatedDeclarations.length, 49);
  const protectedResult = json("corrected-strict-protection");
  assert.equal(protectedResult.protected, true);
  assert.deepEqual(protectedResult.counts, [1276, 870, 1258]);
  assert.equal(protectedResult.declarations, 49);
  assert.equal(protectedResult.binaries.length, 3);
  const materials = new Map();
  for (const m of a.materials) {
    assert(!materials.has(m.name));
    materials.set(m.name, decode(m));
  }
  assert.equal(a.inputs.length, 11);
  assert.deepEqual(a.inputs, current.inputPins);
  for (const p of a.inputs) {
    const b = materials.get("current:" + p.file);
    assert(b);
    assert.equal(b.length, p.bytes);
    assert.equal(sha(b), p.sha256);
    if (root) {
      const raw = fs.readFileSync(path.join(root, p.file));
      assert.equal(raw.length, p.bytes);
      assert.equal(sha(raw), p.sha256);
    }
  }
  for (const p of initial.inputPins) {
    const b = materials.get("initial:" + p.file);
    assert(b);
    assert.equal(b.length, p.bytes);
    assert.equal(sha(b), p.sha256);
  }
  for (const n of [
    "DESIGN.md",
    "initial.json",
    "protect.mjs",
    "runtime.mjs",
    "corrected-runtime.mjs",
    "capture.mjs",
    "seal.mjs",
    "evidence.mjs",
    "source-audit.json",
    "source-audit.mjs",
  ])
    assert(materials.has(n), "missing material " + n);
  assert.equal(
    sha(materials.get("DESIGN.md")),
    "1b393733ba90e6b401d98544a425c65a315e69b599f48858e66b8c579f570950",
  );
  const auditRaw = materials.get("source-audit.json");
  assert.equal(
    sha(auditRaw),
    "5432b0036c23310dfa7ff8099c6ab166df026d0fa9af62d9d298c22da2aaa8ab",
  );
  const audit = JSON.parse(auditRaw);
  assert.equal(audit.exitCode, 0);
  assert.equal(audit.commands.length, 45);
  assert.equal(audit.imports.length, 4);
  assert(audit.imports.every((i) => i.rawEqual));
  for (const c of audit.commands) {
    assert.equal(c.status, 0);
    assert.equal(c.signal, null);
    for (const k of ["stdout", "stderr"]) {
      const b = c[k],
        m = a.materials.find((m) => m.name === "audit-stream:" + b.gzip);
      assert(m, "missing actual audit stream");
      assert.equal(m.bytes, b.bytes);
      assert.equal(m.sha256, b.sha256);
      const gz = Buffer.from(m.gzipBase64, "base64");
      assert.equal(gz.length, b.gzipBytes);
      assert.equal(sha(gz), b.gzipSha256);
    }
  }
  const old = json("old-B36-frozen-evidence-inputs");
  assert.equal(old.verified, true);
  assert.equal(old.currentProductExecuted, 0);
  return {
    verified: true,
    metadataOnly: true,
    currentProductExecuted: 0,
    captures: a.captures.length,
    materials: a.materials.length,
    inputs: a.inputs.length,
    sourceAuditCommands: 45,
    sourceAuditStreams: 90,
    ...a.scope,
  };
}
export function checkEvidenceControls(a) {
  verifyEvidence(a);
  const changeRecord = (b, name, change) => {
    const r = b.captures.find((r) => r.name === name),
      o = JSON.parse(decode(r.stdout));
    change(o);
    const raw = Buffer.from(JSON.stringify(o));
    r.stdout = {
      bytes: raw.length,
      sha256: sha(raw),
      gzipBase64: gzipSync(raw).toString("base64"),
    };
  };
  const cases = [
    (b) => {
      b.scope.Q1Closed = true;
    },
    (b) => {
      b.materials[0].gzipBase64 = "corrupt";
    },
    (b) => {
      b.captures = b.captures.filter(
        (r) => r.name !== "unrepaired-contract-facility-baseline",
      );
    },
    (b) =>
      changeRecord(b, "corrected-pointer-DOM-baseline", (r) => {
        r.passed = 6;
        r.blocked = 0;
      }),
    (b) => {
      const r = b.captures.find(
          (r) => r.name === "unrepaired-contract-facility-baseline",
        ),
        raw = Buffer.from(
          decode(r.stdout).toString().replace("# pass 0", "# pass 2"),
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
    negative: 6,
  };
}
