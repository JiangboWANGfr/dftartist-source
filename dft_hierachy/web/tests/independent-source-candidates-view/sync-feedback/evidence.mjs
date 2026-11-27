// Pure evidence API; explicitly import/call. Running this file is not verification.
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
  assert.equal(a.kind, "B42-synchronous-confirmation-feedback-partial-freeze");
  assert.deepEqual(a.fixed, {
    product: "e4e99c1d32cebd561e531b4c13a6dd4aff6df271",
    initialB: "8077277a4263a47a93c79c546d601d4828cc9aa7",
    freeze: "509d4d8c3d31b149145ee47a17ed88ee2eaa278f",
  });
  assert.deepEqual(a.scope, {
    nodeFacilities: 17,
    browserPremises: 4,
    historicalFacilities: 28,
    DOM: {
      planned: 2,
      executed: 0,
      passed: 0,
      failed: 0,
      blocked: 2,
      skipped: 0,
    },
    cumulativePlannedDOM: 98,
    historicalTypes: 30,
    Q1Closed: false,
    fullM5Passed: false,
    CoreCandidateUIExecuted: 0,
    ElectronPassed: false,
  });
  assert(a.captures.length >= 15);
  assert.equal(new Set(a.captures.map((r) => r.name)).size, a.captures.length);
  assert.deepEqual(
    a.captures.filter((r) => r.exit !== 0).map((r) => r.name),
    ["frozen-DOM-baseline"],
  );
  for (const r of a.captures) {
    assert.equal(r.exit, r.name === "frozen-DOM-baseline" ? 1 : 0);
    assert.equal(r.signal, null);
    assert.equal(r.error, null);
    assert.equal(r.captureComplete, true);
    assert(Array.isArray(r.command) && r.command.length);
    assert(path.isAbsolute(r.cwd));
    assert(Number.isFinite(r.seconds) && r.seconds >= 0);
    decode(r.stdout);
    decode(r.stderr);
  }
  const record = (name) => {
    const r = a.captures.find((r) => r.name === name);
    assert(r, "missing actual capture " + name);
    return r;
  };
  const json = (name) => JSON.parse(decode(record(name).stdout));
  function tap(name, n) {
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
    assert(lines.includes("1.." + n));
  }
  tap("frozen-node-facilities", 17);
  tap("related-historical-facilities", 28);
  const inventory = json("frozen-DOM-inventory");
  assert.equal(inventory.planned, 2);
  assert.deepEqual(
    inventory.cases.map((c) => c.id),
    ["S01", "S02"],
  );
  const controls = json("frozen-browser-premises");
  for (const [k, v] of Object.entries({
    planned: 4,
    executed: 4,
    passed: 4,
    failed: 0,
    blocked: 0,
    skipped: 0,
  }))
    assert.equal(controls[k], v);
  assert.equal(controls.fixed, a.fixed.product);
  assert.equal(controls.results.length, 4);
  assert.deepEqual(
    controls.results.map((r) => r.id),
    [
      "B42-real-Selection-1-listener",
      "B42-real-Selection-2-listener",
      "B42-actual-React-boundary-order",
      "B42-actual-React-same-stack-replacement",
    ],
  );
  assert.equal(controls.results[0].notifications, 1);
  assert.equal(controls.results[1].notifications, 2);
  assert(controls.results.every((r) => r.pass && r.candidateUI === false));
  assert.deepEqual(controls.cleanup, { errors: [], unhandled: [] });
  assert.deepEqual(controls.releaseErrors, []);
  const dom = json("frozen-DOM-baseline");
  for (const [k, v] of Object.entries(a.scope.DOM)) assert.equal(dom[k], v);
  assert.equal(dom.stage, "public-component-capability");
  assert.match(dom.error, /missing production.*SourceCandidatesView/);
  assert(dom.cssMissing);
  assert.deepEqual(dom.results, []);
  assert.deepEqual(dom.releaseErrors, []);
  assert.equal(dom.bundleSha256, controls.bundleSha256);
  assert.equal(
    dom.bundleSha256,
    "0da1a984ca5427546e4f423987b8ce87cb8b5300f107512abe9d101937c7df98",
  );
  const source = json("runtime-input-and-source-audit");
  assert.equal(source.exitCode, 0);
  assert.equal(source.fixedProduct, a.fixed.product);
  assert.equal(source.freeze, a.fixed.freeze);
  assert.equal(source.imports.length, 2);
  assert(source.imports.every((r) => r.rawBlobDeltaEqual));
  assert.equal(source.finalBlobEntries.length, 11);
  assert.equal(source.generatedDeclarationsEqual, true);
  assert.equal(source.generatedDeclarations.length, 49);
  assert.equal(source.frozenInputsUnchanged, true);
  assert.deepEqual(a.inputs, source.inputPins);
  assert.equal(a.inputs.length, 13);
  const guard = json("strict-protection");
  assert.equal(guard.protected, true);
  assert.deepEqual(guard.counts, [1327, 916, 1309]);
  assert.equal(guard.declarations, 49);
  assert.equal(guard.binaries.length, 3);
  const materials = new Map();
  for (const m of a.materials) {
    assert(!materials.has(m.name));
    materials.set(m.name, decode(m));
  }
  const get = (name) => {
    const b = materials.get(name);
    assert(b, "missing material " + name);
    return b;
  };
  for (const pin of a.inputs) {
    const b = get("input:" + pin.file);
    assert.equal(b.length, pin.bytes);
    assert.equal(sha(b), pin.sha256);
    if (root) assert.deepEqual(fs.readFileSync(path.join(root, pin.file)), b);
  }
  for (const name of [
    "initial.json",
    "protect.mjs",
    "capture.mjs",
    "source-audit.mjs",
    "runtime-pins.mjs",
    "seal.mjs",
    "report.md",
    "evidence.mjs",
  ])
    get(name);
  assert.equal(
    sha(get("DESIGN.md")),
    "71d09b8a317ac5e9b5853d5d1db902b027b546808d5a1ef5c7f5b410a2f34954",
  );
  const audit = JSON.parse(get("source-audit.json"));
  assert.equal(audit.exitCode, 0);
  assert.equal(audit.commands.length, 22);
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
  assert.deepEqual(pins.normativeContract, {
    unchangedFromB41: true,
    bytes: 15412,
    sha256: "baa78949e5354e1ed384e0f57b141002c1f3c1391a1fd25a790dca9ed08de1db",
  });
  assert.equal(get("source-audit.json").length, pins.sourceAudit.bytes);
  assert.equal(sha(get("source-audit.json")), pins.sourceAudit.sha256);
  assert.deepEqual(pins.references, a.references);
  for (const [key, name] of [
    ["report", "report.md"],
    ["newEvidenceAPI", "evidence.mjs"],
  ]) {
    const pin = pins[key],
      b = get(name);
    assert.equal(b.length, pin.bytes);
    assert.equal(sha(b), pin.sha256);
    if (root) assert.deepEqual(fs.readFileSync(path.join(root, pin.file)), b);
  }
  for (const pin of a.references) {
    assert(pin.file && pin.bytes > 0);
    assert.match(pin.sha256, /^[0-9a-f]{64}$/);
    if (root) {
      const b = fs.readFileSync(path.join(root, pin.file));
      assert.equal(b.length, pin.bytes);
      assert.equal(sha(b), pin.sha256);
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
    negative = [];
  for (const [name, mutate] of [
    [
      "empty-archive",
      (a) => {
        a.captures = [];
      },
    ],
    [
      "missing-DOM",
      (a) => {
        a.captures = a.captures.filter((r) => r.name !== "frozen-DOM-baseline");
      },
    ],
    [
      "false-UI-green",
      (a) => {
        a.scope.DOM.passed = 2;
      },
    ],
    [
      "Q1-false-closed",
      (a) => {
        a.scope.Q1Closed = true;
      },
    ],
    [
      "bad-stream",
      (a) => {
        a.captures[0].stdout.sha256 = "0".repeat(64);
      },
    ],
    [
      "missing-input-material",
      (a) => {
        a.materials = a.materials.filter(
          (m) => m.name !== "input:" + a.inputs[0].file,
        );
      },
    ],
    [
      "tampered-DOM-count",
      (a) => {
        const r = a.captures.find((r) => r.name === "frozen-DOM-baseline"),
          v = JSON.parse(decode(r.stdout));
        v.executed = 2;
        const b = Buffer.from(JSON.stringify(v));
        r.stdout = {
          bytes: b.length,
          sha256: sha(b),
          gzipBase64: gzipSync(b).toString("base64"),
        };
      },
    ],
  ]) {
    const changed = structuredClone(a);
    mutate(changed);
    assert.throws(() => verifyEvidence(changed, options));
    negative.push({ name, rejected: true });
  }
  return { positive, negative, productExecution: 0 };
}
