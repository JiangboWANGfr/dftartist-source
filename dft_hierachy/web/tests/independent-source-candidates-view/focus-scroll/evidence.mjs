// Pure archival API. Import and call explicitly; no CLI success verdict.
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
export function verifyEvidence(a, { root } = {}) {
  assert.equal(a.kind, "B41-focus-local-scroll-partial-freeze");
  assert.deepEqual(a.fixed, {
    product: "548d57b4a2d4dd413063ddaf15ca46d123420ecb",
    initialB: "6ee5fc4ed572faf67dba5dcd6f1d6ac581ea1e6c",
    freeze: "936f4115910234f65cf9870a35b8c07594e0f9e4",
  });
  assert.deepEqual(a.scope, {
    nodeFacilities: 15,
    browserPremises: 5,
    historicalFacilities: 41,
    DOM: {
      planned: 6,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: 6,
      skipped: 0,
    },
    cumulativePlannedDOM: 96,
    historicalTypes: 30,
    Q1Closed: false,
    fullM5Passed: false,
    CoreCandidateUIExecuted: 0,
    ElectronPassed: false,
  });
  assert(a.captures.length >= 17);
  assert.equal(new Set(a.captures.map((r) => r.name)).size, a.captures.length);
  assert.deepEqual(
    a.captures.filter((r) => r.exit !== 0).map((r) => r.name),
    ["frozen-DOM-baseline", "seal-and-readback-controls"],
  );
  for (const r of a.captures) {
    assert.equal(
      r.exit,
      ["frozen-DOM-baseline", "seal-and-readback-controls"].includes(r.name)
        ? 1
        : 0,
    );
    assert.equal(r.captureComplete, true);
    assert.equal(r.error, null);
    assert.equal(r.signal, null);
    assert(r.command.length && path.isAbsolute(r.cwd));
    assert(Number.isFinite(r.seconds) && r.seconds >= 0);
    decode(r.stdout);
    decode(r.stderr);
  }
  function record(name) {
    const r = a.captures.find((r) => r.name === name);
    assert(r, "missing actual command " + name);
    return r;
  }
  const json = (name) => JSON.parse(decode(record(name).stdout));
  function tap(name, n) {
    const s = decode(record(name).stdout).toString();
    for (const [k, v] of Object.entries({
      tests: n,
      pass: n,
      fail: 0,
      cancelled: 0,
      skipped: 0,
      todo: 0,
    }))
      assert.match(s, new RegExp("^# " + k + " " + v + "$", "m"));
    assert.match(s, new RegExp("^1\\.\\." + n + "$", "m"));
  }
  tap("frozen-node-facilities", 15);
  tap("related-historical-facilities", 41);
  const control = json("frozen-browser-premises");
  for (const [k, v] of Object.entries({
    planned: 5,
    executed: 5,
    passed: 5,
    failed: 0,
    blocked: 0,
    skipped: 0,
  }))
    assert.equal(control[k], v);
  assert.equal(control.fixed, a.fixed.product);
  assert.equal(control.results.length, 5);
  assert(control.results.every((r) => r.pass && r.candidateUI === false));
  assert.deepEqual(control.cleanup, { errors: [], unhandled: [] });
  assert.deepEqual(control.releaseErrors, []);
  const geometry = control.results.find(
    (r) => r.id === "B41-actual-SourceView-geometry",
  );
  assert(geometry);
  assert.equal(geometry.scopes.length, 4);
  assert(geometry.scopes.every((s) => s.top > 0 && s.left > 0));
  const dom = json("frozen-DOM-baseline");
  for (const [k, v] of Object.entries(a.scope.DOM)) assert.equal(dom[k], v);
  assert.equal(dom.stage, "public-component-capability");
  assert.match(dom.error, /missing production.*SourceCandidatesView/);
  assert(dom.cssMissing);
  assert.deepEqual(dom.results, []);
  assert.deepEqual(dom.releaseErrors, []);
  const inventory = json("frozen-DOM-inventory");
  assert.equal(inventory.planned, 6);
  assert.deepEqual(
    inventory.cases.map((c) => c.id),
    ["F01", "F02", "F03", "F04", "F05", "F06"],
  );
  const runtime = json("runtime-input-and-source-audit");
  assert.equal(runtime.exitCode, 0);
  assert.equal(runtime.imports.length, 3);
  assert(runtime.imports.every((v) => v.rawEqual));
  assert.equal(runtime.finalFiles.length, 11);
  assert.equal(runtime.generatedDeclarationsEqual, true);
  assert.equal(runtime.generatedDeclarations.length, 49);
  assert.equal(runtime.frozenCurrentInputsUnchanged, true);
  assert.deepEqual(a.inputs, runtime.inputPins);
  assert.equal(a.inputs.length, 10);
  const guard = json("strict-protection");
  assert.equal(guard.protected, true);
  assert.deepEqual(guard.counts, [1315, 905, 1297]);
  assert.equal(guard.declarations, 49);
  assert.equal(guard.binaries.length, 3);
  const materials = new Map();
  for (const m of a.materials) {
    assert(!materials.has(m.name));
    materials.set(m.name, decode(m));
  }
  const auditStreams = new Map();
  for (const m of a.auditStreams) {
    assert(!auditStreams.has(m.sha256));
    decode(m);
    auditStreams.set(m.sha256, m);
  }
  assert.equal(a.audits.length, 2);
  for (const m of a.audits) {
    assert(!materials.has(m.name));
    const snapshot = structuredClone(m.snapshot);
    for (const c of snapshot.commands)
      for (const k of ["stdout", "stderr"]) {
        const stream = auditStreams.get(c[k].streamRef);
        assert(stream, "missing original git stream");
        c[k] = stream;
      }
    const b = Buffer.from(JSON.stringify(snapshot, null, 2) + "\n");
    assert.equal(b.length, m.bytes);
    assert.equal(sha(b), m.sha256);
    materials.set(m.name, b);
  }
  const get = (n) => {
    assert(materials.has(n), "missing material " + n);
    return materials.get(n);
  };
  for (const pin of a.inputs) {
    const b = get("input:" + pin.file);
    assert.equal(b.length, pin.bytes);
    assert.equal(sha(b), pin.sha256);
    if (root) assert.deepEqual(fs.readFileSync(path.join(root, pin.file)), b);
  }
  for (const n of [
    "DESIGN.md",
    "initial.json",
    "protect.mjs",
    "capture.mjs",
    "source-audit.mjs",
    "source-audit-first.mjs",
    "seal.mjs",
    "runtime-pins.json",
    "report.md",
    "evidence.mjs",
  ])
    get(n);
  assert.equal(
    sha(get("DESIGN.md")),
    "28d057272b6741ab0488f6d8d854b340b154412ba4437e9210b1cf3fcbd82031",
  );
  const audit = JSON.parse(get("source-audit-captured.json"));
  assert.equal(audit.exitCode, 0);
  assert.equal(audit.commands.length, 41);
  assert.deepEqual(audit.inputPins, a.inputs);
  for (const r of audit.commands) {
    assert.equal(r.exit, 0);
    assert.equal(r.signal, null);
    assert.equal(r.error, null);
    decode(r.stdout);
    decode(r.stderr);
  }
  const pins = JSON.parse(get("runtime-pins.json"));
  assert.equal(pins.compiled.length, 98);
  for (const [key, name] of [
    ["report", "report.md"],
    ["newEvidenceAPI", "evidence.mjs"],
    ["firstAudit", "source-audit.json"],
  ]) {
    const pin = pins[key],
      b = get(name);
    assert.equal(b.length, pin.bytes);
    assert.equal(sha(b), pin.sha256);
    if (root && key !== "firstAudit")
      assert.deepEqual(fs.readFileSync(path.join(root, pin.file)), b);
  }
  assert.deepEqual(pins.references, a.references);
  const first = JSON.parse(get("source-audit.json"));
  assert.equal(first.exitCode, 0);
  assert.equal(first.commands.length, 41);
  for (const r of first.commands) {
    assert.equal(r.exit, 0);
    assert.equal(r.signal, null);
    decode(r.stdout);
    decode(r.stderr);
  }
  assert(a.captureLimitNotes.length === 1);
  assert.match(a.captureLimitNotes[0], /JSON.parse/);
  assert.match(
    decode(record("seal-and-readback-controls").stderr).toString(),
    /Identifier 'runtime' has already been declared/,
  );
  get("evidence-first.mjs");
  for (const ref of a.references) {
    assert(ref.file && ref.bytes > 0);
    assert.match(ref.sha256, /^[0-9a-f]{64}$/);
    if (root) {
      const b = fs.readFileSync(path.join(root, ref.file));
      assert.equal(b.length, ref.bytes);
      assert.equal(sha(b), ref.sha256);
    }
  }
  return {
    verified: true,
    captures: a.captures.length,
    streams: 2 * a.captures.length,
    materials: materials.size,
    rawGitCommands: audit.commands.length,
    inputs: a.inputs.length,
    productExecution: 0,
  };
}
export function checkEvidenceControls(a, options) {
  const positive = verifyEvidence(a, options),
    results = [];
  for (const [name, change] of [
    [
      "empty-archive",
      (x) => {
        x.captures = [];
      },
    ],
    [
      "missing-DOM",
      (x) => {
        x.captures = x.captures.filter((r) => r.name !== "frozen-DOM-baseline");
      },
    ],
    [
      "false-UI-green",
      (x) => {
        x.scope.DOM.passed = 6;
      },
    ],
    [
      "Q1-false-closed",
      (x) => {
        x.scope.Q1Closed = true;
      },
    ],
    [
      "bad-stream",
      (x) => {
        x.captures[0].stdout.sha256 = "0".repeat(64);
      },
    ],
    [
      "missing-input-material",
      (x) => {
        x.materials = x.materials.filter(
          (m) => m.name !== "input:" + x.inputs[0].file,
        );
      },
    ],
    [
      "tampered-DOM-count",
      (x) => {
        const r = x.captures.find((r) => r.name === "frozen-DOM-baseline"),
          v = JSON.parse(decode(r.stdout));
        v.executed = 6;
        const b = Buffer.from(JSON.stringify(v));
        r.stdout = {
          bytes: b.length,
          sha256: sha(b),
          gzipBase64: gzipSync(b).toString("base64"),
        };
      },
    ],
  ]) {
    const x = structuredClone(a);
    change(x);
    assert.throws(() => verifyEvidence(x, options));
    results.push({ name, rejected: true });
  }
  return { positive, negative: results, productExecution: 0 };
}
