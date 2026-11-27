// Explicit archive validation only. Importing this module executes no product.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
const sha = (b) => createHash("sha256").update(b).digest("hex");
function decode(b) {
  assert(
    b &&
      Number.isSafeInteger(b.bytes) &&
      b.bytes >= 0 &&
      /^[0-9a-f]{64}$/.test(b.sha256) &&
      typeof b.gzipBase64 === "string",
  );
  const raw = gunzipSync(Buffer.from(b.gzipBase64, "base64"));
  assert.equal(raw.length, b.bytes);
  assert.equal(sha(raw), b.sha256);
  return raw;
}
function capture(a, name) {
  const c = a.captures.find((c) => c.name === name);
  assert(c, "required capture " + name);
  return c;
}
function tap(a, name, expected) {
  const raw = decode(capture(a, name).stdout).toString(),
    values = ["tests", "pass", "fail", "skipped"].map((k) => {
      const m = raw.match(new RegExp("^# " + k + " (\\d+)$", "m"));
      assert(m, "TAP " + k);
      return Number(m[1]);
    });
  assert.deepEqual(values, expected, name);
}
const premiseCounts = {
  pagination: 11,
  actions: 9,
  multipage: 8,
  "pointer-rebind": 9,
  "deferred-bindings": 5,
  "uncommitted-render": 5,
  "sync-feedback": 4,
  "feedback-lifecycle": 5,
  "pointer-session": 3,
};
export function verifyEvidence(a, { root } = {}) {
  assert.equal(a.kind, "B49-C99-partial-context-ownership-evidence");
  assert.equal(a.fixedProduct, "887698bf1a82a1496b3af7eaede22a2abd68de82");
  assert.equal(a.firstFreeze, "e178afb0e0c67c9c7607069ce120d4c02f06f766");
  assert.equal(a.finalInput, "b466edf2ba1e7de1545bd334efbbc77fcc04eb75");
  assert.equal(a.helperRevision, "7661091145f110f2ec7ec68e7f2dbbd64be14b95");
  assert.equal(a.C99ClosedByB, false);
  assert.equal(a.Q1Closed, false);
  assert.equal(a.formalUIOracle, false);
  assert.equal(a.candidateUIExecuted, 0);
  assert.equal(a.CoreExecuted, 0);
  assert.equal(a.ElectronExecuted, 0);
  assert(Array.isArray(a.captures) && a.captures.length >= 35);
  assert.equal(new Set(a.captures.map((c) => c.name)).size, a.captures.length);
  let blocks = 0;
  function visit(x) {
    if (!x || typeof x !== "object") return;
    if (Object.hasOwn(x, "gzipBase64")) {
      decode(x);
      blocks++;
      return;
    }
    for (const v of Object.values(x)) visit(v);
  }
  visit(a.captures);
  visit(a.materials);
  assert(a.materials.length >= 10);
  assert.equal(
    new Set(a.materials.map((m) => m.name)).size,
    a.materials.length,
  );
  for (const c of a.captures) {
    assert(c.command?.length && path.isAbsolute(c.cwd));
    assert.equal(c.captureComplete, true);
    assert.equal(c.signal, null);
    assert.equal(c.error, null);
    assert(Number.isFinite(c.seconds) && c.seconds >= 0);
  }
  for (const [name, exit] of [
    ["worktree", 0],
    ["protect-before", 0],
    ["install", 0],
    ["build", 0],
    ["C99-before", 1],
    ["C99-after", 0],
    ["reentry-before", 1],
    ["C99-final", 0],
    ["C99-original-eleven", 1],
    ["normal-original", 0],
    ["normal-final", 0],
    ["async-close-original", 1],
    ["async-close-final", 0],
    ["fourteen-original", 1],
    ["fourteen-final", 0],
    ["related-node", 0],
    ["related-node-final", 0],
    ["B47-DOM-gate", 1],
    ["source-audit", 0],
  ])
    assert.equal(capture(a, name).exit, exit, name);
  for (const [name, counts] of [
    ["C99-before", [10, 1, 9, 0]],
    ["C99-after", [10, 10, 0, 0]],
    ["reentry-before", [1, 0, 1, 0]],
    ["C99-final", [11, 11, 0, 0]],
    ["C99-original-eleven", [11, 1, 10, 0]],
    ["normal-original", [2, 2, 0, 0]],
    ["normal-final", [2, 2, 0, 0]],
    ["async-close-original", [1, 0, 1, 0]],
    ["async-close-final", [1, 1, 0, 0]],
    ["fourteen-original", [14, 3, 11, 0]],
    ["fourteen-final", [14, 14, 0, 0]],
    ["related-node", [159, 159, 0, 0]],
    ["related-node-final", [162, 162, 0, 0]],
  ])
    tap(a, name, counts);
  const finalOutput = decode(capture(a, "fourteen-final").stdout).toString();
  assert.match(
    finalOutput,
    /"deliveries":1,"inactiveDeliveries":0,"releases":1/,
  );
  assert.match(finalOutput, /"navigation":1,"selection":1,"client":1/);
  assert.match(finalOutput, /"index":2,"releases":1,"disposed":true/);
  assert.match(
    decode(capture(a, "C99-before").stdout).toString(),
    /"index":2,"releases":0,"disposed":false/,
  );
  const audit = JSON.parse(
    decode(a.materials.find((m) => m.name === "source-audit.json")),
  );
  visit(audit);
  assert.equal(audit.exitCode, 0);
  assert.equal(audit.commands.length, 85);
  assert.equal(audit.changedPaths.length, 7);
  assert.equal(audit.freezeControlsUnchanged, true);
  assert.equal(audit.frozenStages.length, 4);
  assert.equal(audit.B48ImportedToA, false);
  assert.equal(audit.compiled.length, 98);
  assert.deepEqual(audit.inputPins, a.inputPins);
  assert.equal(a.inputPins.length, 67);
  assert.equal(new Set(a.inputPins.map((p) => p.file)).size, 67);
  assert.equal(audit.normative.bytes, 15412);
  assert.equal(
    audit.normative.sha256,
    "baa78949e5354e1ed384e0f57b141002c1f3c1391a1fd25a790dca9ed08de1db",
  );
  assert.equal(audit.originalHelper.sha256, a.originalHelper.sha256);
  assert.equal(audit.finalHelper.sha256, a.finalHelper.sha256);
  decode(a.originalHelper);
  decode(a.finalHelper);
  assert.notEqual(a.originalHelper.sha256, a.finalHelper.sha256);
  let passed = 0;
  for (const [d, count] of Object.entries(premiseCounts)) {
    const c = capture(a, "premise-" + d),
      r = JSON.parse(decode(c.stdout));
    assert.equal(c.exit, 0);
    assert.deepEqual(
      [r.planned, r.executed, r.passed, r.failed, r.blocked, r.skipped],
      [count, count, count, 0, 0, 0],
    );
    assert.deepEqual(r.cleanup.errors, []);
    assert.deepEqual(r.cleanup.unhandled, []);
    assert.deepEqual(r.releaseErrors, []);
    if (r.cleanup.globalErrors) assert.deepEqual(r.cleanup.globalErrors, []);
    if (d === "feedback-lifecycle")
      assert.deepEqual(r.controlPageErrors, [
        { message: "B43 deliberate native error control" },
        { message: "B43 deliberate unhandled rejection control" },
      ]);
    else if (d === "sync-feedback") {
      assert.deepEqual(r.controlPageErrors, [
        { name: "", message: "AggregateError" },
        { name: "", message: "AggregateError" },
      ]);
      assert.deepEqual(r.cleanup.boundaryEvents, [
        { name: "AggregateError", message: "" },
        { name: "AggregateError", message: "" },
      ]);
    } else if (r.controlPageErrors) assert.deepEqual(r.controlPageErrors, []);
    if (d !== "pagination")
      assert(r.results.every((x) => x.candidateUI === false));
    passed += r.passed;
  }
  assert.equal(passed, 59);
  assert.equal(audit.browserPassed, 59);
  const gate = JSON.parse(decode(capture(a, "B47-DOM-gate").stdout));
  assert.deepEqual(
    [
      gate.planned,
      gate.executed,
      gate.passed,
      gate.failed,
      gate.blocked,
      gate.skipped,
    ],
    [2, 0, 0, 0, 2, 0],
  );
  assert.match(gate.error, /missing production.*SourceCandidatesView/);
  assert.deepEqual(gate.gatePageErrors, []);
  assert.deepEqual(gate.releaseErrors, []);
  if (root) {
    assert(path.isAbsolute(root));
    for (const pin of [...a.inputPins, ...a.references, a.verificationAPI]) {
      assert(!path.isAbsolute(pin.file) && !pin.file.split("/").includes(".."));
      const b = fs.readFileSync(path.join(root, pin.file));
      assert.equal(b.length, pin.bytes);
      assert.equal(sha(b), pin.sha256);
    }
  }
  return {
    valid: true,
    captures: a.captures.length,
    materials: a.materials.length,
    verifiedBlocks: blocks,
    inputPins: 67,
    sourceGit: 85,
    original: [14, 3, 11],
    final: [14, 14, 0],
    relatedNode: 162,
    browserPremises: 59,
    candidateUIDOM: { planned: 2, executed: 0, blocked: 2 },
    C99ClosedByB: false,
    Q1Closed: false,
    productExecuted: 0,
  };
}
export function checkEvidenceControls(a) {
  verifyEvidence(a);
  const controls = [];
  const reject = (name, mutate) => {
    const b = structuredClone(a);
    mutate(b);
    assert.throws(() => verifyEvidence(b), name);
    controls.push({ name, rejected: true });
  };
  reject("empty", (b) => {
    for (const k of Object.keys(b)) delete b[k];
  });
  reject("C99 closed by wrong role", (b) => {
    b.C99ClosedByB = true;
  });
  reject("Q1 overclaim", (b) => {
    b.Q1Closed = true;
  });
  reject("first red omitted", (b) => {
    b.captures = b.captures.filter((c) => c.name !== "C99-before");
  });
  reject("original failure hidden", (b) => {
    b.captures.find((c) => c.name === "fourteen-original").exit = 0;
  });
  reject("stream checksum", (b) => {
    b.captures[0].stdout.sha256 = "0".repeat(64);
  });
  reject("input omitted", (b) => {
    b.inputPins.pop();
  });
  reject("forged model cleanup with recomputed valid stream checksum", (b) => {
    const c = b.captures.find((c) => c.name === "premise-pointer-session"),
      r = JSON.parse(decode(c.stdout));
    r.cleanup.errors.push("new cleanup error");
    const raw = Buffer.from(JSON.stringify(r));
    c.stdout = {
      bytes: raw.length,
      sha256: sha(raw),
      gzipBase64: gzipSync(raw).toString("base64"),
    };
  });
  return {
    positive: 1,
    negative: controls.length,
    controls,
    productExecuted: 0,
  };
}
