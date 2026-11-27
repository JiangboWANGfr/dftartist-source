// Pure archive API; import and explicitly call it. Not a product test.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const sha = (b) => createHash("sha256").update(b).digest("hex"),
  decode = (m) => {
    const b = gunzipSync(Buffer.from(m.gzipBase64, "base64"));
    assert.equal(b.length, m.bytes);
    assert.equal(sha(b), m.sha256);
    return b;
  };
export function verifyEvidence(a, { root } = {}) {
  assert.equal(a.kind, "B44-uncommitted-render-partial-freeze");
  assert.deepEqual(a.fixed, {
    product: "7e79435a2bfd2e9da85d75a81790374c3bda25de",
    initialB: "5190002d9be7e441d38774a519ee5c0bf4fe5ade",
    freeze: "52ae45cfe5a4c8fa7cf6e6ea5f515cf5004237a1",
    plainAdaptation: "7cc75a63c5321ff5189f6c4d061e9a2ee6000d0e",
    revision: "fa52c594bdca96233f3fe995b9e9ff78eeee1520",
  });
  assert.deepEqual(a.scope, {
    nodeFacilities: 12,
    browserPremises: 5,
    historicalFacilities: 30,
    DOM: {
      planned: 3,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: 3,
      skipped: 0,
    },
    cumulativePlannedDOM: 104,
    historicalTypes: 30,
    Q1Closed: false,
    fullM5Passed: false,
    CoreCandidateUIExecuted: 0,
    ElectronPassed: false,
  });
  assert(a.captures.length >= 22);
  assert.equal(new Set(a.captures.map((r) => r.name)).size, a.captures.length);
  assert.deepEqual(
    a.captures
      .filter((r) => r.exit !== 0)
      .map((r) => r.name)
      .sort(),
    [
      "frozen-browser-premises",
      "frozen-DOM-baseline",
      "corrected-DOM-baseline",
      "runtime-input-and-source-audit",
      "scoped-DOM-baseline",
    ].sort(),
  );
  for (const r of a.captures) {
    assert.equal(
      r.exit,
      [
        "frozen-browser-premises",
        "frozen-DOM-baseline",
        "corrected-DOM-baseline",
        "runtime-input-and-source-audit",
        "scoped-DOM-baseline",
      ].includes(r.name)
        ? 1
        : 0,
    );
    assert.equal(r.signal, null);
    assert.equal(r.error, null);
    assert.equal(r.captureComplete, true);
    assert(path.isAbsolute(r.cwd));
    assert(Array.isArray(r.command) && r.command.length);
    assert(r.seconds >= 0);
    decode(r.stdout);
    decode(r.stderr);
  }
  const record = (name) => {
      const r = a.captures.find((r) => r.name === name);
      assert(r, "missing " + name);
      return r;
    },
    json = (name) => JSON.parse(decode(record(name).stdout));
  for (const [name, n] of [
    ["scoped-node-facilities", 12],
    ["related-historical-facilities", 30],
  ]) {
    const lines = decode(record(name).stdout).toString().split("\n");
    for (const [k, v] of Object.entries({
      tests: n,
      pass: n,
      fail: 0,
      cancelled: 0,
      skipped: 0,
      todo: 0,
    }))
      assert(lines.includes("# " + k + " " + v));
  }
  const inventory = json("scoped-DOM-inventory");
  assert.equal(inventory.planned, 3);
  assert.deepEqual(
    inventory.cases.map((c) => c.id),
    ["U01", "U02", "U03"],
  );
  const first = json("frozen-browser-premises");
  assert(first.error.includes("Element type is invalid"));
  assert.equal(first.cleanup.globalErrors.length, 2);
  assert.equal(first.controlPageErrors.length, 2);
  assert.deepEqual(first.releaseErrors, []);
  const controls = json("scoped-browser-premises");
  for (const [k, v] of Object.entries({
    planned: 5,
    executed: 5,
    passed: 5,
    failed: 0,
    blocked: 0,
    skipped: 0,
  }))
    assert.equal(controls[k], v);
  assert.deepEqual(
    controls.results.map((r) => r.id),
    [
      "B44-real-ready-original-tuple-premise",
      "B44-ordinary-React-Suspense-abandon",
      "B44-ordinary-React-Suspense-replace",
      "B44-ordinary-React-Suspense-resume",
      "B44-ordinary-React-passive-command-negative",
    ],
  );
  assert(controls.results.every((r) => r.pass && r.candidateUI === false));
  assert.deepEqual(controls.cleanup, {
    errors: [],
    globalErrors: [],
    unhandled: [],
  });
  assert.deepEqual(controls.controlPageErrors, []);
  assert.deepEqual(controls.releaseErrors, []);
  for (const name of [
    "frozen-DOM-baseline",
    "corrected-DOM-baseline",
    "scoped-DOM-baseline",
  ]) {
    const dom = json(name);
    for (const [k, v] of Object.entries(a.scope.DOM)) assert.equal(dom[k], v);
    assert.equal(dom.stage, "public-component-capability");
    assert(dom.error.includes("missing production"));
    assert(dom.cssMissing);
    assert.deepEqual(dom.results, []);
    assert.deepEqual(dom.gatePageErrors, []);
    assert.deepEqual(dom.releaseErrors, []);
  }
  assert.equal(json("scoped-DOM-baseline").bundleSha256, controls.bundleSha256);
  assert.equal(
    controls.bundleSha256,
    "bbb34dcc653cbc09ea43c3e1fb605edd82105ea6c59f4885115edb6c4b9e26d2",
  );
  assert(
    decode(record("runtime-input-and-source-audit").stderr)
      .toString()
      .includes("Identifier 'old' has already been declared"),
  );
  const source = json("scoped-runtime-input-and-source-audit");
  assert.equal(source.exitCode, 0);
  assert.equal(source.fixedProduct, a.fixed.product);
  assert.equal(source.freeze, a.fixed.freeze);
  assert.equal(source.revision, a.fixed.revision);
  assert.equal(source.imports.length, 7);
  assert(source.imports.every((r) => r.rawBlobDeltaEqual));
  assert.equal(source.finalBlobEntries.length, 23);
  assert.equal(source.originalInputs, 9);
  assert.equal(source.generatedDeclarations.length, 49);
  assert.equal(source.compiled98Unchanged, true);
  assert.equal(source.initialAdaptationOnlyPlainArgument, true);
  assert.equal(source.runtimeInputsUnchanged, true);
  assert.deepEqual(a.inputs, source.inputPins);
  assert.equal(a.inputs.length, 15);
  const materials = new Map();
  for (const m of a.materials) {
    assert(!materials.has(m.name));
    const b = decode(m);
    materials.set(m.name, b);
    if (root && m.file)
      assert.deepEqual(fs.readFileSync(path.join(root, m.file)), b);
  }
  const get = (n) => {
    assert(materials.has(n), "missing material " + n);
    return materials.get(n);
  };
  for (const p of a.inputs) {
    const b = get("input:" + p.file);
    assert.equal(b.length, p.bytes);
    assert.equal(sha(b), p.sha256);
    if (root) assert.deepEqual(fs.readFileSync(path.join(root, p.file)), b);
  }
  for (const name of [
    "initial.json",
    "protect.mjs",
    "capture.mjs",
    "source-audit-first.mjs",
    "source-audit.mjs",
    "runtime-pins.mjs",
    "seal.mjs",
    "report.md",
    "evidence.mjs",
  ])
    get(name);
  assert.equal(
    sha(get("DESIGN.md")),
    "cf4e54a311bd25f2ccae0dc975d081fbe47bfe14befdf8db2a992502d206a5a5",
  );
  const audit = JSON.parse(get("source-audit.json"));
  assert.equal(audit.exitCode, 0);
  assert.equal(audit.commands.length, 49);
  assert.deepEqual(audit.inputPins, a.inputs);
  for (const r of audit.commands) {
    assert.equal(r.exit, 0);
    assert.equal(r.signal, null);
    assert.equal(r.error, null);
    decode(r.stdout);
    decode(r.stderr);
  }
  for (const m of audit.originalInputs) decode(m);
  const pins = JSON.parse(get("runtime-pins.json"));
  assert.equal(pins.compiled.length, 98);
  assert.equal(get("source-audit.json").length, pins.sourceAudit.bytes);
  assert.equal(sha(get("source-audit.json")), pins.sourceAudit.sha256);
  assert.deepEqual(pins.normativeContract, {
    unchangedFromB43: true,
    bytes: 15412,
    sha256: "baa78949e5354e1ed384e0f57b141002c1f3c1391a1fd25a790dca9ed08de1db",
  });
  assert.deepEqual(pins.references, a.references);
  for (const [k, n] of [
    ["report", "report.md"],
    ["newEvidenceAPI", "evidence.mjs"],
  ]) {
    const b = get(n);
    assert.equal(b.length, pins[k].bytes);
    assert.equal(sha(b), pins[k].sha256);
  }
  for (const p of a.references)
    if (root) {
      const b = fs.readFileSync(path.join(root, p.file));
      assert.equal(b.length, p.bytes);
      assert.equal(sha(b), p.sha256);
    }
  const guard = json("strict-protection");
  assert.equal(guard.protected, true);
  assert.deepEqual(guard.counts, [1361, 948, 1343]);
  assert.equal(guard.declarations, 49);
  assert.equal(guard.binaries.length, 3);
  return {
    verified: true,
    captures: a.captures.length,
    streams: 2 * a.captures.length,
    materials: materials.size,
    rawGitCommands: 49,
    inputs: a.inputs.length,
    productExecution: 0,
  };
}
export function checkEvidenceControls(a, options) {
  const positive = verifyEvidence(a, options),
    negative = [];
  for (const [name, mutate] of [
    ["empty-archive", (a) => (a.captures = [])],
    [
      "lost-first-failure",
      (a) =>
        (a.captures = a.captures.filter(
          (r) => r.name !== "frozen-browser-premises",
        )),
    ],
    ["false-UI-green", (a) => (a.scope.DOM.passed = 3)],
    ["false-Q1-close", (a) => (a.scope.Q1Closed = true)],
    ["bad-stream", (a) => (a.captures[0].stdout.sha256 = "0".repeat(64))],
    [
      "missing-original-script",
      (a) =>
        (a.materials = a.materials.filter(
          (m) => m.name !== "source-audit-first.mjs",
        )),
    ],
    [
      "missing-input",
      (a) =>
        (a.materials = a.materials.filter((m) => !m.name.startsWith("input:"))),
    ],
  ]) {
    const c = structuredClone(a);
    mutate(c);
    assert.throws(() => verifyEvidence(c, options));
    negative.push({ name, rejected: true });
  }
  return { positive, negative, productExecution: 0 };
}
